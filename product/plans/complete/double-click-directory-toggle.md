# Double-click to toggle a directory in the file tree tab

**Complexity: 2/10** — purely a client-side event-handler change in a single component. Removes the `toggle` call from the single-click handler for directories and keeps it only in the double-click handler.

## Goal

Change the file tree tab's directory interaction: a single click on a directory row **selects** it (like a file row) without toggling expand/collapse; a double click **toggles** it. This makes directory rows consistent with file rows — single-click selects, double-click activates.

## Background

Currently `onRowClick` toggles directories on single click (`row.dir → toggle`), while `onRowDoubleClick` also toggles them. After the fix, only `onRowDoubleClick` toggles — `onRowClick` just selects, matching the file-row behavior.

## Approach

1. Remove the `if (row.dir) toggle(row.path)` branch from `onRowClick` — single click on a directory row only selects.
2. Keep the `if (row.dir) toggle(row.path)` in `onRowDoubleClick` — double click toggles.
3. Update tests: single-click-on-directory no longer sends `fileTreeToggle`; double-click-on-directory still does.
4. Update `spec/file-tree-tab.md` mouse-interactions table.

## Implementation

1. **`web/src/FileTreeTab.tsx`** — line 42: remove `if (row.dir) toggle(row.path);` from `onRowClick`.

2. **`web/src/FileTreeTab.test.tsx`** — update test at line 33: single-click on a directory row should NOT send any command (expect `send` not called). Keep double-click test at line 41 as-is.

3. **`spec/file-tree-tab.md`** — line 54: change "Click a directory row" behavior from "Select it and toggle expand/collapse" to "Select it". Line 57: change "Double-click a directory row" behavior from "Same as click — toggle expand/collapse" to "Select it and toggle expand/collapse".

## Tests

- `web/src/FileTreeTab.test.tsx`:
  - Single-click on a directory row sends **no** command (assert `send` was not called).
  - Double-click on a directory row still sends `fileTreeToggle` (existing test, no change).

## Out of scope

- Keyboard navigation (ArrowRight/ArrowLeft still toggle directories — that is correct behavior for keyboard users).
- File-row behavior (already single-click = select only).
- Any other file tree tab issues.
