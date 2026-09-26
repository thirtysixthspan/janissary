# Scope the pending route chooser to the tab that raised it

**Complexity: 3/10**: one manager changes how it claims, checks, and releases a single slot, and joins the tab-release list. No wire change, no client change, and no new module.

`CommandManager` in `src/command/manager.ts` holds one app-wide `pendingRoute` slot, set by the callback `resolveUnknownCommand` (`src/command/router.ts`) invokes when a command is too ambiguous to route. Three things go wrong with it today. The next unknown command in any tab overwrites the slot unconditionally, so the first tab's already-dequeued command is lost without a word. `drainQueue` passes `() => this.pendingRoute !== null` to `drainQueueOp` (`src/command/queue.ts`), so every tab's queue stops draining while any chooser is open, yet `chooseRoute` resumes only the owning tab, leaving another tab's queue stalled until something else makes it idle. And `command` is not in `MANAGER_TAB_RELEASE` (`src/managers.ts`), so closing the owning tab leaves a chooser for a tab that no longer exists.

## Goal

The chooser belongs to the tab that raised it. Only that tab's queue pauses while it is open. A second unknown command, from any tab, never replaces it; that command is refused with a visible message instead. Closing the owning tab drops the chooser.

## Approach

1. **Claim, don't overwrite.** The callback `CommandManager.run` hands `resolveUnknownCommand` becomes a private `holdRoute(pending)`. When the slot is empty it takes the claim as before. When the slot is already held, it leaves the slot alone and appends `{ input: <cmd>, output: 'Another command is waiting for a route choice; run this again once it is answered.' }` to the transcript of the tab that raised the second command. This applies whether the second command came from another tab or from the owning tab itself (a scheduled firing, say), because either one would otherwise silently discard the command already waiting on the chooser. The command bar is modal while the chooser is open, so a user at the keyboard cannot reach this path; it is scheduled, queued, and dispatched commands that do.
2. **Pause only the owner.** `drainQueue(label)` passes `() => this.pendingRoute?.label === label` to `drainQueueOp`. Every other tab's queue keeps draining. `chooseRoute` still resumes only the owning tab, which is now correct because nothing else was paused.
3. **Release on close.** `CommandManager.closeTab(label: string): void` clears the slot when it belongs to `label` and emits `state` `dirty` so the overlay dismisses. `'command'` joins `MANAGER_TAB_RELEASE`; the `MANAGER_TAB_RELEASE_IS_TYPED` compile-time check confirms the signature.

The chooser text itself stays global, since `routeView` feeds one app-level overlay; that is unchanged.

### Rejected alternatives

- Requeueing the second command at the head of its tab's queue instead of refusing it. It would silently retry later, but for the owning tab it would re-raise the same kind of ambiguity the moment the drain resumed, and for a non-agent tab there is no queue to put it in. A visible message is predictable on every tab kind.
- A per-tab map of pending choosers. The client has one overlay and the wire carries one `route`, so a map would need a wire and UI change to be useful. Out of proportion to the defect.

## Implementation steps

1. In `src/command/manager.ts`, add `holdRoute`, route the `resolveUnknownCommand` callback through it, change the `drainQueue` predicate, and add `closeTab`. Update the drain comments there and on `drainQueueOp` in `src/command/queue.ts` to say the pause is the owning tab's.
2. In `src/managers.ts`, add `'command'` to `MANAGER_TAB_RELEASE`.
3. In `src/tab/cleanup.test.ts`, give `makeManagers` a `command: { closeTab: vi.fn() }` stub and drop `command` from the list of managers the walk test blanks out. The other fixtures that stub every tab-release manager and then close a tab need the same stub: `src/tab/manager.test.ts`, `src/plugins/grouping.test.ts`, `src/plugins/notifications.test.ts`, `src/plugins/teardown.test.ts`, and `src/plugins/update-tab.test.ts`.
4. Add the tests below and run `./scripts/run.mjs check-diff`.

## Tests

`src/command/manager.test.ts`, a new `describe` using the real router (`select 1 as n` with no database open is ambiguous and opens the chooser) and a second tab inserted beside `janus`:

- with tab A's chooser open, tab B's queue drains when B goes idle;
- with tab A's chooser open, an unknown command dispatched to tab B leaves A's chooser in place and appends the refusal message to B's transcript;
- an unknown command in the owning tab itself while its chooser is open is refused the same way and does not replace the chooser;
- `closeTab` for the owning tab clears the chooser and emits `state` `dirty`; `closeTab` for another tab leaves it alone.

The existing "stops the drain while a route is pending and resumes via chooseRoute" case and the route cases in `src/controller.test.ts` stay unchanged and passing. `src/tab/cleanup.test.ts` and `src/managers.test.ts` cover the release-list membership.

## Spec updates

- `product/specs/agent-command-queue.md`: the drain pauses only in the tab whose dequeued command opened the chooser; other tabs keep draining.
- `product/specs/command-routing.md`, "Route chooser": the chooser belongs to its originating tab; while it is open a second unknown command from any tab is refused with the verbatim message and the chooser is not replaced; closing the originating tab drops the chooser.

## Documentation

- `documentation/user-documentation/command-bar/queue.md` says "A route chooser pauses the queue"; make it say the chooser pauses its own tab's queue and other tabs keep draining.
- `documentation/user-documentation/command-bar/shell.md` documents the chooser; add the refusal message a second unrecognized command gets while one is open.

## Out of scope

- One chooser per tab shown simultaneously, which would need a wire and overlay change.
- Commands arriving through agent messages, which classify with `recognizeRoute` in `CaptureManager` and never open the chooser.
