# Remove the SQL goto feature

**Complexity: 1/10** — a control and one pure helper, both client-side, with no server change and no
contract change.

## Goal

The pager's **Row** field jumps to a row the user names. It is being taken back out: the grid is
navigated by the keyboard and by the console's own `LIMIT`/`OFFSET` query, and the field is a third
way of doing the same thing that has to be kept in step with the page label and the page-size
selector.

The pager is left as **Previous**, the range label, **Next**, the page-size selector, and **Refresh** —
the same row it had before the field arrived.

## Approach

The whole feature is client-side, so removing it means removing what it was made of:

- `goToRow` in `grid-view.ts` — the row-number-to-offset arithmetic, which nothing else uses.
- The field, its **Go** control, and the `set-page` emission in `Pager.tsx`, together with the local
  state they needed.
- The `.sql-goto` rules in `sql.css`.

The `set-page` intent itself stays: **Previous** and **Next** are what emit it, and the server
handler, its guard, and its tests are unchanged.

## Implementation steps

1. **`web/src/plugins/sql/Pager.tsx`** — drop the `useState` row field, `go()`, the `.sql-goto` span
   with its input and **Go** button, and the `goToRow` import.
2. **`web/src/plugins/sql/grid-view.ts`** — drop `goToRow` and the comment that explains it.
3. **`web/src/plugins/sql/sql.css`** — drop the `.sql-goto` and `.sql-goto input` rules.
4. **`product/specs/sql-database.md`** — drop the paragraph describing the **Row** field.

## Tests

- `web/src/plugins/sql/grid-view.test.ts` — the whole `goToRow` describe block goes with the helper.
- `web/src/plugins/sql/Pager.test.tsx` — the four goto cases go; the range-label and Previous/Next
  cases stay, and Previous/Next is the check that the pager still navigates.
- `web/src/plugins/sql/sql-style.test.ts` — `.sql-goto` joins the list of controls the stylesheet
  must carry no rule for, so the rule cannot come back unnoticed.

## Out of scope

- The `set-page` intent, its guard, and the server handler. **Previous** and **Next** are the same
  intent and it is not a goto feature.
- The range label, which is the one thing the field was read against.
- Reaching a row far into a large table. That is what the console's own query is for.
