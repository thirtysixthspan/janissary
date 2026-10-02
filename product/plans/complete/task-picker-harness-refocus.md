# Return keyboard focus to the harness after the task picker injects a task

**Complexity: 2/10**: a single callback threaded through three hooks to reach the task picker's harness branch, plus one test. The app shell already has the callback (`focusHarness`, built for the clipboard-history overlay's paste into a harness). No new architecture and no wire change.

## Goal

On a harness tab, picking a task in the task picker sends `execute …` into the harness's PTY. Nothing then puts the keyboard back on the harness terminal. When the pick is made by clicking a row, the click has already taken focus off the terminal's hidden input, so the next keystroke goes nowhere instead of reaching the harness. After a pick on a harness tab, focus should return to that harness's terminal, so the user can keep typing (for example append instructions and press Return) straight away.

## Approach

The clipboard-history overlay solved the same problem: `paste-into-surface.ts`'s `pasteIntoPty` sends `ptyInput` and then calls `focusHarness(ptyId)`, which the app shell builds from `harnessHandles` in `App.tsx`. The task picker should do the same.

- `web/src/pickers/populate-command-line.ts`: `insertIntoCommandLine` gains a `focusHarness: (ptyId: string) => void` parameter. In the harness branch, after sending `ptyInput`, it calls `focusHarness(harnessPtyId)`. The command-bar branch is unchanged, since `insertAtCaret` already leaves the caret in the command line.
- `web/src/pickers/useTaskPicker.ts`: accepts `focusHarness` and passes it to `insertIntoCommandLine`. The pick closes the popup the same way it does today.
- `web/src/pickers/usePopulatePickers.ts`: accepts `focusHarness` and passes it to `useTaskPicker`.
- `web/src/pickers/usePickerOverlays.ts`: `Input` gains `focusHarness`, which is passed to `usePopulatePickers`.
- `web/src/App.tsx`: passes its existing `focusHarness` to `usePickerOverlays`.

## Implementation steps

1. Add the `focusHarness` parameter to `insertIntoCommandLine` and call it in the harness branch.
2. Thread `focusHarness` through `useTaskPicker`, `usePopulatePickers`, and `usePickerOverlays`, and pass it from `App.tsx`.
3. Update the existing tests that call these hooks (`useTaskPicker.test.ts`, `usePickerOverlays.test.tsx`) for the new parameter.

## Tests

- `web/src/pickers/useTaskPicker.test.ts`: picking a task when `harnessPtyId` is set calls `focusHarness` with that PTY id after sending the `ptyInput`.
- `web/src/pickers/useTaskPicker.test.ts`: picking a task with no harness (command-line insertion) does not call `focusHarness`.

## Spec

- `product/specs/task-picker.md`, "Picker behavior": state that after a pick on a harness tab, the keyboard returns to that harness's terminal, so the next keystroke reaches the harness.

## Out of scope

- The profile picker's harness branch (`populateCommandLine`), which also writes into a harness PTY. The issue is about the task picker only.
- Focus after Escape closes the task picker without a pick.
