# Wire the quit entry point, retire the one-button dialog, and keep Cmd+W inert

**Complexity: 3/10** — client-only wiring over refs subplan `06` already publishes: the quit guard swaps its dialog state for a call-time ref read with a fallback, the one-button dialog and three App/AppMain props are deleted, and `useCmdWRefs` gains a live getter. Correctness hinges on reading both refs at call/access time and on updating every caller and test of the two changed signatures in the same checkpoint.

## Goal

Make every whole-app quit trigger use the walk:

- `useUnsavedQuitGuard.guardedOpenQuitConfirm` calls `quitWalkRef.current?.()` when any tab is dirty. If the walk starts, it does nothing else. If it returns false, or no guard is mounted, it falls back to the plain `openQuitConfirm`.
- When no tab is dirty, it calls `openQuitConfirm` directly, exactly as today.
- The old `unsavedQuitOpen`, `confirmUnsavedQuit`, and `cancelUnsavedQuit` state and handlers are removed with `UnsavedQuitDialog`.
- `AppMain` stops rendering `UnsavedQuitDialog` and drops its props.
- `useCmdWRefs` takes `saveWalkOpenRef` in place of `unsavedQuitOpen` and makes `quitConfirmOpenRef` a live getter over `quitConfirmOpen` or `saveWalkOpenRef.current`, so Cmd+W is inert for the whole walk, including between steps.

No caller of `guardedOpenQuitConfirm` changes. It is already the single entry point for typed `quit`, typed last-tab `close`/`exit` (bare, slashed, or named), the tab strip's ×, Cmd+W/Ctrl+W, and page-view/plugin close controls through `App.closeTab`.

## Dependencies and ordering

This subplan depends on `01` through `07`, all already implemented on this branch:

- `01-move-unsaved-work-modules` moved the quit guard to `web/src/unsaved-work/useUnsavedQuitGuard.ts` and its test beside it;
- `05-save-confirm-request-state` and `06-quit-walk-guard` added the walk's `start` (`web/src/unsaved-work/useQuitWalk.ts`), which `CloseSaveGuard` publishes through `quitWalkRef`, and created `quitWalkRef`, `saveWalkOpenRef`, and `onQuit` in `App.tsx`;
- `07-focus-suppression-during-walk` already passes `saveWalkOpenRef` to `useFocusOnTabSwitch` (`App.tsx:169`), so the walk's tab switches do not steal focus once this subplan makes the walk reachable.

Land the work in two checkpoints so typecheck and tests stay green at each one:

1. `useCmdWRefs` signature change, together with the `useCmdWRefs` call in `App.tsx`, `useCmdWRefs.test.ts`, and `useCmdW.test.tsx`. `App` passes `saveWalkOpenRef` in the third position at this point, while `unsavedQuitOpen` still exists but is no longer passed to `useCmdWRefs`.
2. The quit guard rewrite, together with the `useUnsavedQuitGuard` call and destructuring in `App.tsx`, the `AppMain` prop removal, the deletion of `UnsavedQuitDialog.tsx` and its test, the guard test rewrite, and the two `App.test.tsx` assertion swaps. Removing the hook's return fields without the App/AppMain edits in the same checkpoint breaks typecheck.

At the end of this subplan the feature is user-visible and the old one-button dialog is gone.

## Design decisions

### Quit entry point

- `useUnsavedQuitGuard` keeps its `beforeunload` effect unchanged. It still prevents the default only when `anyDirtyTab(tabs, tabHandles)` is true for the browser's own close/reload/navigation path; no in-app dialog can intercept that path.
- Its signature becomes `(tabs, tabHandles, openQuitConfirm, quitWalkRef)`, with `quitWalkRef` typed `React.RefObject<(() => boolean) | null>` — the type of `App.tsx:127` `const quitWalkRef = useRef<(() => boolean) | null>(null)` and of `CloseSaveGuard`'s `quitWalkRef` prop. The fourth parameter replaces `runCommand`.
- `guardedOpenQuitConfirm` does:
  - if `anyDirtyTab(tabs, tabHandles)` is true, call `quitWalkRef.current?.()` and remember the boolean result;
  - if the result is true, return without opening the plain dialog;
  - otherwise call `openQuitConfirm()`.
