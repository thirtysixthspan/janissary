# Wire the quit entry point, retire the one-button dialog, and keep Cmd+W inert

**Complexity: 4/10** — replaces the quit guard's local dialog state with a ref call, deletes the retired dialog and its test, removes App/AppMain props, and switches Cmd+W to a live walk ref. The behavior spans every quit trigger path, so the fallback and the live-ref read need explicit tests.

## Goal

Make every whole-app quit trigger use the walk:

- `useUnsavedQuitGuard.guardedOpenQuitConfirm` calls `quitWalkRef.current?.()` when any tab is dirty. If the walk starts, it does nothing else. If it returns false, or no guard is mounted, it falls back to the plain `openQuitConfirm`.
- When no tab is dirty, it calls `openQuitConfirm` directly, exactly as today.
- The old `unsavedQuitOpen`, `confirmUnsavedQuit`, and `cancelUnsavedQuit` state and handlers are removed with `UnsavedQuitDialog`.
- `AppMain` stops rendering `UnsavedQuitDialog` and drops its props.
- `useCmdWRefs` takes `saveWalkOpenRef` in place of `unsavedQuitOpen` and makes `quitConfirmOpenRef` a live getter over `quitConfirmOpen` or `saveWalkOpenRef.current`, so Cmd+W is inert for the whole walk, including between steps and on the last tab.

No caller of `guardedOpenQuitConfirm` changes. It is already the single entry point for typed `quit`, typed last-tab `close`/`exit` (bare, slashed, or named), the tab strip's ×, Cmd+W/Ctrl+W, and page-view/plugin close controls through `App.closeTab`.

## Dependencies and ordering

This subplan depends on:

- `01-move-unsaved-work-modules` for the moved quit guard;
- `05-save-confirm-request-state` and `06-quit-walk-guard` for `quitWalkRef` and the guard's `startQuitWalk`;
- `07-focus-suppression-during-walk` so the walk's tab switches do not steal focus as soon as the entry point makes the walk reachable.

At the end of this subplan the feature is user-visible and the old one-button dialog is gone.

## Design decisions

### Quit entry point

- `useUnsavedQuitGuard` keeps its `beforeunload` effect unchanged. It still prevents the default only when `anyDirtyTab(tabs, tabHandles)` is true for the browser's own close/reload/navigation path; no in-app dialog can intercept that path.
- Its signature becomes `(tabs, tabHandles, openQuitConfirm, quitWalkRef)`. `quitWalkRef` is a `React.RefObject<(() => boolean) | null>`.
- `guardedOpenQuitConfirm` does:
  - if `anyDirtyTab(tabs, tabHandles)` is true, call `quitWalkRef.current?.()` and remember the boolean result;
  - if the result is true, return without opening the plain dialog;
  - otherwise call `openQuitConfirm()`.
- The `anyDirtyTab` check happens before the ref call because a clean quit must not call into the guard at all. The fallback covers both the "dirty but the walk found nothing left to ask" case and the "no guard mounted" case, which the source plan requires.
- The hook returns only `{ guardedOpenQuitConfirm }`. Delete the `unsavedQuitOpen` state, `confirmUnsavedQuit`, and `cancelUnsavedQuit`; the dialog they served is deleted.
- `useUnsavedQuitGuard` no longer imports `useState` and no longer takes `runCommand`. Quit execution is now the guard's `onQuit` prop, which `App` passes as the same `runCommand('quit')` call the retired confirm made.

### Trigger paths and unchanged paths

- Every typed quit path already reaches `guardedOpenQuitConfirm`: `App.tsx:143` calls it when `closeQuitsApp(tabs, index)` is true, and `App.tsx:184` passes it to `useAppCommandLine` as `openQuitConfirm`. `classifyCommandBarSubmit` returns `confirm-quit` for `quit`, `/quit`, and a close/exit of the last tab, including a named close of the last tab. No classifier change.
- The tab strip's ×, Cmd+W/Ctrl+W, and page-view/plugin close controls all reach `App.closeTab`, which still calls `guardedOpenQuitConfirm` before closing the last tab. No caller changes.
- A tab whose process exits on its own still carries `reason.terminalExited` and sends `closeTab` directly; it never enters the guard.
- Closing the managed system shell still bypasses both guards because `closeQuitsApp` excludes `systemShell` and `closeTab` checks `!tab.systemShell` before `guardRef`. The tab is hidden; no dialog is raised.
- A `quit` sent by a schedule or another tab still executes on the server without a client dialog and without the unsaved-changes guard. The client-side walk only covers user-triggered paths that run through `guardedOpenQuitConfirm`.
- The browser's native `beforeunload` prompt is unchanged.

