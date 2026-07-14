# Double-click to open a file in the file tree tab

**Complexity: 2/10** — purely a client-side event-handler change in a single component. The server and keyboard path are untouched.

## Goal

Change the file tree tab's mouse interaction: a single click on a file row **selects** it (sets `aria-selected`/CSS highlight) without opening it; a double click **opens** it (sends `open`/`edit` command). Directory rows keep their current single-click toggle behavior — a double-click also toggles (no extra semantics).

This matches the convention of VS Code's Explorer and most desktop file managers, where single-click selects and double-click opens.

## Background

Currently `FileTreeTab.tsx` handles all mouse clicks through `onRowClick`:

```ts
const onRowClick = (row: FileTreeRow, altKey: boolean) => {
    setSelected(row.path);
    if (row.dir) toggle(row.path);
    else if (altKey) editFile(row.path);
    else openFile(row.path);
};
```

A single click on a file immediately opens it. The fix splits selection from activation: single click → selection only; double click → open.

## Approach

1. Rename the existing `onRowClick` handler to `onRowSingleClick`, removing the `open`/`edit` branches for files (retain `toggle` for directories and `setSelected` for all).
2. Add an `onRowDoubleClick` handler that opens/edits files (and toggles directories, consistent with single-click).
3. Wire both handlers to the row `div`: `onClick` → `onRowSingleClick`, `onDoubleClick` → `onRowDoubleClick`.
4. Update tests: single-click-on-file no longer sends a command; double-click-on-file does.
5. Update `spec/file-tree-tab.md` mouse-interactions table.

## Implementation

1. **`web/src/FileTreeTab.tsx`** — modify `onRowClick` and add `onRowDoubleClick`:
   - `onRowClick`: `setSelected` for all rows; `toggle` only for directories.
   - `onRowDoubleClick`: `toggle` for directories, `openFile`/`editFile` for files.
   - JSX: add `onDoubleClick` to the row `div`.

2. **`web/src/FileTreeTab.test.tsx`** — update existing tests + add double-click tests.

3. **`spec/file-tree-tab.md`** — update the mouse interactions table.

## Tests

- `web/src/FileTreeTab.test.tsx`:
  - Single-click on a file row sends **no** command (assert `send` was not called, or only the selection effect is present).
  - Double-click on a file row sends `{ method: 'command', params: { text: 'open <path>' } }`.
  - Alt+double-click on a file row sends `{ method: 'command', params: { text: 'edit <path>' } }`.
  - Single-click on a directory row still sends `fileTreeToggle`.
  - Double-click on a directory row sends `fileTreeToggle` (same as single click).
  - Keyboard Enter/Space on a selected file row still opens it (no change).

## Out of scope

- Server-side changes (none needed).
- Keyboard navigation changes (Enter/Space still open on single press).
- Any other file tree tab issues from `docs/small-issues.md`.
