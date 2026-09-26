# Answering the overwrite-conflict prompt leaves the editor with no keyboard focus

**Complexity: 2/10**: two callbacks in `EditorTab` gain a refocus call. No hook, dialog, or shared modal code changes.

## Bug

Answering the editor's "This file changed on disk. Overwrite it with your changes?" prompt, with Escape, `y`, or either button, closes the dialog and leaves `document.activeElement` on `<body>`. Typing no longer reaches the buffer, and Cmd+S does nothing, so the spec's "The next save attempt shows the same prompt again" can only be reached with the mouse through the metadata row's save button.

## Root cause

`useDialogKeyboard` (`web/src/shared/useDialogKeyboard.ts`) focuses the dialog on mount and, on unmount, removes its listeners without restoring focus. The dialog was the focused element, so when React removes it the browser drops focus to `<body>`. Nothing on the editor's side puts it back. `EditorTab` passes `file.overwrite` and `file.dismissConflict` straight to `OverwriteConflictDialog`, and those only clear `conflictOpen` and write the file. The textarea's autofocus effect depends on `active`, `loaded`, and `renaming`, and none of them change when the dialog closes.

The close dialog's handlers in `CloseSaveGuard` already call `handle.focus()` after closing, which is why that dialog does not have this bug.

## Correct behavior

Both answers close the prompt and return keyboard focus to the editor buffer. After Cancel the buffer is unchanged and still unsaved, typing edits it, and the next Cmd+S shows the same prompt again. After Overwrite the buffer is written and keeps focus.

## Reproduction

Test-first in `web/src/editor/EditorTab.test.tsx`: render a loaded `EditorTab` with `mtimeMs: 1`, type `x` to make it dirty, re-render at `mtimeMs: 2` (the watcher reporting an external change), then press Cmd+S in the textarea so the prompt appears. Then press Escape (or `y`) on the focused element. On `master` the dialog closes, but `expect(document.activeElement).toBe(textarea())` fails because focus is on `<body>`. This happens on both paths.

## Approach

Refocus the buffer in `EditorTab`, where the textarea ref lives, the same way the find overlay's `onClose` and the rename handlers already do. Wrap the dialog's two callbacks so each runs the file hook's action and then focuses the textarea. Use `preventScroll: true`, as the autofocus effect does: the textarea sits at the top of the scrollport, so a plain `focus()` on a scrolled buffer would jump back to the top.

`useDialogKeyboard` does not restore focus in general. It is shared by every modal in the app, and each caller already chooses where focus goes next, so changing it would reach well beyond this bug.

## Implementation steps

1. `web/src/editor/EditorTab.tsx`: pass `onSave={() => { file.overwrite(); refocusBuffer(); }}` and `onCancel={() => { file.dismissConflict(); refocusBuffer(); }}` to `OverwriteConflictDialog`, where `refocusBuffer` focuses the textarea with `preventScroll: true`.
2. Tests: see below.
3. Spec: in `product/specs/editor-tab.md`, say that either answer returns keyboard focus to the buffer.

## Regression test

`web/src/editor/EditorTab.test.tsx`:

- `escaping the conflict dialog returns keyboard focus to the buffer`: presses Escape, asserts that focus is back on the textarea, and checks that a Cmd+S sent to the focused element raises the prompt again without saving.
- `answering y in the conflict dialog returns keyboard focus to the buffer`: presses `y`, asserts that the save went out and focus is back on the textarea.

## Out of scope

- A general focus-restore in `useDialogKeyboard` for every modal.
- The other bugs in the backlog about editor focus: the right-click Paste entry and Shift+Tab.
