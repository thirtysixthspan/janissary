# Remove a tab's persisted state when the tab is closed

**Complexity: 5/10** — two stores gain a per-label delete beside their existing per-label write, tab teardown calls both, and one guard stops a late write recreating what the close removed. Five source files plus their tests; no wire change, no format change, no change to what a still-open tab persists.

## Goal

Make `--relaunch` restore the tabs that were open, rather than every tab that has ever existed in the session.

## Approach

`src/agent/state.ts` offers `saveAgentState`, `loadAgentState`, `listAgentStates`, and `clearStateDirectory` — the last removing the whole `.janissary/state` directory, which `main.ts` calls once at startup and only when `--relaunch` was not passed. `TranscriptStore` is the same shape: `save`, `load`, a `clearTab` that writes `[]` rather than removing the file, and a static whole-directory `clear`. Neither has a per-tab delete, so `closeTabResources` — which releases the workspace clone, shell, ACP, editor watch, browser, remote channel, PTY, navigator, schedule, questions, and database bindings — has nothing to call, and `rehydrateTabState` rebuilds the tab list from every `<name>.json` `listAgentStates` finds. Every tab the user closes stays on disk and comes back on the next `--relaunch`.

Add the missing delete to each store and call both from tab teardown. `deleteAgentState` reuses `agentStatePath`'s name guard so an invalid label cannot address a file outside the state directory, and `TranscriptStore.remove` reuses its own for the same reason.

Two write paths can land after the delete. `ShellManager.run`'s `update` closure persists the `tab` object it captured at dispatch, so a command completing after its tab closed rewrites the file the close just removed — making the resurrection certain rather than merely possible. `ScheduleManager.tick` persists per tab on its one-second loop. Both go through `TabManager.persist`, which is the single write path into the state directory, so one guard covers both: `AgentStatePersistence` holds the set of closed labels and refuses a write for one, exactly the way it already refuses a remote tab's.

That mark has to lift, because a closed tab's name returns to the 52-name pool and can be handed to a new tab. `TabManager.persist` lifts it whenever a tab is actually open under that label — a live-list check at the one place every write passes through, rather than a second hook on the many places tabs are created.

Quitting must keep persisting everything still open, so the delete belongs to `closeTabResources` alone. `Controller.shutdown` only disposes managers and never calls it, and `quit` does not go through `closeTab` at all. Closing the *last* tab does quit, and does delete that tab's state — which is right: it was closed.

## Implementation steps

1. In `src/agent/state.ts`, add `deleteAgentState(name)` beside `saveAgentState`, removing the file `agentStatePath` names and tolerating both an absent file and an invalid label.
2. In `src/transcript/store.ts`, add a static `remove(label)` that removes the file rather than rewriting it as `[]`, and clears the label's suppressed-warning mark.
3. In `src/tab/persistence.ts`, hold the set of closed labels: `forget(name)` marks one and `reopen(name)` lifts the mark, and `save` refuses a marked label alongside its existing remote-tab refusal.
4. Add `src/tab/manager-persistence.ts` holding `persistAgentState(persistence, tabs, state)` — the one decision every write passes through, lifting the mark when a tab is open under the label. `TabManager.persist` delegates to it and `forgetPersisted` exposes the marking for `closeTabResources`. Extracted rather than written inline because the additions push `manager.ts` past the file-size limit.
5. In `src/tab/cleanup.ts`, mark the label closed and then delete both files — marking first, so a write racing in from an async callback cannot recreate what is about to be removed.

## Tests

`src/tab/cleanup.test.ts` covers what teardown releases today and is where the removal cases belong:

- Closing a tab removes its agent-state file and its transcript file.
- The label is marked before the files are removed, so the guard is in place first.

- Closing a tab that was never persisted removes nothing and does not throw, and a neighbouring tab's files are untouched.

`src/tab/manager-persistence.test.ts` is new and tests each unit at its own seam. `persistAgentState` lifts the mark only for a label with an open tab, and still hands a state through when the list is empty — the rehydration case, where the mark was never set. `AgentStatePersistence` is exercised against a real temporary state directory, since the refusal lives inside `save`: a closed label writes nothing, a reopened one writes again, and only the closed label is refused.

`src/tab/manager.test.ts` covers rehydration from a stubbed `listAgentStates` and pins the restore behavior that must not change for tabs that were still open; it needs no change and must keep passing.

## Spec updates

`product/specs/state-directory.md` — state that closing a tab removes its agent-state and transcript files, so `--relaunch` restores what was open rather than everything that ever was, and that a write arriving after a tab closed is dropped rather than recreating its file. `product/specs/relaunch.md` — note that the listing it walks contains only tabs that were open when the session ended.

## Docs

`documentation/user-documentation/getting-started/startup.md` lists what `--relaunch` restores and what does not come back. Its "as you left them" claim was not true before this change; the "what doesn't come back" list is extended in place with closed tabs, and notes that quitting closes nothing so everything still open is restored. `help.md` does not cover relaunch's restore set.

## Out of scope

- The shutdown path, which must keep persisting every tab still open.
- `clearStateDirectory` and `TranscriptStore.clear`, the whole-directory startup wipes, which are unchanged.
- Persisting anything a tab does not persist today.
