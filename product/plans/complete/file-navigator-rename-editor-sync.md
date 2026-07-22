# Rename a file/directory in the file navigator, syncing any open editor tab

**Complexity: 5/10** — a small, precedented feature (mirror the existing `deleteFileTreeItem` RPC
chain end-to-end, as already scoped by `product/plans/ready/rename-file-in-file-navigator.md`)
plus one additional cross-tab sync step this backlog issue specifically asks for. Touches web +
server across seven files plus a new protocol method; no new subsystem.

## Goal

The file navigator has no way to rename a file or directory in place today — only drag-and-drop
moves (`FileTreeManager.move`, `src/file-tree/manager.ts:123-134`) and delete exist. The backlog
asks: "if a file is renamed in the file navigator, and it is open in an editor tab, file names in
both locations need to be updated." Since the navigator has no rename capability at all yet, this
issue is only fixable by adding one, so this plan builds the minimal rename feature and wires the
sync the issue asks for directly into it — the two can't be separated.

This supersedes `product/plans/ready/rename-file-in-file-navigator.md` (never implemented), reusing
its design wholesale and adding the editor-tab sync step it did not cover. That file is superseded
by this one and removed once this plan completes.

## Design decisions (carried over from the superseded plan)

1. **Scope: files and directories.** Any selected row except `..` can be renamed, matching how
   delete and move already treat both. `renameSync` is identical for either.
2. **Chord: Cmd+R on macOS, Ctrl+R elsewhere**, gated on a renameable row (not `..`) being selected;
   otherwise a no-op. The tree already captures `Cmd+Z`/`Cmd+N` the same way
   (`web/src/FileTreeTab.tsx:110-121`), so this is a sibling branch before the generic
   `if (e.ctrlKey || e.metaKey) return;` guard. A plain `r` keypress remains type-ahead (unaffected,
   since the chord requires `ctrlKey || metaKey`).
3. **Inline editable field, not a dialog.** Reuses the existing `InlineEditInput` component
   (`web/src/InlineEditInput.tsx`) already used for tab-label rename — same
   double-click-free/chord-triggered edit, Enter-or-blur-to-commit, Escape-to-cancel contract, full
   value selected on focus. This is a deliberate simplification versus the superseded plan's
   "pre-select basename only" idea: reusing the existing shared component as-is (full-value select)
   avoids adding a bespoke selection-range prop to a well-tested shared input for a UX nicety no
   backlog item asked for.
4. **Commit only on a real change.** Empty/whitespace or unchanged name is a silent no-op that just
   closes the field.
5. **Escape and blur both cancel**, restoring the static name with no on-disk change.
6. **Name collision reuses the existing `MoveConflictDialog`** (`web/src/MoveConflictDialog/MoveConflictDialog.tsx`),
   exactly as the drag-move flow already does — Overwrite replaces and completes the rename, Cancel
   reopens the edit field.
7. **No undo/redo entry.** A rename does not join the tab's move undo/redo stack
   (`state.undoStack`/`state.redoStack` in `src/file-tree/manager.ts`) and is not reversible with
   `Cmd+Z`, keeping that stack move-only.
8. **`renameSync` inherits its limits** (won't replace a non-empty directory or cross a file/dir type
   mismatch) — the manager's try/catch silently no-ops on failure, matching `move`.

## New: editor-tab sync (the backlog issue's actual ask)

9. **An open editor tab pointed at the renamed file is retargeted, not left stale.** Today nothing
   does this: `EditorWatchManager.check()` (`src/editor/watch-manager.ts:64-75`) `statSync`s the
   *fixed* path recorded at watch-time, so a navigator rename/move silently orphans any editor tab
   open on that exact file — its `path`/`name` never update, confirmed by reading the current
   `move()` path, which touches nothing under `Managers.tab`. Add `TabManager.retargetEditorTab(oldAbsPath, newAbsPath)`
   in `src/tab/manager.ts`, modeled on the existing `renameEditorTab` (`src/tab/rename-editor.ts`)
   bookkeeping but without repeating the disk rename (the file tree manager already performed it):
   finds the tab whose `tab.editor?.path === oldAbsPath` (per `product/specs/editor-tab.md`, at most
   one editor tab is ever open per absolute path), and if found sets
   `tab.editor = { ...editor, path: newAbsPath, name: path.basename(newAbsPath), url: this.registerFile(newAbsPath) }`,
   `tab.title = name` (an editor tab's title always tracks its file name — no alias concept, per
   `editor-tab.md`), persists, calls `this.managers.editorWatch.watch(tab.label, newAbsPath)` to
   re-baseline the live-reload watcher at the new path, and emits `state: dirty`. No-op if no tab
   matches.
10. **`FileTreeManager.rename()` calls it after a successful on-disk rename**, before rebuilding —
    `this.managers.tab.retargetEditorTab(oldAbs, newAbs)`. If no editor tab has that file open, this
    is a no-op, so the drag-move-only-path behavior is untouched (`move()` itself is out of scope —
    see below).
