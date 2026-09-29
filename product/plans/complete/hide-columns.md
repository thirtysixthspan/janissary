# Let the grid hide columns

**Complexity: 3/10** — one field on the payload, one intent carrying a whole set, one menu. The
non-obvious part is that hiding must not renumber the cells behind it.

## Goal

The grid renders every declared column in every layout, so a table with a few dozen columns is usable
only by horizontal scrolling. In a docked sidebar — the layout this feature is explicitly built for —
that is unusable, and the two-column centre layout gives the grid whatever the navigator leaves.

DB Browser for SQLite's table browser header menu offers hide column, show all columns, select
column and freeze column as one group of actions.

## Approach

Hiding is view state, and the query is untouched.

A hidden column is still selected and still filtered. That is what makes "show me the rows" and "show
me the columns" two separate questions, and it is why the set lives in the tab payload rather than in
`DatabaseGridQuery` — putting it in the query would make the host re-read a different result set for
what is a display choice.

The set is server-owned so it survives a tab update and a profile restore the way the filters do, and
the intent carries the **whole** set rather than a toggle, so a client cannot grow it one call at a
time into something the grid then has to reconcile. The handler still drops any name the statement
that ran does not carry, because a name that is not in it cannot be hidden and would leave an entry
nothing ever clears.

## Implementation steps

1. **`web/src/plugins/sql/grid-view.ts`** — `visibleColumns(columns, hidden)`, returning each shown
   column with the position it holds in the row's cells, and `toggleColumn(columns, hidden, name)`.
2. **`src/plugins/sql/shared.ts`** — `hidden: string[]` on `SqlPayload`, guarded as a list of names.
3. **`src/plugins/sql/shared-intents.ts`** — `SetColumnsIntent` carrying the whole set.
4. **`src/plugins/sql/intents.ts`** — the handler, and `select-object` dropping the set the same way
   it drops a filter the new object does not have.
5. **`web/src/plugins/sql/ColumnChooser.tsx`** — the menu and the control that opens it.
6. **`web/src/plugins/sql/DataGrid.tsx`** — render from the shown list.

## The part that is easy to get wrong

`row.cells` is positional, so dropping a column from the header without also dropping it from every
row would leave each cell after it showing its neighbour's value. That is why `visibleColumns` returns
the index alongside the name rather than a list of names.

## Notes from the build

- `intents.ts` passed the 200-line limit once the payload transformations grew, so `toggledOrder`,
  `withFilter`, `selected` and `withHidden` moved to `payload-changes.ts`. They are pure functions of
  the payload, and reading them without the request machinery around them is worth the extra file.

## Tests

`web/src/plugins/sql/grid-view.test.ts` — actually `Pager.test.tsx`, which is where the grid's
interaction tests now live — covers the positions, the toggle both ways, a name that is not a column,
a row rendered with a column hidden, the intent carrying the whole set, **Show all**, and the count on
the control. `src/plugins/sql/activate.test.ts` covers the handler, the empty set, and the drop on
object switch. `src/plugins/sql/shared.test.ts` covers the intent and payload guards.

## Out of scope

- Reordering columns. The `SELECT` carries the declared order, so reordering is a query change, not a
  view one — a different decision from hiding.
- Freezing a column while scrolling sideways. The dock is the narrow case, and the answer there is
  hiding rather than a second fixed pane.
- Persisting the hidden set per object rather than per tab.
