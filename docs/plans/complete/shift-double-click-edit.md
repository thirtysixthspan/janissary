# Shift+Double-Click to Edit in the File Tree

**Complexity: 1/10** — purely a modifier-key rename across two client-side modules. No new logic, no architecture change.

## Goal

Change the modifier key that opens a file in the plain-text editor from `Alt` to `Shift` in the file tree tab. `Shift+double-click` on a file row sends `edit <path>`; `Shift+Enter` on a selected file row does the same via keyboard.

## Background

The current implementation uses `e.altKey` to distinguish "open" from "edit" on double-click (`FileTreeTab.tsx:45-49`). The same `altKey` parameter flows through `file-tree-keys.ts` for the keyboard path (`Shift+Enter`). The request is to use `Shift` instead — a more discoverable modifier for this action.

This is a pure rename: `altKey` → `shiftKey`, `Alt` → `Shift` in comments and labels. No behavior changes beyond the modifier swap.

## Approach

1. Rename the `altKey` parameter to `shiftKey` in both `FileTreeTab.tsx` and `file-tree-keys.ts`.
2. Change the event modifier read from `e.altKey` to `e.shiftKey` in `FileTreeTab.tsx` (both the double-click handler invocation and the keyboard handler invocation).
3. Update test descriptions and event options in the test files.
4. Update the spec to reflect `Shift+double-click` and `Shift+Enter`.

## Implementation

1. **`web/src/FileTreeTab.tsx`** — four changes:
   - Line 45: parameter `altKey: boolean` → `shiftKey: boolean`
   - Line 47: `else if (altKey)` → `else if (shiftKey)`
   - Line 65: `e.altKey` → `e.shiftKey`
   - Line 106: `e.altKey` → `e.shiftKey`

2. **`web/src/file-tree-keys.ts`** — four changes:
   - Line 43: parameter `altKey: boolean` → `shiftKey: boolean`
   - Line 46: `altKey ? 'edit'` → `shiftKey ? 'edit'`
   - Line 54: parameter `altKey: boolean` → `shiftKey: boolean`
   - Line 68: `altKey` → `shiftKey`

3. **`web/src/FileTreeTab.test.tsx`** — two changes:
   - Line 65: test description `'Alt+double-click...'` → `'Shift+double-click...'`
   - Line 69: `{ altKey: true }` → `{ shiftKey: true }`

4. **`web/src/file-tree-keys.test.ts`** — two changes:
   - Line 116: test description `'Alt+Enter...'` → `'Shift+Enter...'`
   - Line 117: no change needed — the boolean `true` is just a positional argument; its semantics change with the parameter rename

5. **`spec/file-tree-tab.md`** — two changes:
   - Line 58: `Alt+double-click` → `Shift+double-click`
   - Line 78: `Alt+Enter` → `Shift+Enter`; `(mirrors Alt+click)` → `(mirrors Shift+double-click)`

## Tests

All tests already exist and cover the modified behavior; only test descriptions and event options need updating. The `file-tree-keys.test.ts` test at line 117 that passes `true` for the modifier does not need its argument changed — the boolean means "edit modifier pressed", and after the rename it represents `shiftKey` instead of `altKey`.

No new tests needed. Run `./scripts/run.mjs check-diff` after each file change.

## Out of scope

- No server-side changes.
- No changes to any other tab type or component.
- No changes to the `docs/plans/complete/file-tree-tab.md` design plan (it is an historical document, not the spec).
- No changes to `docs/small-issues.md` beyond removing the fixed entry.
