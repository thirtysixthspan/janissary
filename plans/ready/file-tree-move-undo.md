# File tree move undo/redo

A focused file tree tab captures Cmd+Z / Cmd+Shift+Z (and their Ctrl+Z / Ctrl+Shift+Z
equivalents) to undo and redo its own moves — reversing a drag-and-drop move made in that tree
back to where the moved item came from, and re-applying an undone move if the user changes their
mind. Pressing undo repeatedly steps back through further moves in the same tab, one at a time;
pressing redo steps forward again through whatever was just undone, for as long as the tab has
stayed open. Deletions are not part of this: today's delete is a permanent, recursive `rmSync`
with no trash or backup (`src/file-tree-manager.ts:127-133`), and the user confirmed deletes
should stay non-undoable rather than changing delete's on-disk behavior to make them reversible.

## Design decisions

1. **Only moves are undoable/redoable; deletes remain permanent.** Undo/redo never touches a
   delete. Delete keeps using `rmSync` exactly as today — no move-to-trash, no
   backup-before-delete. This was an explicit choice over changing delete's on-disk behavior, to
   avoid altering an already-shipped, permanent-delete guarantee.
2. **Multi-level undo stack plus a redo stack, per tab, mirroring the editor's own undo/redo
   semantics exactly** (`web/src/editor/undo.ts`). Each successful move (whether from a
   drag-and-drop or a redo) pushes an entry onto that tab's undo stack. Undo pops the most recent
   undo entry, reverses it, and pushes it onto the redo stack; redo pops the most recent redo
   entry, re-applies it, and pushes it back onto the undo stack. **A new move made after an undo
   clears the redo stack** — same rule the editor's `UndoManager.record()` already applies
   (`web/src/editor/undo.ts:19-29`, "Any new edit invalidates the redo stack"): once the user
   diverges from the undone timeline by making a fresh move, the previously-undone moves are no
   longer reachable by redo.
3. **The stacks live server-side, in `FileTreeManager`, keyed per tab — not client-side.** This
   matches where `move()` and `delete()` already execute (`src/file-tree-manager.ts:114-122`) and
   where all other per-tab state already lives (`expanded`, `watchers`). The client never computes
   an inverse itself; it only tells the server "undo" or "redo," and the server knows what to
   reverse or re-apply. Two new protocol messages, `undoFileTreeItem` and `redoFileTreeItem`,
   carry these requests, following the exact shape of the existing
   `moveFileTreeItem`/`deleteFileTreeItem` messages.
4. **The stacks are purely in-memory per tab instance.** Both reset to empty when the tab closes,
   the same way `expanded` and `watchers` are discarded on `closeTab()` — there is no persistence
   keyed by root path, and reopening a tree on the same root starts with nothing to undo or redo.
5. **A conflict at the undo or redo destination shows the same overwrite confirmation used for a
   normal move.** If undoing or redoing a move finds an entry already sitting at the target path,
   the tree shows `MoveConflictDialog` (`web/src/MoveConflictDialog/MoveConflictDialog.tsx`)
   offering Overwrite or Cancel — the identical dialog and wording already used when a drag-drop
   move lands on an occupied name. Overwrite replaces the existing entry with the moved item and
   completes the undo/redo (pushing onto the opposite stack as usual); Cancel leaves both where
   they are and the pending entry stays on its stack unconsumed, so the same undo/redo can be
   retried later (e.g. after the conflicting file is itself moved or removed).
6. **An empty stack is a silent no-op.** If there is nothing to undo, or nothing to redo, the
   corresponding chord does nothing: no message, no dialog, no sound.
7. **Key bindings match the editor tab's undo/redo exactly.** Cmd+Z / Ctrl+Z undoes, Cmd+Shift+Z /
   Ctrl+Shift+Z redoes — the same four chords `web/src/editor/keys.ts:35,62` already bind to
   `{ kind: 'undo' }` / `{ kind: 'redo' }` for editor tabs. Both are carved out of the tree's
   existing "all Ctrl/Cmd chords pass through" rule (`FileTreeTab.tsx:89`,
   `if (e.ctrlKey || e.metaKey) return;`), the same way the editor tab already carves these chords
   out for its own text undo/redo — the two don't conflict since they're different tab kinds and
   these chords on a file tree tab are never reached while an editor tab is focused. No existing
   window-level binding uses Z (checked `web/src/useWindowKeys.ts`), so there's no shortcut
   collision to resolve.