### App and AppMain cleanup

- `App` removes `unsavedQuitOpen`, `confirmUnsavedQuit`, and `cancelUnsavedQuit` from the `useUnsavedQuitGuard` destructuring and from the `AppMain` props.
- `App` keeps `quitConfirmOpen`, `confirmQuit`, and `cancelQuit` for the plain quit dialog.
- `App` calls `useCmdWRefs(activeTab, quitConfirmOpen, saveWalkOpenRef, pickers.overlays)`.
- `AppMain` removes the `UnsavedQuitDialog` import and render, removes `unsavedQuitOpen` and the two old callbacks from its props type and destructuring, and keeps `CloseSaveGuard` with the props added in `06`.
- Delete `web/src/UnsavedQuitDialog.tsx` and `web/src/UnsavedQuitDialog.test.tsx`.

### Cmd+W suppression

- `useCmdWRefs` signature becomes `(activeTab, quitConfirmOpen, saveWalkOpenRef, overlays)`. `saveWalkOpenRef` is a `React.RefObject<boolean>`.
- `quitConfirmOpenRef` becomes a getter object, like `keyboardCapturedRef` at `web/src/useCmdWRefs.ts:16`: it reports true when the live `quitConfirmOpen` value is true or `saveWalkOpenRef.current` is true. Both sides must be read at access time. Keep a mutable ref for the boolean `quitConfirmOpen` updated each render so the getter sees the latest value after a rerender; `saveWalkOpenRef` is already live.
- This replaces the old `quitConfirmOpenRef.current = quitConfirmOpen || unsavedQuitOpen` assignment. The old one-time assignment could not see a ref flip without a rerender.
- `useCmdW` itself does not change. It already returns early when `quitConfirmOpenRef.current` is true, before calling `closeTab`. The modal signal (`keyboardCapturedRef`) covers the dialog while it is mounted; the walk ref covers the keyed remount between steps and the capture-phase window before the dialog's own listener is registered.
- Without this, Cmd+W mid-walk on the last tab would reach `App.closeTab`, call `guardedOpenQuitConfirm` again, and restart the walk instead of doing nothing.
- `useCmdW.test.tsx` calls `useCmdWRefs` directly in two test components, so it must be updated for the new signature even though `useCmdW` is unchanged. Add one case there that proves a true `saveWalkOpenRef` suppresses Cmd+W, in addition to the ref-only case in `useCmdWRefs.test.ts`.

### Test cleanup outside the source plan's test list

`web/src/App.test.tsx` has two assertions that the retired dialog's title is absent:

- line 201, in "sends a system tab close directly without quit or unsaved confirmation";
- line 311, in "routes typed close for a system tab to the server without opening client confirmation".

Those assertions would still pass after the deletion, but they would name a dialog that no longer exists. Replace each with an assertion that no walk dialog is present — for example, no `Save (y)` button — while keeping the existing plain-quit-dialog absence assertion. This is a test-only cleanup forced by the deletion, not a behavior change.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Whole-app quit guard | `web/src/unsaved-work/useUnsavedQuitGuard.ts` (after subplan `01`) | Rewritten to call `quitWalkRef` and keep `beforeunload`. |
| Dirty-tab check | `web/src/unsaved-work/dirtyTabs.ts` (`anyDirtyTab`) | Unchanged; still the gate for the walk and `beforeunload`. |
| App close handler | `web/src/App.tsx:136-146` (`closeTab`) | Unchanged. It still calls `guardedOpenQuitConfirm` when `closeQuitsApp` is true. |
| Typed command interception | `web/src/shared/command-bar/AppCommandBar.tsx:105`, `web/src/shared/command-bar/classify-submit.ts:36,54` | Unchanged. `confirm-quit` still calls `openQuitConfirm`, which is `guardedOpenQuitConfirm`. |
| Plain quit dialog | `web/src/QuitDialog/QuitDialog.tsx`, `web/src/QuitDialog/useQuitConfirm.ts` | Unchanged. Its tests pass unchanged. |
| Retired one-button dialog | `web/src/UnsavedQuitDialog.tsx`, `web/src/UnsavedQuitDialog.test.tsx` | Deleted with the state that served it. |
| Cmd+W refs | `web/src/useCmdWRefs.ts:7`, `web/src/useCmdW.ts:14` | The refs hook changes; the key handler stays. |
| Walk start ref | `web/src/unsaved-work/CloseSaveGuard.tsx` (`quitWalkRef`, from subplan `06`) | Called by the quit guard. |
| Walk open flag | `web/src/App.tsx` (`saveWalkOpenRef`, from subplan `06`) | Passed to `useCmdWRefs` and `useFocusOnTabSwitch`. |

