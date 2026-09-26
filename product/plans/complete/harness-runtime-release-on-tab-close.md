# Release a harness tab's runtime when the tab closes, not only when its PTY exits

**Complexity: 4/10** — one new server module that takes over `HarnessManager`'s runtime map, a `closeTab` on the manager, one entry added to the tab-release list, and test and spec updates. No wire, client, or command change.

`HarnessManager` in `src/harness/manager.ts` keeps its per-PTY `HarnessRuntime`s (screen reader, asciicast recorder, transcript tailer, auto-approver, e2e browser) in a `Map<string, HarnessRuntime>` keyed by PTY id, and disposes an entry only from its `pty exit` bus subscription. It has no `closeTab`, so it is absent from `MANAGER_TAB_RELEASE` in `src/managers.ts`. A local tab gets away with that because `PseudoterminalManager.closeTab` kills the PTY and the exit event follows. A remote harness does not: `detachRemoteEntry` in `src/remote/attach.ts` disconnects the channel first, so the `kill` frame sent when the tab-close walk reaches `pty` is dropped and no exit event ever arrives. Every detach therefore leaves the recording stream open and the transcript tailer's two-second poll running for the life of the process. Reattaching under the same PTY id then overwrites the map entry without disposing the old runtime, and the orphaned recorder, still subscribed to the reused id, appends the resumed session's output to the previous recording file.

## Goal

A harness or ssh tab's runtime is disposed when its tab closes, whatever happens to its PTY, and a runtime installed under a PTY id that already holds one disposes the old one first. The exit-driven release stays as it is, so a PTY that exits on its own still releases its runtime immediately.

## Approach

1. **New module `src/harness/runtime-registry.ts`** exporting a `HarnessRuntimes` class that owns the runtime map and its exit subscription, moved out of `HarnessManager`:
   - entries are `{ label, runtime }` keyed by PTY id, so a tab-close release can find its runtimes without the tab record (which the close walk is in the middle of removing);
   - `install(id, label, runtime)` releases any runtime already stored under `id`, then stores the new one;
   - `get(id)` returns the stored runtime;
   - `closeTab(label)` releases every entry recorded for that label;
   - `dispose()` unsubscribes from the bus and releases every entry;
   - a private `release(id)` disposes and deletes one entry, shared by all four paths and by the `pty exit` subscription.

   `HarnessManager` sits at 197 counted lines, so adding the label bookkeeping and `closeTab` in place would push it past the 200-line limit; moving the map and its subscription into their own module keeps the manager to delegation.

2. **`HarnessManager`** holds a `HarnessRuntimes` instead of the map and subscription. Its constructor no longer subscribes, `dispose()` delegates, the two `runtimes.set(...)` sites (`registerSshObservers` and `finishSpawn`) become `runtimes.install(id, label, ...)`, and a new `closeTab(label: string): void` delegates to the registry.

3. **`MANAGER_TAB_RELEASE`** in `src/managers.ts` gains `'harness'`, placed right after `'pty'`, so the PTY is killed before its observers and browser are released — the same order the exit-driven path produces today. The compile-time `MANAGER_TAB_RELEASE_IS_TYPED` check confirms the new method.

4. **Double release is harmless.** `HarnessRuntime.dispose` already guards with a `disposed` flag, and `release` deletes the entry, so a local tab's late exit event after `closeTab` finds nothing to release.

5. **Stale comment.** The class comment on `HarnessRuntime` in `src/harness/runtime.ts` says closing a `-b` tab releases the runtime through the exit event, with no line in the tab-close walk. Update it to say the tab-close walk releases it through `HarnessManager.closeTab`, with the exit event as the other path.

Rejected alternative: looking the runtime up through the tab's `harness.ptyId` at close time instead of recording the label. The id is empty while a tab is still provisioning, and the lookup would depend on the tab record still being reachable during the close walk. Recording the label beside each runtime has neither problem.

## Implementation steps

1. Add `src/harness/runtime-registry.ts` with `HarnessRuntimes`.
2. Switch `src/harness/manager.ts` to it and add `closeTab`.
3. Add `'harness'` to `MANAGER_TAB_RELEASE` in `src/managers.ts` after `'pty'`.
4. Update the class comment in `src/harness/runtime.ts`.
5. Update `src/tab/cleanup.test.ts`: its manager fake gains `harness: { closeTab }`, and `'harness'` leaves the list of managers it blanks out.
6. Add `harness: { closeTab: vi.fn() }` to the hand-built manager fakes of the other test files whose cases close a tab through the walk: `src/tab/manager.test.ts`, `src/plugins/grouping.test.ts`, `src/plugins/notifications.test.ts`, `src/plugins/teardown.test.ts`, and `src/plugins/update-tab.test.ts`. Each lists every manager the walk reaches, so each needs the new member.
7. Update `product/specs/harness-recording.md`, `product/specs/harness.md`, and `product/specs/remote-server.md`.

## Tests

- `src/harness/runtime-registry.test.ts` (new): a `pty exit` for an installed id disposes its runtime and drops it; `install` under an id already held disposes the previous runtime and keeps the new one; `closeTab` disposes every runtime recorded for that label and leaves other labels' runtimes alone; a later exit for an id already released by `closeTab` disposes nothing again; `dispose` releases everything and ignores later exit events.
- `src/harness/manager.test.ts`: `closeTab` on a harness tab disposes its reader, recorder, and tailer once, and clears `latestScreenText` and `transcriptTailer`; a late exit for that PTY after `closeTab` does not dispose the recorder again; `closeTab` on an ssh tab's label releases its observers; a second harness spawned under the same PTY id disposes the first runtime's recorder and leaves the second one live.
- `src/sessions/harness-roundtrip.test.ts`: the mocked `harnessRuntime` records each runtime it builds; the detach test asserts the runtime is disposed on detach, and the two-cycle detach/attach test asserts every earlier runtime was disposed exactly once while the current one is still live.
- `src/tab/cleanup.test.ts`: `closeTabResources` calls `harness.closeTab` with the tab's label.

## Out of scope

- Recording the gap while a remote harness is detached; there is still no local process to write it.
- Moving per-PTY runtime state onto the tab record. The map stays keyed by PTY id on the manager that owns it; this change only makes its release symmetric with the tab's lifetime.
- The other managers absent from `MANAGER_TAB_RELEASE`.
