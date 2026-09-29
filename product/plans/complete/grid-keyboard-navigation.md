# Give the grid its keyboard navigation

**Complexity: 5/10** — a new pure rule, a hook that binds it, and the wiring in one component. The
shape is small; the reason it is here is that a plan recorded a decision as settled and the diff
carries neither the decision nor a note that it moved.

## Goal

`product/plans/complete/sql-database-browser.md` settles the keyboard explicitly — "the grid's arrows
move the cell selection, Enter opens the editor on the selected cell, Escape leaves the editor and
then leaves the grid, and Tab is left to the host" — and names `sql-keys.ts` to hold it, modelled on
`web/src/plugins/schedules/schedules-keys.ts`. The diff contains no arrow or Enter handling and no
such module. The only key the grid answers is the platform's copy shortcut, in
`web/src/plugins/sql/selection.tsx`.

A grid reachable only with a pointer is not usable by keyboard or by screen reader.

The shared rule the other plugin lists use, `nextListSelection` in
`web/src/shared/list-selection.ts`, is one-dimensional: a list of rows. A grid is two-dimensional, so
it needs its own rule rather than a stretched copy — but it should keep the same character, which is
that the arrows stop at the ends rather than wrapping.

## Approach

A pure two-dimensional rule in `web/src/plugins/sql/sql-keys.ts`, plus the hook that binds it, so the
arithmetic is testable without a render and `DataGrid.tsx` does not grow past its 200-line limit.

## Implementation steps

1. **`web/src/plugins/sql/sql-keys.ts`** (new) — `nextCellSelection(rows, columns, at, key)` returning
   the position a key moves to: `ArrowLeft`/`ArrowRight` along the row, `ArrowUp`/`ArrowDown` down the
   column, `Home`/`End` to the ends of the row, all non-wrapping and all stopping at the ends, any
   other key returning the position unchanged, an empty grid returning null, and no position yet
   starting at the first cell. Export the navigation keys alongside it so a caller can `preventDefault`
   only the ones it handled. `useGridKeys` in the same file owns the window listener, gated on
   `capabilities.active` the way `selection.tsx` gates the copy shortcut, and reports Escape and Enter
   separately from movement so the component stays a caller and not a listener.
2. **`web/src/plugins/sql/DataGrid.tsx`** — hold the cursor, forget it when the grid changes (a new
   page, like the mouse selection), and pass it down so the cell at the cursor reads as selected when
   no mouse run is in progress. Enter opens the editor on the cursor's cell when the object is
   writable; Escape clears the cursor. Leave Tab to the host as the plan decided, so the grid does not
   trap focus.
3. **`web/src/plugins/sql/GridRow.tsx`** — no change is needed if `DataGrid` folds the cursor into the
   `selected` predicate it already passes down.

## Tests

- **`web/src/plugins/sql/sql-keys.test.ts`** (new) — the rule at the edges: an arrow at the first cell
  stays, an arrow past the last cell stays, Up and Down move within a column and stop at the rows, Home
  and End reach the row's ends, an unrelated key changes nothing, an empty grid has no selection, and
  the first movement key with no selection yet lands on the first cell. Style it after
  `web/src/plugins/sql/grid-view.test.ts`.
- **`web/src/plugins/sql/DataGrid.test.tsx`** — one case driving the real listener: render, press
  `ArrowRight`, assert the second cell reads as selected, press `Enter`, and assert `update-cell` is
  what a later Enter sends — the editor opens on the cursor's cell. Dispatch on `globalThis` the way
  `Selection.test.tsx` does, and give `makeCapabilities` a tab that is active.

`product/specs/sql-database.md` describes the editor as reached by double-clicking. Add the keyboard
route beside it.