## Proposed changes

- In `web/src/unsaved-work/useUnsavedQuitGuard.ts`, replace the local state and handlers with the `quitWalkRef` call and fallback described above; keep the `beforeunload` effect.
- In `web/src/App.tsx`, update the `useUnsavedQuitGuard` call and destructuring, update the `useCmdWRefs` call, and remove the three old `AppMain` props.
- In `web/src/AppMain.tsx`, remove the `UnsavedQuitDialog` import and render and the three old props from the type and destructuring.
- Delete `web/src/UnsavedQuitDialog.tsx` and `web/src/UnsavedQuitDialog.test.tsx`.
- In `web/src/useCmdWRefs.ts`, replace the boolean `unsavedQuitOpen` parameter with `saveWalkOpenRef` and make `quitConfirmOpenRef` a live getter.
- In `web/src/useUnsavedQuitGuard.test.ts`, rewrite the dirty cases around `quitWalkRef`; keep the clean and `beforeunload` cases.
- In `web/src/useCmdWRefs.test.ts`, update the signature at every call and replace the `unsavedQuitOpen` OR case with the live `saveWalkOpenRef` case.
- In `web/src/useCmdW.test.tsx`, update both `useCmdWRefs` calls for the new signature and add the walk-suppression case.
- In `web/src/App.test.tsx`, replace the two stale retired-dialog title assertions as described above.

## Tests

In `web/src/unsaved-work/useUnsavedQuitGuard.test.ts`:

- A clean tab calls `openQuitConfirm` once and never calls `quitWalkRef.current`.
- A dirty editor tab calls `quitWalkRef.current` once and does not call `openQuitConfirm`.
- A dirty plugin tab calls `quitWalkRef.current` once and does not call `openQuitConfirm`. This preserves the current custom-plugin coverage.
- A dirty tab whose walk returns false calls `openQuitConfirm` once. The walk was given the chance and declined.
- A dirty tab with `quitWalkRef.current` null calls `openQuitConfirm` once. No guard is mounted, so the plain dialog is the fallback.
- The `beforeunload` cases stay exactly as they are: clean does not prevent the default; dirty does; a clean plugin tab does not; a dirty plugin tab does.

In `web/src/useCmdWRefs.test.ts`:

- The plain-argument case mirrors `activeTab`, `quitConfirmOpen`, and the overlay state, with a false `saveWalkOpenRef`.
- `quitConfirmOpen` true makes `quitConfirmOpenRef.current` true.
- A true `saveWalkOpenRef` makes `quitConfirmOpenRef.current` true while `quitConfirmOpen` is false.
- The ref is read live: start with a false `saveWalkOpenRef`, flip its `current` to true after render, and assert `quitConfirmOpenRef.current` becomes true without a rerender; flip it back and assert it becomes false. Also assert the ref identity does not change across rerenders.
- Every existing overlay case passes with the new signature.

In `web/src/useCmdW.test.tsx`:

- The two test components pass a `saveWalkOpenRef` (false by default).
- The existing "does nothing while quit dialog is open" case still covers `quitConfirmOpen`.
- A new case with a true `saveWalkOpenRef` dispatches Cmd+W and asserts `closeTab` was not called, proving the walk suppression reaches the key handler.

In `web/src/App.test.tsx`, the two system-tab cases assert no walk dialog is present after the direct close. No other App case changes.

`web/src/UnsavedQuitDialog.test.tsx` is deleted. `web/src/QuitDialog/QuitDialog.test.tsx` and `web/src/QuitDialog/useQuitConfirm.test.ts` pass unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Manual smoke in the running app:

- With one dirty editor tab and no other tab open, press Cmd+W. The walk asks about that one tab instead of closing it or showing the plain quit dialog.
- Press Cmd+W again while the dialog is up. Nothing changes: no restart, no close, no second dialog.
- With no unsaved work, type `quit`. The plain "Are you sure you want to quit?" dialog still appears and still answers to y/n/Escape/arrows.
- Close the managed system shell while it is the only tab. It hides without a dialog.
- Let a tab's process exit on its own. It closes without a dialog.

The full three-tab save/discard and Cancel checks are in subplan `09`.

## Out of scope

- No change to the plain quit dialog's keys, default selection, or wording.
- No change to `beforeunload`, the browser's own prompt, or the server's `quit` command.
- No change to `classifyCommandBarSubmit`, `useAppCommandLine`, or any other trigger caller.
- No change to the per-tab close dialog when other tabs remain.
- No change to the system-shell hide path, process-exit close, or schedule/other-tab quit.
- No spec, help, or user-documentation edit.
