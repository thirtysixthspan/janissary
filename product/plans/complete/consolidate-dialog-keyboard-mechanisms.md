# Consolidate the modal-dialog keyboard mechanisms in web/src

**Complexity: 5/10** — one hook gains a second input shape, a second hook is rebuilt on top of it, a third module is deleted, and four consumers simplify. No behavior changes, and every affected dialog already has a test file.

## Goal

`web/src/` offers three overlapping ways to wire a modal dialog's keyboard, so a new dialog has to guess which to reach for:

- `useDialogKeyboard.ts` — focuses the dialog on mount, registers capture-phase keydown/click-outside listeners, tears them down on unmount. Takes a raw `(e: KeyboardEvent) => void`.
- `useConfirmDialogKeys.ts` — reimplements that identical focus-plus-capture-listener wiring inline rather than composing it, adding only y/n/Enter/Escape/arrow selection on top.
- `dialog-key-handler.ts` — a third entry point exporting `dialogKeyHandler`, which builds a keydown handler that swallows the event and dispatches by lowercased key.

Reduce this to **one** surface: `useDialogKeyboard`, which accepts either a raw handler or a key→handler map.

## Approach

`dialogKeyHandler`'s whole body is "preventDefault, stopPropagation, dispatch by lowercased key" — a shape, not a mechanism. Fold it into `useDialogKeyboard` as a second accepted argument type: pass a function to handle keys yourself, or pass a `Record<string, () => void>` to get the swallow-and-dispatch behavior. `dialog-key-handler.ts` then has nothing left to export and is deleted.

`useConfirmDialogKeys` keeps its public API — `(onConfirm, onCancel) => { dialogRef, selected }` — but drops its duplicated `useEffect` and calls `useDialogKeyboard(dialogRef, { y, n, enter, escape, arrowleft, arrowright })` instead. Its behavior is already exactly the map shape, including swallowing every unmapped key, so nothing about what it does changes.

This also removes the need for the `useLatestRef` boilerplate in the map consumers. `useDialogKeyboard` already re-points its handler ref on every render, so a map rebuilt each render closes over fresh props and state; the mount-once listener still sees the latest values. `OverwriteConflictDialog` and `SaveChangesDialog` can call their props and read `selected` directly.

## Implementation steps

1. Widen `useDialogKeyboard`'s second parameter to `((e: KeyboardEvent) => void) | Record<string, () => void>`, normalizing a map into the swallow-and-dispatch handler each render, and leaving the function form's semantics untouched (no automatic `preventDefault`).
2. Rebuild `useConfirmDialogKeys` on `useDialogKeyboard`: keep `dialogRef` and the `selected` state, delete the inline `useEffect` and the three latest-value refs, and express the key behavior as a map.
3. Repoint `OverwriteConflictDialog` and `SaveChangesDialog` at `useDialogKeyboard`'s map form, dropping their `dialogKeyHandler` and `useLatestRef` usage.
4. Delete `web/src/dialog-key-handler.ts`.

## Tests

The affected dialogs already have colocated tests (`OverwriteConflictDialog.test.tsx`, `SaveChangesDialog.test.tsx`, `MoveConflictDialog.test.tsx`, `FileNavigatorFailureDialog.test.tsx`, `UnsavedQuitDialog.test.tsx`, `DeleteFileDialog.test.tsx`, `DeleteScheduleDialog.test.tsx`); all must keep passing unchanged, which is what pins that no behavior moved.

Add `web/src/useDialogKeyboard.test.tsx` for the consolidated surface itself, which has no direct test today:

- Focuses the dialog element on mount.
- Function form: calls the handler with the raw event and does not swallow it on its own.
- Map form: dispatches by lowercased key (`Y` and `y` both hit the `y` entry), and calls `preventDefault`/`stopPropagation` for a key that is *not* in the map, not just for mapped ones.
- Uses the latest map across re-renders, so a handler defined against fresh props/state wins over the one present at mount.
- Swallows a click outside the dialog while letting a click inside through.
- Removes both capture listeners on unmount.

## Out of scope

- `ModalDialog.tsx`, `ConfirmDialogShell.tsx`, and the visual/markup side of any dialog.
- The `useLatestRef` hook itself, which has other callers.
- Changing which keys any dialog responds to, or what it does with them.
- `use-launch-dialog.ts`, `MoveConflictDialog`, and `FileNavigatorFailureDialog`, which already use `useDialogKeyboard`'s function form and stay on it.

## Documentation

None. Keyboard behavior in every dialog is unchanged, so nothing `help.md`, the functional specs, or `documentation/user-documentation/` already describes is now different.
