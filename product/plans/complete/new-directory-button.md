# Add a new-directory button to the file navigator

**Complexity: 4/10** — the new action follows the existing new-file path across the file-tree
header, command dispatch, and filesystem manager. It adds no new UI state or protocol surface.

## Goal

Let users create a directory from the file navigator header. The button should sit beside New
file and use the same selected-row rules to decide where the new item belongs.

## Approach

Add a New directory button that dispatches an internal `newdir` command for an `untitled`
directory. Reuse the new-file target-directory helper so a selected directory is the parent, a
selected file uses its containing directory, and no selection or `..` uses the tree root. Create
the directory with the shared next-free-name helper, suffixing collisions as `untitled-2`,
`untitled-3`, and so on. The existing file-tree watcher will refresh the displayed rows.

## Implementation

1. **`web/src/file-tree-new-file.ts`, `web/src/FileTreeTab.tsx`, `web/src/FileTreeHeader.tsx`,
   `web/src/icons.ts`, and `web/src/theme.css`** — add the new-directory command builder, header
   button and icon, wire it to the same target-directory resolution as New file, and include it in
   the existing file-tree action-button styling.
2. **`src/open-file-manager.ts`, `src/commands/new-directory.ts`, and `src/commands/index.ts`** —
   add collision-safe directory creation and register the internal `newdir <directory>` command.
3. **`web/src/file-tree-new-file.test.ts`, `web/src/FileTreeTab.test.tsx`,
   `src/open-file-manager.test.ts`, and `src/commands/new-directory.test.ts`** — cover command
   construction and dispatch, target selection, command validation, directory creation, and
   collision suffixing.
4. **`product/specs/file-tree-tab.md`** — specify the button placement, target-selection rules,
   default directory name, and collision behavior.
5. **`documentation/user-documentation/tab-types/file-navigator.md`** — extend the existing
   new-item documentation with the new-directory action.

## Tests

- The command builder produces root and nested `newdir` targets.
- The header renders New directory and clicking it targets a selected directory, a selected
  file's parent, or the tree root as appropriate.
- The internal command matches case-insensitively, rejects unrelated input, reports missing
  targets, and delegates valid targets.
- Directory creation creates the requested directory and chooses the next free suffixed name
  when collisions exist.

## Out of scope

- A keyboard shortcut for creating directories.
- Inline directory naming or renaming.
- Changing New file behavior or its `Cmd+N` / `Ctrl+N` shortcut.
