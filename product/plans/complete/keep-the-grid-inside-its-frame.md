# Keep the data table inside its own frame instead of over the command bar

**Complexity: 2/10** — one missing CSS rule, one stylesheet test, one structural test.

## Goal

A page of rows paints over the command bar instead of scrolling inside the tab. The grid's own scroll
container is correct — it is `flex: 1`, `min-height: 0` and `overflow: auto` — and none of that
reaches it, because of what is in between.

## Cause

In the centre layout `SqlTab` puts the grid inside `<div className="sql-grid-pane">`, beside the
navigator. That class has no rule at all: it is not `flex: 1`, and it is not `display: flex`. So it is
a content-sized block, and the `.sql-grid-area` inside it — which *is* `flex: 1; min-height: 0` —
has a parent that is not a flex container, so its height is the height of its content. The table then
grows to whatever a hundred rows need, the pane overflows, and nothing clips it, so the rows land on
top of the console.

`.sql-grid-scroll` is the only element between the table and the command bar, and it is the element
that should scroll. It is two levels down from the box that bounds the tab, and the link in that chain
is the one that is missing.

## Approach

Give the pane the same shape as the navigator beside it — a bounded, non-shrinking column for the
navigator; a bounded, growing one for the grid — and make it a flex container, so `.sql-grid-area`'s
existing `flex: 1; min-height: 0` finally means something and the height reaches
`.sql-grid-scroll`. `min-width: 0` on the pane is the horizontal half of the same repair: without it a
wide table sizes the pane rather than scrolling inside it.

Nothing else moves. The docked layout has no pane, and `.sql-grid-area` is already bounded there.

## Implementation steps

1. **`web/src/plugins/sql/sql.css`** — the rule for `.sql-grid-pane`.
2. **`web/src/plugins/sql/sql-style.test.ts`** — new: reads the stylesheet and pins the chain, which
   is the only place this defect can be seen from a test.
3. **`web/src/plugins/sql/SqlTab.test.tsx`** — the grid is inside the pane the rule names, so the two
   cannot drift apart.

## Tests

- `web/src/plugins/sql/sql-style.test.ts` — `.sql-grid-pane` grows, cannot be pushed narrower than its
  content, is a flex container, and bounds its height; `.sql-grid-area` bounds itself inside it; and
  `.sql-grid-scroll` is what scrolls, with the console beside it never the thing that gives way.
- `web/src/plugins/sql/SqlTab.test.tsx` — the grid is inside `.sql-grid-pane`, beside the navigator.

## Spec

None. `product/specs/sql-database.md` says the grid scrolls within the tab and nothing about how.
