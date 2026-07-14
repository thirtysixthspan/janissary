# Backspace/Delete removes the selected file-tree row, behind a confirmation dialog

**Complexity: 4/10** — no delete capability exists yet server-side, so this adds one new RPC
method end-to-end (protocol, dispatch, controller, manager) mirroring the existing
`moveFileTreeItem` path exactly, plus a small client-side confirm dialog built directly on the
already-generic `ConfirmDialogShell`.

## Goal

Pressing Backspace or Delete while a row is selected in the file navigator (and it isn't the `..`
row) opens a confirmation dialog: `Delete "<name>"?` with **Delete** and **Cancel**. Confirming
removes the file or directory (recursively, if it's a directory) from disk; cancelling leaves it
untouched. The tree already watches every visible directory, so the row disappears automatically
once the watcher picks up the change, the same as any other on-disk change made outside the app.

## Design decisions

**A new RPC method, modeled exactly on `moveFileTreeItem`.** There is currently no delete
capability anywhere in the codebase — only `move` exists on `FileTreeManager`. The same
index-resolves-to-label, then manager-method-does-the-real-work shape used for the move path is
reused verbatim for delete: `deleteFileTreeItem` in `protocol.ts` → routed in `message-handler.ts`
→ `Controller.deleteFileTreeItem` resolves the tab label → `FileTreeManager.delete` does the
`rmSync` and rebuild.

**Confirm on the client before sending, not after.** Unlike the move-conflict dialog (which fires
only when the server-visible row list predicts a conflict), every delete needs confirmation, so
the client always shows the dialog first and only sends the RPC once the user confirms — there is
no unconfirmed/optimistic path.

**`ConfirmDialogShell`, not a hand-rolled dialog.** The shell already provides exactly the needed
behavior out of the box: `y`/`n` shortcuts, arrow-key selection, Enter/Escape, and click-outside
swallowing (`useConfirmDialogKeys`), and is already the established pattern for a new two-button
prompt (`UnsavedQuitDialog` wraps it the same way). A new `DeleteFileDialog` component supplies
just the title and button copy, matching `UnsavedQuitDialog`'s shape.

**Recursive delete, no separate empty-vs-non-empty directory handling.** `rmSync(abs, {
recursive: true, force: false })` handles both files and directories uniformly; a failure (e.g. a
permission error) is swallowed the same way `move`'s `renameSync` failure already is — the tree
simply doesn't change and no error surfaces beyond that.

## Server changes

1. **`src/protocol.ts`** — add `{ method: 'deleteFileTreeItem'; params: { index: number; relPath:
   string } }` to the `RpcCall` union, alongside `moveFileTreeItem`.
2. **`src/message-handler.ts`** — add a `case 'deleteFileTreeItem'` routing to
   `controller.deleteFileTreeItem(message.params.index, message.params.relPath)`.
3. **`src/controller.ts`** — add `deleteFileTreeItem(index, relPath)`, resolving `index` to a
   label via `this.managers.tab.tabs[index]?.label` and calling `this.managers.fileTree.delete`,
   mirroring `moveFileTreeItem` exactly.
4. **`src/file-tree-manager.ts`** — add `delete(label, relPath)`: resolve the absolute path from
   `state.root`, `rmSync(abs, { recursive: true })` inside a try/catch that no-ops on failure, then
   `this.rebuild(label)`.

## Client changes

1. **`web/src/DeleteFileDialog.tsx` (new)** — wraps `ConfirmDialogShell` with title `Delete
   "<name>"?`, `confirmLabel="Delete"`, `cancelLabel="Cancel"`, matching `UnsavedQuitDialog.tsx`'s
   shape exactly.
2. **`web/src/FileTreeTab.tsx`**:
   - Add `pendingDelete: string | null` state (the relative path awaiting confirmation).
   - In `onKeyDown`, handle `Backspace`/`Delete`: if `selected` is set and isn't `'..'`, call
     `e.preventDefault()`/`e.stopPropagation()` and `setPendingDelete(selected)`.
   - Render `DeleteFileDialog` when `pendingDelete` is set, with `onConfirm` sending
     `deleteFileTreeItem` (via `client.send`) and clearing `pendingDelete`, and `onCancel` just
     clearing it.
   - No new selection-handling logic is needed after a confirmed delete: the existing
     selection-clamp effect (`files.rows.every((r) => r.path !== selected)` → select the nearest
     surviving row) already handles the row disappearing once the tree rebuilds.

## Tests

- **`src/file-tree-manager.test.ts`** — add to the existing `describe('FileTreeManager')` block:
  - `delete removes a file from disk and rebuilds the tree`
  - `delete removes a directory recursively`
  - `delete on an unknown tab is a no-op`
  - `a failed delete (e.g. missing path) leaves the tree unchanged`
- **`src/controller.test.ts`** — mirroring the existing `moveFileTreeItem` RPC tests:
  - `deleteFileTreeItem RPC deletes a file and rebuilds the tree`
  - `deleteFileTreeItem RPC on an out-of-range index does nothing`
- **`src/message-handler.test.ts`** — `routes deleteFileTreeItem`, mirroring the existing
  `routes moveFileTreeItem` case.
- **`web/src/DeleteFileDialog.test.tsx` (new)** — mirrors `UnsavedQuitDialog.test.tsx`'s coverage
  (renders the given name in the title, Enter/y confirms, Escape/n cancels, click outside is
  swallowed).
- **`web/src/FileTreeTab.test.tsx`** — add cases to the existing suite:
  - Backspace with a row selected opens the delete dialog with that row's name.
  - Delete key does the same.
  - Backspace/Delete with the `..` row selected does nothing (no dialog).
  - Backspace/Delete with no row selected does nothing.
  - Confirming the dialog sends `deleteFileTreeItem` with the selected row's path and closes the
    dialog; cancelling sends nothing and closes the dialog.

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the related server/web test
  suites.
- Manual (not run in this environment): select a file in the navigator, press Delete, confirm —
  the file disappears from the tree and from disk. Repeat for a directory. Press Backspace on a
  file and cancel — nothing changes.

## Out of scope

- Cmd+Z undo of a delete or move (separate, much larger `work/issues.md` entry — this plan does
  not add any delete-recovery/trash mechanism, since nothing currently depends on deletes being
  reversible).
- Multi-select delete — the tree has no multi-select anywhere already.
- Any change to `moveFileTreeItem`/`MoveConflictDialog`.