- `quitWalkRef.current` must be read inside the callback at call time, never captured during render. `CloseSaveGuard` assigns it in an effect (`CloseSaveGuard.tsx:56-60`), which runs after `App`'s render, so a render-time read is null on first mount. Add `quitWalkRef` to the `useCallback` dependency list beside `tabs`, `tabHandles`, and `openQuitConfirm`; `react-hooks/exhaustive-deps` is an error in `eslint.config.mjs` and does not treat a ref passed in as a parameter as stable.
- The `anyDirtyTab` check happens before the ref call because a clean quit must not call into the guard at all. The fallback covers both the "dirty but the walk found nothing left to ask" case and the "no guard mounted" case, which the source plan requires.
- The quit guard does not check `saveWalkOpenRef` or the guard's request itself. `useQuitWalk`'s `start` (`useQuitWalk.ts:64-72`) already returns true without doing anything when a walk is running or any save-confirm request is open, so a second trigger in those states is a no-op rather than a restart or a plain-dialog fallback.
- The hook returns only `{ guardedOpenQuitConfirm }`. Delete the `unsavedQuitOpen` state, `confirmUnsavedQuit`, and `cancelUnsavedQuit`; the dialog they served is deleted.
- `useUnsavedQuitGuard` no longer imports `useState`. Quit execution is now the guard's `onQuit` prop, which `App` already defines at `App.tsx:125` (`const onQuit = useCallback(() => runCommand('quit'), [runCommand])`) and passes to `AppMain`; no new `onQuit` is needed.
- Rewrite the header comment at `useUnsavedQuitGuard.ts:7-13`. It currently says `quit` and closing the last tab "go straight to the quit dialog" and that "neither goes through `closeTab`", which is wrong (the last-tab close does go through `App.closeTab`) and describes the retired dialog. The new comment says: every whole-app quit trigger reaches this function; with any dirty tab it starts the save walk through `quitWalkRef`, falling back to the plain quit dialog when the walk does not start; with none it behaves exactly like `openQuitConfirm`; and it still arms `beforeunload`. Keep the existing `returnValue` explanation.

### Trigger paths and unchanged paths

- Every typed quit path already reaches `guardedOpenQuitConfirm`: `App.tsx:147` (`if (closeQuitsApp(tabs, index)) { guardedOpenQuitConfirm(); return; }`) and `App.tsx:188`, which passes it to `useAppCommandLine` as `openQuitConfirm: guardedOpenQuitConfirm`. `classifyCommandBarSubmit` returns `confirm-quit` for `quit` (`classify-submit.ts:54`) and for a close/exit of the last tab, including a named close of the last tab (`classify-submit.ts:36`), and `AppCommandBar.tsx:105` calls `openQuitConfirm()` on that verdict. No classifier change.
- The tab strip's ×, Cmd+W/Ctrl+W, and page-view/plugin close controls all reach `App.closeTab` (`App.tsx:140-150`), which still calls `guardedOpenQuitConfirm` before closing the last tab. No caller changes.
- A tab whose process exits on its own still carries `reason.terminalExited` and sends `closeTab` directly (`App.tsx:143-146`); it never enters the guard.
- Closing the managed system shell still bypasses both guards because `closeQuitsApp` (`src/tab/placement.ts:34`) excludes `systemShell` and `closeTab` checks `!tab.systemShell` before `guardRef` (`App.tsx:148`). The tab is hidden; no dialog is raised.
- A `quit` sent by a schedule or another tab still executes on the server without a client dialog and without the unsaved-changes guard. The client-side walk only covers user-triggered paths that run through `guardedOpenQuitConfirm`.
- The browser's native `beforeunload` prompt is unchanged.