8. **Specs and public documentation are updated as part of this feature, not deferred.**
   `specs/file-tree-tab.md` gets a new section documenting undo/redo (see Proposed changes →
   Docs), and the corresponding user-facing documentation under
   `documentation/user-documentation/` is updated to describe the new key bindings wherever the
   file tree's other keyboard interactions (move, delete) are already documented there.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Server-side move primitive to reverse a move with | `FileTreeManager.move()` | `src/file-tree-manager.ts:114-122` |
| Per-tab state map, keyed by label, torn down on tab close | `FileTreeManager`'s `tabs` map + `closeTab()` | `src/file-tree-manager.ts:14-19, 25, 136-142` |
| Client → server RPC → controller → manager chain for a file tree mutation | `moveFileTreeItem` | `src/protocol.ts:142`, `src/message-handler.ts:61`, `src/controller.ts:202-205` |
| Overwrite-conflict confirmation UI (dialog, keyboard, wording) | `MoveConflictDialog` + `useFileTreeDrag`'s `pendingConflict`/`confirmOverwrite`/`cancelConflict` | `web/src/MoveConflictDialog/MoveConflictDialog.tsx`, `web/src/useFileTreeDrag.ts:10, 21, 50, 105-110` |
| Carving a chord out of "Cmd chords pass through" for a tab-scoped action | Editor tab's own Cmd+Z handling | `web/src/editor/keys.ts:32-35` |
| Keydown entry point where a new chord check would be added | `FileTreeTab`'s `onKeyDown` | `web/src/FileTreeTab.tsx:88-95` |

## Proposed changes

### Server — `src/file-tree-manager.ts`

- `FilesTabState` gains `undoStack` and `redoStack` fields: ordered lists of past moves for that
  tab, each recording the item's relative path before and after the move (enough to reverse or
  re-apply it — the same two paths `move()` already takes).
- `move()` pushes an entry onto `undoStack` and clears `redoStack` after a successful
  `renameSync`, ahead of the existing `rebuild()` call — mirroring `UndoManager.record()`'s
  "any new edit invalidates the redo stack" rule (`web/src/editor/undo.ts:19-29`). A move driven
  by `undo()` or `redo()` themselves does not go through this path (see below), so it does not
  re-clear the opposite stack it's populating.
