# Context menu Delete deletes the whole multi-selection

## Complexity
3/10 — one conditional in an existing handler, a doc-comment update, and tests. No new state or architecture: the file navigator already computes `selection.operationPaths` and already has an identical selection-vs-row branch for the plugin-contributed menu entry (`FileNavigatorTab.tsx`'s `selectionAction.query` call).

## Problem
Pressing the Delete/Backspace key already deletes every selected file (`useFileNavigatorKeyDown.ts` sends `deletion.request(selection.operationPaths)`, and `useFileNavigatorDelete.ts` batches with `deleteFileNavigatorItems` whenever more than one path is pending). But the row context menu's Delete entry ignores the selection entirely: `FileNavigatorTab.tsx`'s `remove` action always builds a single-path set from the row that was right-clicked (`normalizeOperationPaths(files.rows, new Set([row.path]))`), so right-clicking a file that is part of a multi-selection and choosing Delete removes only that one file, silently leaving the rest of the selection alone. Right-click intentionally does not change the current selection (see the comment in `use-file-navigator-row-events.ts`'s `onRowContextMenu`), so a user who multi-selects, right-clicks one of the selected rows, and picks Delete reasonably expects the whole selection to go — matching the Finder/Explorer convention, and matching how this codebase already treats the plugin-contributed selection entry in the same menu.

## Solution
Give the context menu's Delete action the same selection-aware branch the plugin-contributed entry already uses: when the right-clicked row is part of the current selection, delete the whole selection (`selection.operationPaths`); otherwise (right-clicking a row outside the selection, as today), delete just that row. Every other menu action (Open, Copy, Rename, ...) keeps acting on the clicked row only — this exception is scoped to Delete, matching how destructive multi-file actions are conventionally handled.

## Changes

### `web/src/FileNavigatorTab.tsx`
- Change the `remove` entry in `menuActions` from always building a single-row path set to:
  `remove: (row) => deletion.request(selection.selected.has(row.path) ? selection.operationPaths : normalizeOperationPaths(files.rows, new Set([row.path])))`

### `web/src/file-navigator-menu-items.ts`
- Update the top-of-file comment (which currently states "Every action takes the right-clicked row rather than the selection") to note the one exception: Delete acts on the whole selection when the clicked row belongs to it.

### `web/src/FileNavigatorTab.test.tsx`
- Add a test under `describe('row context menu', ...)`: with two rows selected (e.g. via Cmd-click), right-clicking one of the selected rows and choosing Delete shows `Delete 2 items?` and, on confirm, sends `deleteFileNavigatorItems` with both paths.
- Keep the existing `choosing Delete opens the ordinary delete confirmation` test as-is — it right-clicks a row that isn't part of any multi-selection, so it continues to exercise the single-row path.

## Tests
- New: context-menu Delete on a row inside a multi-selection deletes the whole selection (batch confirm dialog + `deleteFileNavigatorItems` send).
- Existing coverage (unchanged) confirms right-click outside a selection still deletes only the clicked row, and that right-click never mutates the selection itself.

## Out of scope
- Changing any other context-menu action (Copy, Rename, Open, ...) to become selection-aware — only Delete is affected, per the issue.
- Changing keyboard Delete/Backspace behavior, which already deletes the whole selection.
- Server-side batch delete handling (`deleteFileNavigatorItems`), which already exists and is unchanged.