### App and AppMain cleanup

- `App` changes `App.tsx:130-131` to destructure only `guardedOpenQuitConfirm` from `useUnsavedQuitGuard(tabs, tabHandles, openQuitConfirm, quitWalkRef)`. `quitWalkRef` is already declared above it at `App.tsx:127`. `runCommand` stays in `App`; it is still used by `usePickerOverlays`, `useQuitConfirm`, and `onQuit`.
- `App` removes `unsavedQuitOpen={unsavedQuitOpen}` (`App.tsx:208`) and the `confirmUnsavedQuit`/`cancelUnsavedQuit` line (`App.tsx:223`) from the `AppMain` props.
- `App` keeps `quitConfirmOpen`, `confirmQuit`, and `cancelQuit` for the plain quit dialog.
- `App` changes `App.tsx:132-134` to `useCmdWRefs(activeTab, quitConfirmOpen, saveWalkOpenRef, pickers.overlays)`. `saveWalkOpenRef` is declared at `App.tsx:128`, above the call.
- `AppMain` removes the `UnsavedQuitDialog` import (`AppMain.tsx:10`) and render (`AppMain.tsx:110`), removes `unsavedQuitOpen`, `confirmUnsavedQuit`, and `cancelUnsavedQuit` from `AppMainProps` (`AppMain.tsx:26`, `:49-50`) and from the destructuring (`AppMain.tsx:64`, `:72`), and keeps `CloseSaveGuard` (`AppMain.tsx:111-115`) with the props added in `06` unchanged.
- Delete `web/src/UnsavedQuitDialog.tsx` and `web/src/UnsavedQuitDialog.test.tsx`. Their only importers are `AppMain.tsx` and the test itself. `web/src/shared/ConfirmDialogShell.tsx` stays: `QuitDialog`, `DeleteFileDialog`, and `ConfirmDialog` still use it, so the deletion leaves no dead export.
- Both App files only shrink, so the 200-line limit is not a concern.

### Cmd+W suppression