11. **Directory renames are not cascaded to files inside them.** The backlog issue's wording is
    "if a file is renamed" — an editor tab open on a file *inside* a renamed *directory* going stale
    is a real but separate gap (would require prefix-rewriting every open editor path, a materially
    bigger change) and is explicitly out of scope here.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How it's reused |
|---|---|---|
| On-disk rename primitive | `src/file-tree/manager.ts:123-134` `move()` uses `renameSync` | The new `rename` method does `renameSync(oldAbs, newAbs)` in the same directory, inside the same try/catch-silent-noop shape. |
| Client → server RPC chain for a tree mutation | `deleteFileTreeItem`: `src/protocol.ts:195` → `src/message-handler.ts:71-82` → `src/message-handler-file-tree.ts:22` → `src/controller.ts:203-205` → `src/controller/file-tree.ts:26-29` `deleteFileTreeItem` → `manager.delete` | The new `renameFileTreeItem` RPC is added at every one of these five sites. |
| Rebuild-and-watch refresh | `manager.rebuild(label)`, called at the end of `move`/`delete` | The rename calls `rebuild` too, so the new name shows immediately. |
| Selection-clamp after rebuild | `web/src/FileTreeTab.tsx:60-64` | After a rename the old path disappears; the rename flow additionally sets selection to the new path so it follows the item. |
| Overwrite/Cancel conflict dialog | `web/src/MoveConflictDialog/MoveConflictDialog.tsx` | Rendered for a rename collision with the same `{ name, onOverwrite, onCancel }` props. |
| Inline edit input | `web/src/InlineEditInput.tsx` | Reused as-is for the row's editable field (see Decision 3). |
| Editor tab's own rename bookkeeping | `src/tab/rename-editor.ts` `renameEditorTab` | Model for the new `retargetEditorTab`, minus the disk rename it already performed via the tree. |
| Hook extraction for tree sub-behaviors | `web/src/useFileTreeSearch.ts`, `web/src/useFileTreeDrag.ts`, consumed in `FileTreeTab.tsx:46-47` | Rename orchestration goes in a new `useFileTreeRename` hook of the same shape, keeping `FileTreeTab.tsx` under the 200-line limit. |

## Implementation steps

Protocol type first, then the server chain, then the client, so `npm run typecheck:diff` stays
green at each checkpoint.

1. **`src/protocol.ts`** — add, next to `deleteFileTreeItem`:
   `| { method: 'renameFileTreeItem'; params: { index: number; relPath: string; newName: string } }`
   with a doc comment matching the surrounding style.
2. **`src/message-handler.ts`** — add `case 'renameFileTreeItem':` to the shared case group
   (lines 71-82) that dispatches to `handleFileTreeMessage`.
3. **`src/message-handler-file-tree.ts`** — add `'renameFileTreeItem'` to the `FileTreeMessage`
   `Extract<…>` union and a `case 'renameFileTreeItem':` calling the new `renameFileTreeItem`
   function directly with `controller.managers` (mirroring how `fileTreeSearch`/`revealFileTreeItem`
   are already called directly rather than through a `Controller` pass-through method — `controller.ts`
   has no headroom left under the 200-line limit for another one-line wrapper), reaching the shared
   `reply({ …, result: 'ok' })`.
4. **`src/controller/file-tree.ts`** — add `renameFileTreeItem(managers, index, relPath, newName)`
   resolving the tab index to its label and delegating to `managers.fileTree.rename`.
6. **`src/tab/manager.ts`** — import `node:path`; add `retargetEditorTab(oldAbsPath, newAbsPath)`
   per Decision 9.
7. **`src/file-tree/manager.ts`** — add `rename(label, relPath, newName)`: resolve tab state
   (return if absent); reject a `newName` containing `/` or the platform separator as a no-op (never
   moves to another directory); compute `oldAbs = path.join(state.root, relPath)` and
   `newAbs = path.join(path.dirname(oldAbs), newName)`; `renameSync` inside try/catch-silent-noop;
   on success call `this.managers.tab.retargetEditorTab(oldAbs, newAbs)` then `this.rebuild(label)`.
   Does not touch `undoStack`/`redoStack` (Decision 7).
8. **Client — new pure module `web/src/file-tree-rename.ts`** (mirrors `file-tree-new-file.ts`):
   `computeRename(relPath, rawName)` → `{ type: 'noop' }` or `{ type: 'rename'; newRelPath }` (noop
   when trimmed name is empty or equals the current basename); `hasRenameCollision(newName, siblingNames)`.
9. **Client — new hook `web/src/useFileTreeRename.ts`** (same shape as `useFileTreeDrag`/`useFileTreeSearch`):
   owns `editing` (relPath or null) and `draft` state; `begin(relPath, currentName)`; `commit()` —
   computes the outcome via `computeRename`, closes the field, no-ops on `noop`, opens
   `MoveConflictDialog`-driving pending state on a same-directory collision (computed from the rows
   the component already has), otherwise sends `renameFileTreeItem` and updates selection to the new
   path; `cancel()`; `confirmOverwrite()`/`cancelConflict()` for the conflict dialog.
