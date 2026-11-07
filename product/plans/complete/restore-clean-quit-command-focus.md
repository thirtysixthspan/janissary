# Restore Clean Quit Command Focus

## Complexity

3/10. The fix is in the quit-confirmation hook, with a hook test and an app-level regression test.

## Goal

After cancelling the plain quit confirmation, return keyboard focus to the command bar that submitted `quit`.

## Approach

Capture the focused command textarea when the confirmation opens and focus that element after cancellation. Keep the existing application input ref as a fallback for quit confirmations opened outside a command bar.

## Implementation steps

1. Update `useQuitConfirm` to remember a focused command textarea when it opens and restore focus to it on cancellation, falling back to the supplied input ref.
2. Extend the hook tests for the captured command textarea and fallback behavior, and add an App-level regression that submits `quit`, presses Escape, and confirms the shell command bar is focused.
3. Clarify in the quit-confirmation spec that cancel restores focus to the command line that submitted `quit`.

## Tests

- In `web/src/QuitDialog/useQuitConfirm.test.ts`, assert that cancellation focuses the command textarea captured when the dialog opened, and that cancellation still uses the supplied input ref when no command textarea was focused.
- In `web/src/App.launch-focus.test.tsx`, submit `quit` from the mounted shell command bar, cancel with Escape, and assert the same bar regains focus.

## Out of scope

- Focus behavior for the unsaved-work walk or single-tab close dialog.
- Changes to the command-bar plugin contract or shell focus behavior outside quit cancellation.
- Public documentation changes, since the existing tab guide already says cancelling the plain quit dialog returns focus to the command line.