- `useCmdWRefs` signature becomes `(activeTab, quitConfirmOpen, saveWalkOpenRef, overlays)`, with `saveWalkOpenRef` typed `React.RefObject<boolean>` (the type of `App.tsx:128` `useRef(false)` and of `CloseSaveGuard`'s prop).
- `quitConfirmOpenRef` becomes a getter object built once, exactly like `keyboardCapturedRef` at `web/src/useCmdWRefs.ts:16-18` (`useRef({ get current(): boolean { … } }).current`). Its getter reports true when the latest `quitConfirmOpen` is true or the latest `saveWalkOpenRef`'s `current` is true. Mirror both arguments into refs on every render, the way `overlaysRef` is mirrored at `useCmdWRefs.ts:13`, and have the getter read through those mirrors, so it sees a new `quitConfirmOpen` after a rerender, a flip of `saveWalkOpenRef.current` with no rerender, and a different ref object if a caller passes one on a later render. The returned object's identity stays stable across renders, as today.
- The getter object satisfies `useCmdW`'s `quitConfirmOpenRef: React.RefObject<boolean>` parameter the same way `keyboardCapturedRef` already does; `useCmdW` itself does not change.
- This replaces the old `quitConfirmOpenRef.current = quitConfirmOpen || unsavedQuitOpen` assignment at `useCmdWRefs.ts:15`. A per-render assignment could not see a ref flip without a rerender.
- Update the header comment at `useCmdWRefs.ts:4-6` to say `quitConfirmOpenRef` covers both the plain quit dialog and the whole quit walk.
- `useCmdW` already returns early when `quitConfirmOpenRef.current` is true, before calling `closeTab` (`useCmdW.ts:14`). The modal signal (`keyboardCapturedRef`, through `isModalOpen()`) covers the walk's dialog while it is mounted; the walk ref covers the moments the walk is running with no dialog mounted — between `start` and the first dialog's mount, and across the keyed remount between steps.
- Without this, Cmd+W in those moments reaches `App.closeTab` for the tab being asked about (the walk has just made it current). When other tabs remain, a dirty current tab goes through `guardRef`, whose `openClose` replaces the walk's request with a single-tab close request and clears `saveWalkOpenRef` (`CloseSaveGuard.tsx:42-52`), and a clean current tab is closed outright under the walk. On the last tab, the repeat `guardedOpenQuitConfirm` is a no-op because `start` returns true while the walk is open; the ref keeps that path inert too.
- `useCmdW.test.tsx` calls `useCmdWRefs` directly in two test components (`TestComponent` at line 23 and `ContributedOverlayShortcut` at line 41), so it must be updated for the new signature even though `useCmdW` is unchanged. Add one case there that proves a true `saveWalkOpenRef` suppresses Cmd+W, in addition to the ref-only cases in `useCmdWRefs.test.ts`.

### Test cleanup outside the source plan's test list

`web/src/App.test.tsx` has two assertions that the retired dialog's title is absent:

- line 201, in "sends a system tab close directly without quit or unsaved confirmation";
- line 311, in "routes typed close for a system tab to the server without opening client confirmation".

Those assertions would still pass after the deletion, but they would name a dialog that no longer exists. Replace each `queryByText('You have unsaved changes. Close anyway?')` with an assertion that no button named `Save (y)` (the walk dialog's first button, `SaveChangesDialog.tsx:54`) is present, while keeping the existing `Are you sure you want to quit?` absence assertion. This is a test-only cleanup forced by the deletion, not a behavior change. Keep both test names.

### Help and user documentation stay with `09`

`help/quit.md:21`, `documentation/user-documentation/command-bar/commands.md:176`, and `product/specs/quit-confirmation.md:28` still describe the "Close anyway" dialog after this subplan. Subplan `09` owns those edits. No check fails in between: no test compares help or documentation text to UI strings (`src/help-pages.test.ts` uses its own fixture text), and the only test strings naming the retired dialog are the two `App.test.tsx` assertions above and the deleted dialog test. So `08` makes no spec, help, or documentation edit.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Whole-app quit guard | `web/src/unsaved-work/useUnsavedQuitGuard.ts` (`guardedOpenQuitConfirm`, `beforeunload` effect) | Rewritten to call `quitWalkRef` and keep `beforeunload`. |
| Dirty-tab check | `web/src/unsaved-work/dirtyTabs.ts` (`anyDirtyTab`) | Unchanged; still the gate for the walk and `beforeunload`. |
| Walk start | `web/src/unsaved-work/useQuitWalk.ts:64-72` (`start`), published as `quitWalkRef.current` by `web/src/unsaved-work/CloseSaveGuard.tsx:56-60` | Called by the quit guard. Returns true when it opened the walk or one is already open; false when no tab is dirty. |
| Walk refs and quit callback | `web/src/App.tsx:125` (`onQuit`), `:127` (`quitWalkRef`), `:128` (`saveWalkOpenRef`) | Already created and passed to `AppMain`/`CloseSaveGuard`; this subplan also passes `quitWalkRef` to the quit guard and `saveWalkOpenRef` to `useCmdWRefs`. |
| App close handler | `web/src/App.tsx:140-150` (`closeTab`) | Unchanged. It still calls `guardedOpenQuitConfirm` when `closeQuitsApp` is true. |
| Typed command interception | `web/src/shared/command-bar/AppCommandBar.tsx:105`, `web/src/shared/command-bar/classify-submit.ts:36,54` | Unchanged. `confirm-quit` still calls `openQuitConfirm`, which is `guardedOpenQuitConfirm`. |
| Plain quit dialog | `web/src/QuitDialog/QuitDialog.tsx`, `web/src/QuitDialog/useQuitConfirm.ts` | Unchanged. Its tests pass unchanged. |
| Retired one-button dialog | `web/src/UnsavedQuitDialog.tsx`, `web/src/UnsavedQuitDialog.test.tsx` | Deleted with the state that served it. |
| Live getter pattern | `web/src/useCmdWRefs.ts:16-18` (`keyboardCapturedRef`) | The model for the new `quitConfirmOpenRef` getter. |
| Cmd+W refs and handler | `web/src/useCmdWRefs.ts:7`, `web/src/useCmdW.ts:14` | The refs hook changes; the key handler stays. |

## Proposed changes

- In `web/src/unsaved-work/useUnsavedQuitGuard.ts`, replace the local state and handlers with the call-time `quitWalkRef` read and fallback described above, take `quitWalkRef` in place of `runCommand`, keep the `beforeunload` effect, and rewrite the header comment.
- In `web/src/App.tsx`, update the `useUnsavedQuitGuard` call and destructuring, update the `useCmdWRefs` call, and remove the three old `AppMain` props.
- In `web/src/AppMain.tsx`, remove the `UnsavedQuitDialog` import and render and the three old props from the type and destructuring.
- Delete `web/src/UnsavedQuitDialog.tsx` and `web/src/UnsavedQuitDialog.test.tsx`.
- In `web/src/useCmdWRefs.ts`, replace the boolean `unsavedQuitOpen` parameter with `saveWalkOpenRef`, make `quitConfirmOpenRef` a live getter, and update the header comment.
- In `web/src/unsaved-work/useUnsavedQuitGuard.test.ts`, rewrite the dirty cases around `quitWalkRef`, delete the `confirmUnsavedQuit`/`cancelUnsavedQuit` cases, and keep the clean and `beforeunload` cases.
- In `web/src/useCmdWRefs.test.ts`, update the signature at every call and replace the "ORs quitConfirmOpen with unsavedQuitOpen" case with the live `saveWalkOpenRef` cases.
- In `web/src/useCmdW.test.tsx`, update both `useCmdWRefs` calls for the new signature and add the walk-suppression case.
- In `web/src/App.test.tsx`, replace the two stale retired-dialog title assertions as described above.

## Tests

In `web/src/unsaved-work/useUnsavedQuitGuard.test.ts`, every call passes a `quitWalkRef` object in the fourth position whose `current` is a `vi.fn` returning the case's result (or null for the no-guard case), built outside the `renderHook` callback so the test can inspect and reassign it:

- A clean tab calls `openQuitConfirm` once and never calls `quitWalkRef.current`.
- A dirty editor tab calls `quitWalkRef.current` once and does not call `openQuitConfirm`. This replaces "opens the unsaved-quit dialog instead of the raw confirm when a tab is dirty".
- A dirty plugin tab calls `quitWalkRef.current` once and does not call `openQuitConfirm`. This replaces "raises the unsaved prompt for a dirty plugin tab rather than the plain quit dialog" and preserves the custom-plugin coverage.
- A dirty tab whose walk returns false calls `quitWalkRef.current` once and then `openQuitConfirm` once. The walk was given the chance and declined.
- A dirty tab with `quitWalkRef.current` null calls `openQuitConfirm` once. No guard is mounted, so the plain dialog is the fallback.
- The ref is read at call time: render with `quitWalkRef.current` null, then assign a walk function returning true to it without rerendering, call `guardedOpenQuitConfirm`, and assert the newly assigned function was called and `openQuitConfirm` was not. This mirrors `CloseSaveGuard` assigning the ref in an effect after `App` renders.
- The `confirmUnsavedQuit` and `cancelUnsavedQuit` cases are deleted; `CloseSaveGuard.quit-walk.test.tsx` covers quitting after the walk.
- The `beforeunload` cases keep their assertions exactly: clean does not prevent the default; dirty does; a clean plugin tab does not; a dirty plugin tab does. Only their fourth argument changes.

In `web/src/useCmdWRefs.test.ts`, every existing call passes `{ current: false }` in the third position unless the case says otherwise:

- "mirrors the plain arguments into their matching refs" mirrors `activeTab`, `quitConfirmOpen`, and the overlay state, with a false `saveWalkOpenRef`.
- `quitConfirmOpen` true makes `quitConfirmOpenRef.current` true, and a rerender with it false makes it false again.
- A true `saveWalkOpenRef` makes `quitConfirmOpenRef.current` true while `quitConfirmOpen` is false. This replaces "ORs quitConfirmOpen with unsavedQuitOpen".
- The ref is read live: create the `saveWalkOpenRef` object outside the `renderHook` callback with `current` false, flip its `current` to true after render, and assert `quitConfirmOpenRef.current` becomes true without a rerender; flip it back and assert it becomes false. Also assert `quitConfirmOpenRef`'s identity does not change across a rerender.
- Every existing overlay and contributed-overlay case passes with the new signature.

In `web/src/useCmdW.test.tsx`:

- `TestComponent` gains an optional `walkOpen` prop (false by default) that it mirrors into a ref passed as `saveWalkOpenRef`, the same way it mirrors `focusedIndex` into `focusedIndexRef`. `ContributedOverlayShortcut` passes `{ current: false }`.
- The existing "does nothing while quit dialog is open" case still covers `quitConfirmOpen`.
- A new case "does nothing while the quit walk is running" renders `TestComponent` with `walkOpen` true and `quitOpen` false, dispatches Cmd+W, and asserts `closeTab` was not called, proving the walk suppression reaches the key handler.

In `web/src/App.test.tsx`, the two system-tab cases assert that no `Save (y)` button is present after the direct close. No other App case changes. An App-level dirty-quit case is deliberately not added: `App.test.tsx` mocks `PluginBody` with `web/src/test/AppPluginFixture.tsx`, which cannot register a dirty handle, and widening that shared fixture is outside this subplan. The App-to-guard wiring is covered by the typed signatures, the hook test, `CloseSaveGuard.quit-walk.test.tsx`, and the manual smoke below.

`web/src/UnsavedQuitDialog.test.tsx` is deleted. `web/src/QuitDialog/QuitDialog.test.tsx`, `web/src/QuitDialog/useQuitConfirm.test.ts`, and the `CloseSaveGuard*.test.tsx` suites pass unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each checkpoint.

Manual smoke in the running app:

- With one dirty editor tab and no other tab open, press Cmd+W. The walk asks about that one tab instead of closing it or showing the plain quit dialog.
- Press Cmd+W again while the dialog is up. Nothing changes: no restart, no close, no second dialog.
- With two dirty editor tabs open, type `quit`, answer Don't Save on the first, and press Cmd+W while the second tab's dialog is up. Neither tab closes and the walk's dialog for the second tab stays up; Cancel then leaves both tabs open.
- With no unsaved work, type `quit`. The plain "Are you sure you want to quit?" dialog still appears and still answers to y/n/Escape/arrows.
- Close the managed system shell while it is the only tab. It hides without a dialog.
- Let a tab's process exit on its own. It closes without a dialog.

The full three-tab save/discard and Cancel checks are in subplan `09`.

## Out of scope

- No change to the plain quit dialog's keys, default selection, or wording.
- No change to `beforeunload`, the browser's own prompt, or the server's `quit` command.
- No change to `classifyCommandBarSubmit`, `useAppCommandLine`, or any other trigger caller.
- No change to `useCmdW`, `useQuitWalk`, `CloseSaveGuard`, or the per-tab close dialog when other tabs remain.
- No change to the system-shell hide path, process-exit close, or schedule/other-tab quit.
- No spec, help, or user-documentation edit; subplan `09` owns them.
- No change to `web/src/test/AppPluginFixture.tsx`.
