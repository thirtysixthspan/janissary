# Draw no focus ring around the sql table

**Complexity: 1/10** — one declaration on the scroll frame's rule, and a stylesheet test that pins it.

## Goal

The table's scroll frame takes the focus — `Tab` crosses to it from the command bar, and a press on a row lands in it — and the browser draws its focus ring around the whole frame when it does. The table is highlighted as a block, which reads as a selection of the whole table rather than the rows the keys act on. When the table has the focus, it should not be highlighted.

## Approach

Hide the browser's focus ring on the scroll frame with `outline: none`, the way the conversations list and the file-navigator tree already do. The focus is still shown where it matters: the highlighted row carries the accent bar down its leading edge, and the keys move that row, so the frame's own ring adds nothing but a box around everything.

## Implementation steps

1. **`web/src/plugins/sql/sql.css`** — `.sql-grid-scroll` gains `outline: none`, with a comment saying why the focus ring is hidden and where the focus shows instead.

## Tests

- `web/src/plugins/sql/sql-style.test.ts` — the scroll frame's rule hides the outline, and no `.sql-grid-scroll:focus` rule paints anything back.

## Spec

`product/specs/sql-database.md` — Editing: the rows have the focus without the table being outlined; the highlighted row is what shows where the keys will act.

## Out of scope

- The command bar's own focus styling.
- The highlighted row's styling.
