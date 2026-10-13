# Give the SQL tab and grid one pure write projection

**Complexity: 3/10** — one framework-free module, two component call-site updates, direct function tests, and a focused spec clarification. The SQL protocol and user-visible behavior stay unchanged.

## Goal

Make the SQL tab's insert control and grid write controls derive from the same selected-object and statement-result projection, and initialize a cell draft from its named column through one tested lookup.

## Approach

Add `web/src/plugins/sql/grid-state.ts`. Its selected-object projection receives the SQL payload and returns the selected object, whether the current grid is a statement result, whether it is writable, and the existing read-only explanation composed from `grid-view.ts`. Its cell-draft lookup receives the grid, row, and column name, finds the current positional cell by the grid's declared column order, and preserves the current `null` for SQL NULL and empty string for missing cells.

Use the projection in `SqlTab.tsx` and `DataGrid.tsx` without changing their props, insert-form visibility, or draft hooks. Keep `statementResult` and `readOnlyReason` as the existing sources of server keyless-state and explanation behavior.

## Implementation steps

1. Add the pure projection and cell-draft module with direct tests for missing selection, a read-only view, an empty keyless result, reordered columns, missing cells, and null versus empty text.
2. Replace the separate selected-object/write computations in `SqlTab` and `DataGrid`, and route cell edit initialization through the named-column lookup.
3. Clarify the SQL editing spec that the selected object and server-marked statement result jointly determine whether writes are offered, and that cell editing uses the corresponding named column's value.

## Tests

- Add direct `grid-state.test.ts` coverage for all six cases above.
- Preserve existing `SqlTab.test.tsx`, `DataGrid.test.tsx`, and `grid-view.test.ts` assertions for read-only views, keyless results, normal table editing, NULL drafts, and request acceptance.
- Run `./scripts/run.mjs check-diff` after each change.

## Spec and documentation

Update `product/specs/sql-database.md` in the Editing and read-only sections. The user-visible rules are already documented in `help.md` and the SQL public documentation, so no documentation change is needed.

## Out of scope

- Changing the server-side SQL keyless flag, intent contract, or validation.
- Changing SQL tab behavior, component props, insert-form visibility, or draft acceptance.
- Moving stateful editing or write actions out of their existing owners.
