# Return keyboard focus to the file navigator after the delete confirmation dialog

**Complexity: 2/10** — wiring two existing callbacks (`focusTree`, already used for the failure dialog) into the delete dialog's confirm/cancel handlers in `FileNavigatorOverlays.tsx`. No new state, no protocol changes.

## Goal

Deleting a file/directory from the file navigator opens `DeleteFileDialog` (a modal built on `ConfirmDialogShell`). Once the user acts on the dialog (Delete or Cancel, by click or keyboard), the dialog unmounts but nothing restores keyboard focus to the file-navigator tree — focus is left on the removed button, which the browser drops to `document.body`. The user then has to click back into the tree to keep navigating with the keyboard.

Per the backlog request: after the dialog closes, keyboard focus must return to the file navigator. If the file was deleted, the active row should be the parent directory. If the deletion was canceled, the active row should be the file that was about to be deleted.

## Approach

`FileNavigatorOverlays` already receives a `focusTree: () => void` prop (`() => containerRef.current?.focus()` from `FileNavigatorTab.tsx`) and already uses it for the drag-failure dialog's dismiss handler (`FileNavigatorOverlays.tsx:66-73`). The delete dialog's `onConfirm`/`onCancel` wiring (`FileNavigatorOverlays.tsx:56-65`) is missing the same call — that's the entire gap for DOM focus.

The "which row becomes active" half is already handled by existing selection logic, so no new code is needed there:

- **Cancel**: `useFileNavigatorDelete.cancel` only clears `pendingDelete`; it never touches `useFileNavigatorSelection`'s `cursor`. The cursor is already the file that was pending deletion (it's what made `selection.operationPaths` non-empty when Delete/Backspace was pressed), so once DOM focus returns to the tree container, the active/highlighted row (`aria-activedescendant`, driven by `selection.cursor`) is already back on that file.
- **Confirm**: once the server applies the delete and pushes an updated row list, `useFileNavigatorSelection`'s `reconcileSelection` (`useFileNavigatorSelection.ts:86-105`) detects the cursor path is no longer visible and replaces it via `nearestVisibleAncestor`, which walks up the path until it finds a visible row — i.e. the parent directory. This already fires on every row-list update, so no change is needed for the confirm case either.

So the fix is exactly: call `focusTree()` alongside `deletion.confirm()` and `deletion.cancel()` in `FileNavigatorOverlays.tsx`, mirroring the existing `drag.dismissFailure` pattern.

## Implementation steps

1. In `web/src/FileNavigatorOverlays.tsx`, change the `DeleteFileDialog` wiring from:
   ```tsx
   onConfirm={deletion.confirm}
   onCancel={deletion.cancel}
   ```
   to:
   ```tsx
   onConfirm={() => { deletion.confirm(); focusTree(); }}
   onCancel={() => { deletion.cancel(); focusTree(); }}
   ```

## Tests

Add to `web/src/FileNavigatorOverlays.test.tsx`, mirroring the existing "dismisses the failure dialog and refocuses the tree" test:

1. Renders `DeleteFileDialog` (via `deletion.pendingDelete` set to a path in `makeDeletion`), clicks the Delete button, and asserts `confirm` and `focusTree` were each called once.
2. Same setup, clicks the Cancel button, and asserts `cancel` and `focusTree` were each called once.

Run `./scripts/run.mjs check-diff` to confirm everything passes.

## Spec updates

- `product/specs/file-navigator.md` — add a line documenting that after the delete confirmation dialog closes, keyboard focus returns to the tree: on deletion the parent directory becomes active, on cancel the file itself remains active.

## Docs

- Checked `help.md` — no mention of the delete dialog or its focus behavior. No update needed.
- Checked `documentation/user-documentation/` — no page documents the delete confirmation dialog's focus behavior. No update needed.

## Out of scope

- `ConfirmDialogShell`/`useConfirmDialogKeys` — the generic modal shell already forwards clicks and keyboard shortcuts to `onConfirm`/`onCancel`; no change needed there.
- `useFileNavigatorSelection`'s reconciliation logic — already produces the correct "nearest visible ancestor" behavior for the post-delete case; not modified.
- Any other confirmation dialog (`MoveConflictDialog`, `FileNavigatorFailureDialog`) — out of scope for this fix.
