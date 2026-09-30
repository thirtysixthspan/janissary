# Let a filter be switched off and on without being retyped

**Complexity: 3/10** — one optional field on the filter contract, one intent, one intent handler, one derived payload change, chips become buttons, five test cases.

## Goal

A filter that is in the way can only be got rid of by retyping it: setting the same column the same
way removes it, and **Clear filters** removes every filter, including the three that were wanted.
There is no state between "in force" and "gone", so a filter cannot be parked while another question
is asked.

A chip that is switched off is that state. It stays in the payload, keeps its column, operator and
value, and is drawn greyed out; the query leaves it out, so the grid shows what the remaining filters
say.

## Approach

`enabled` joins the filter as an **optional** field, absent meaning enabled. Optional rather than
required because the payload is version 1 and is written into profiles: a tab restored from a
profile saved before this change carries filters with no `enabled`, and the contract already accepts
an absent optional part as the same as a null one. `isFilterOn` in the shared module is the one
reader, so the client and the server cannot disagree about what a filter with no flag means. It
stays an arrow constant rather than a function declaration only because the file sits at the
200-line limit: a client plugin may import one `@shared` module — its own `shared.ts` — so the
contract cannot be split to make room, and every line in it has to earn its place.

The wire does not change. `gridQueryOf` filters to the enabled ones and builds each remaining filter
by hand, so the `enabled` field never reaches a `DatabaseFilterView` — the host's query builder has
no reason to know that a filter can be parked, and the pager's "counted without filters" line stays
right because a page with only parked filters carries none of them.

A separate `set-filter-enabled` intent rather than a field on `set-filter`, because the two do
different things: `set-filter` replaces a column's filter or removes it when the new one is
identical, and a toggle would then be indistinguishable from a re-application. It also carries the
state the chip is switching *to* rather than asking the server to flip, so two rapid double-clicks
cannot cancel each other out by both asking for "the other one".

The chip becomes a `<button>` with `aria-pressed` and a `title` of **Disable** or **Enable** — not
`disabled`, because a disabled button takes no pointer events, so there would be nothing to hover
for the tooltip and nothing to double-click to switch it back on. The greyed-out look is a class.

## Implementation steps

1. **`src/plugins/sql/shared.ts`** — `enabled?: boolean` on `SqlFilter`, `isFilterOn` beside it, and
   the guard accepts the field when it is there.
2. **`src/plugins/sql/shared-intents.ts`** — `SetFilterEnabledIntent` and its guard.
3. **`src/plugins/sql/payload-changes.ts`** — `withFilterEnabled`, which replaces the flag on one
   column's filter and leaves every other filter alone.
4. **`src/plugins/sql/intents.ts`** — the `set-filter-enabled` handler, re-reading the grid from the
   first page like every other view change.
5. **`src/plugins/sql/request.ts`** — `gridQueryOf` sends only the filters that are on, each built
   without the flag. It also takes `apply` and `reread` from `intents.ts`, which the new intent pushes
   past the 200-line limit: both are about recording a payload and then sending what it implies, which
   is what `dispatch` beside them is already for.
6. **`web/src/plugins/sql/Filters.tsx`** — the per-column chips become buttons with `onDoubleClick`,
   `aria-pressed`, and the tooltip; the all-column chip stays a span, because the term has a field
   and a **Clear** of its own.
7. **`web/src/plugins/sql/sql.css`** — the button reset, the hover, and the greyed-out `.off` chip.
8. **`product/specs/sql-database.md`** — the filtering section says a filter is switched off and on
   by double-clicking its chip, what a switched-off one looks like, and that it still counts as a
   filter for the object switch.

## Tests

- `web/src/plugins/sql/DataGrid.test.tsx` — a double-click emits `set-filter-enabled` with the state
  the chip was not in; a switched-off chip is drawn with `aria-pressed={false}`, the **Enable**
  tooltip, and the greyed-out class, and its tooltip reads **Disable** when it is on.
- `src/plugins/sql/activate.test.ts` — the intent parks a filter and the query that goes out leaves
  it out; the payload keeps it, so a second call brings it back; a filter with no `enabled` at all
  still narrows, which is what a profile saved before this change carries.
- `src/plugins/sql/shared.test.ts` — the payload guard accepts a filter with and without the flag and
  refuses one whose `enabled` is not a boolean.
