# Scroll the grid all the way back to its top

**Complexity: 2/10** — replace one `scrollIntoView` call with a scroll that knows the table header is sticky, and pin the arithmetic with tests.

## Goal

Moving the highlighted row up with the keyboard does not bring the frame back to the top of the table. The header row is `position: sticky`, so it sits over the top of the scroll frame, and `scrollIntoView({ block: 'nearest' })` stops as soon as the row's top edge meets the frame's top edge — which is behind the header. Walking up to the first row leaves that row hidden under the header and the frame scrolled by one header's height.

## Approach

Scroll the frame directly rather than asking the browser to. The visible band of the frame starts under the sticky `thead` (which also holds the filter row when one is open), so the scroll is computed against that band:

- a row above the band scrolls up by exactly the amount it is hidden;
- a row below the frame's bottom edge scrolls down by the amount it is hidden;
- a row already in the band leaves the frame where it is, which is what `block: 'nearest'` did.

The first row is the one case the user sees as "the top of the table", so reaching it sets the frame's scroll to zero outright rather than trusting the arithmetic to land on it to the pixel.

Only the vertical scroll moves. `scrollIntoView` also scrolled horizontally to the row's nearest edge, which for a row as wide as the table is nothing a user asked for.

The arithmetic is a pure function beside a small DOM adapter, so the rule is testable without layout, which jsdom does not have.

`scroll-padding-top` was considered and rejected: the header's height is not fixed — the filter row opens inside `thead` — so any constant would be wrong half the time.

## Implementation steps

1. **`web/src/plugins/sql/reveal-row.ts`** (new) — `revealScrollTop(view, row)` returns the scroll offset that brings a row fully into the band under the header, or `null` when it already is; `revealRow(frame, row, first)` reads the frame's and header's rects and applies it, setting zero for the first row.
2. **`web/src/plugins/sql/selection.tsx`** — the effect that follows the highlighted row calls `revealRow` instead of `scrollIntoView`.

## Tests

- `web/src/plugins/sql/reveal-row.test.ts` (new) — a row hidden under the header scrolls up by the hidden amount; a row below the frame scrolls down by the hidden amount; a row inside the band returns null; a row taller than the band shows its top; the first row sets the scroll to zero; `revealRow` measures the header from `thead` so an open filter row counts.
- `web/src/plugins/sql/Selection.test.tsx` — the existing "scrolls the page so the highlighted row is in view" case moves from the `scrollIntoView` stub to the frame's own scroll: walking back up to the first row returns the frame to zero.

## Spec

`product/specs/sql-database.md` — the Editing section says the page scrolls to follow the highlighted row; add that it follows below the column header, and that reaching the first row brings the frame back to the top of the table.

## Out of scope

- Horizontal scrolling of the frame, which the left and right arrows are already left to the application for.