10. **`web/src/FileTreeTab.tsx`** — consume `useFileTreeRename` (one added line, alongside the other
    two hooks); render a second `MoveConflictDialog` block for the rename hook's pending state,
    alongside the existing drag one. Adding the rename chord and the editable-field row rendering
    pushed the file over the 200-line limit, so two extractions came with it (not anticipated at
    planning time, discovered during implementation): the ctrl/meta chord dispatch (undo/redo,
    new-file, rename) moved to a new pure `web/src/file-tree-chords.ts` (`handleTreeChord`), and each
    row's markup (chevron + name span/`InlineEditInput` swap) moved to a new `web/src/FileTreeRowView.tsx`
    component. Both also incidentally fixed a `sonarjs/cognitive-complexity` warning `onKeyDown` picked
    up from the added chord branch. Testing also surfaced a real bug: `InlineEditInput`'s own
    Enter/Escape keydown handling doesn't call `stopPropagation`, so those keystrokes bubble up to the
    tree's own `onKeyDown` and get double-handled (Enter while renaming also re-triggered the tree's
    "open the selected row" navigation action; Backspace while editing a name would have opened the
    delete-confirmation dialog). Fixed by returning early from the tree's `onKeyDown` whenever
    `rename.editing !== null`, so the input owns every keystroke while a rename is in progress.
11. **Spec — `product/specs/file-tree-tab.md`**: add a `Cmd+R` / `Ctrl+R` row to the "Keyboard
    interactions" table (next to `Cmd+N`); add the rename chord to the paragraph listing chords the
    tree captures for itself (currently naming only undo/redo and `Cmd+N`); add a short "Renaming a
    file or directory" prose section describing the inline field, commit-only-on-change,
    Escape/blur cancel, the Overwrite/Cancel collision dialog, and that an editor tab already open on
    the renamed file updates to the new name/path automatically.
12. **Spec — `product/specs/editor-tab.md`**: near the existing "Editing an editor tab's label…"
    paragraph, add a sentence noting that renaming the same file from the file navigator (rather than
    via the tab label) updates the open editor tab's name and path the same way, without reloading
    its buffer or losing unsaved content.
13. **Remove the superseded plan** `product/plans/ready/rename-file-in-file-navigator.md` once this
    plan is implemented (its content is fully carried forward here).

## Tests

- `src/file-tree/manager.test.ts` (extend): `rename` renames a file on disk and rebuilds; renames a
  directory; is a silent no-op when the source is missing or `renameSync` throws; is a no-op when
  `newName` contains a path separator; calls `managers.tab.retargetEditorTab` with the old/new
  absolute paths on success and does not call it when the target has no matching editor tab (add a
  `retargetEditorTab: vi.fn()` to the test's `managers.tab` mock, mirroring its existing `setCwd`/`cur`
  style).
- `src/tab/manager.test.ts` (extend, or a focused new test if that file doesn't already cover
  `renameTab`/editor bookkeeping — check first): `retargetEditorTab` updates `tab.editor.path/name/url`
  and `tab.title` for the matching tab, calls `editorWatch.watch` with the new path, and is a no-op
  when no open editor tab matches the old path.
- `web/src/file-tree-rename.test.ts` (new): `computeRename` — unchanged name → noop; empty/whitespace
  → noop; a genuine change → the computed new relative path in the same directory;
  `hasRenameCollision` true/false against a sibling-name set.
- `web/src/FileTreeTab.test.tsx` (extend): the rename chord (`ctrlKey`/`metaKey` + `r`) on a selected
  file opens an editable field pre-filled with the name; Enter with a changed name sends
  `renameFileTreeItem` with the right params and closes the field; Enter with no change sends
  nothing; Escape and blur both cancel without sending; the chord on the `..` row (or no selection)
  does nothing; committing a name colliding with a visible sibling opens `MoveConflictDialog`, whose
  Overwrite sends the RPC and whose Cancel reopens the field.

Run `./scripts/run.mjs check-diff` after each step; all tests must pass before merge.

## Docs

- Checked `help.md` — no per-file-tree-key documentation to update (the tree's keyboard chords
  aren't listed there).
- Checked `documentation/user-documentation/` for file-tree-tab keyboard documentation; update the
  key table there only if it duplicates `file-tree-tab.md`'s table (confirm before editing).

## Out of scope

- Undo/redo of a rename (Decision 7).
- Renaming into a different directory via the field (cross-directory moves stay drag-and-drop only).
- Renaming the `..` row or the tree root.
- Multi-select / bulk rename.
- A `rename` command-line verb for the file navigator (direct-interaction affordance only).
- Cascading sync to editor tabs open on files *inside* a renamed directory (Decision 11).
- Syncing editor tabs on a drag-and-drop **move** (only the new **rename** RPC gets the sync step;
  extending it to `move` is a natural follow-up but is a separate, unrequested behavior change).
- The other two remaining backlog issues (rename-input field width, new-directory auto-rename) —
  separate fixes, to be picked up in later runs of this task.