- A new `undo(label)` method: pops the most recent `undoStack` entry, computes whether the
  destination (the item's original location) is currently occupied, and either performs the
  reverse `renameSync`, rebuilds, and pushes the entry onto `redoStack`, or reports the conflict
  back to the caller (controller) without mutating either stack, so a caller-driven overwrite can
  retry the same entry.
- A new `redo(label)` method: the mirror image, popping the most recent `redoStack` entry,
  re-applying the original move, and pushing it back onto `undoStack`, or reporting a conflict the
  same way.
- `closeTab()` already deletes the tab's whole state entry, so no separate teardown is needed for
  either stack.

### Protocol and dispatch

- `src/protocol.ts`: add `{ method: 'undoFileTreeItem'; params: { index: number } }` and
  `{ method: 'redoFileTreeItem'; params: { index: number } }` to the `RpcCall` union, next to
  `moveFileTreeItem`/`deleteFileTreeItem`.
- `src/message-handler.ts`: add `case 'undoFileTreeItem'` / `case 'redoFileTreeItem'` dispatching
  to new `controller.undoFileTreeItem(message.params.index)` /
  `controller.redoFileTreeItem(message.params.index)`.
- `src/controller.ts`: add `undoFileTreeItem(index: number)` and `redoFileTreeItem(index: number)`,
  each resolving the tab label exactly as `moveFileTreeItem`/`deleteFileTreeItem` do, then calling
  `this.managers.fileTree.undo(label)` / `.redo(label)`. If either reports a conflict, the
  controller relays it to the client in the same shape a drag-drop conflict already reaches
  `useFileTreeDrag`'s `pendingConflict`, so the existing `MoveConflictDialog` renders unmodified.

### Client — `web/src/FileTreeTab.tsx`, `web/src/useFileTreeDrag.ts`

- `onKeyDown` (`FileTreeTab.tsx:88-95`) gets an undo/redo exception ahead of the existing
  `if (e.ctrlKey || e.metaKey) return;` bail, matching the editor's own binding table
  (`web/src/editor/keys.ts:32-35,49-67`): `(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z'`
  with `!e.shiftKey` sends `undoFileTreeItem`, with `e.shiftKey` sends `redoFileTreeItem`; either
  way `preventDefault`/`stopPropagation` are called first. Every other Cmd/Ctrl chord continues to
  fall through to the window handler unchanged.
- The conflict path reuses `useFileTreeDrag`'s existing `pendingConflict` state and
  `MoveConflictDialog` wiring in `FileTreeTab.tsx` — an undo- or redo-triggered conflict populates
  the same `pendingConflict` shape a drag-drop conflict does, so `confirmOverwrite`/
  `cancelConflict` handle all three without new dialog code. `confirmOverwrite` needs to know
  which of the three RPCs (`moveFileTreeItem`, `undoFileTreeItem`, `redoFileTreeItem`) triggered
  the pending conflict, so it can retry the right one.

### Docs

- `specs/file-tree-tab.md`: add an "Undoing and redoing a move" section alongside the existing
  "Moving files by drag-and-drop" and "Deleting a file or directory" sections, documenting the
  four key chords, the per-tab undo/redo stacks, the redo-stack-clears-on-new-move rule, their
  reset on tab close, the conflict dialog, and that deletes are not covered.
- `documentation/user-documentation/tab-types/file-navigator.md`: add rows to the existing
  "Keyboard" table (`## Keyboard`, currently lines 57-70) for the four new chords, following the
  style of the existing rows (e.g. `↑` / `↓` → "Move the selection").

## Tests

- `src/file-tree-manager.test.ts`: cover `undo()` and `redo()` — reversing the most recent move,
  reversing multiple moves in sequence (stack order), redoing after an undo, a fresh move after an
  undo clearing the redo stack, a no-op when either stack is empty, and the conflict case for both
  undo and redo where the target path is occupied (reports conflict, neither stack mutated; a
  follow-up overwrite call consumes the pending entry).
- A colocated test for the key handling in `FileTreeTab.test.tsx` (matching wherever drag-conflict
  handling is already tested): Cmd+Z/Ctrl+Z sends `undoFileTreeItem`, Cmd+Shift+Z/Ctrl+Shift+Z
  sends `redoFileTreeItem`; a conflict response from either opens `MoveConflictDialog`; confirming
  it retries the right RPC as an overwrite; cancelling leaves both stacks untouched.
- `web/src/FileTreeTab.test.tsx`: all four chords are intercepted (preventDefault/stopPropagation)
  while the tree is focused; other Cmd/Ctrl chords still fall through to the window handler
  unchanged.

## Out of scope

- Making deletes undoable/redoable (trash, backup-before-delete, or any other delete-reversal
  mechanism).
- Persisting the undo/redo stacks across a tab closing and reopening, or keying them by root path
  instead of tab instance.
- Any inline or toast feedback when there's nothing left to undo or redo — that case is a silent
  no-op.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff`
- Manual: open a file tree tab, drag a file into a subdirectory, press Cmd+Z and confirm it
  returns to its original location; press Cmd+Shift+Z and confirm it moves back into the
  subdirectory. Move a second file, then press Cmd+Z twice and confirm both moves reverse in the
  right order, then Cmd+Shift+Z twice and confirm both re-apply in the right order. Undo a move,
  then make a different move, then confirm Cmd+Shift+Z does nothing (redo stack was cleared).
  Create a same-named file at the original location before undoing a move and confirm the
  Overwrite/Cancel dialog appears and behaves like the existing drag-drop conflict dialog. Delete
  a file and confirm Cmd+Z does not restore it.
