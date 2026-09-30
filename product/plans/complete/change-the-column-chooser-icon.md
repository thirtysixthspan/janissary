# Change the column chooser's icon so it is not the split glyph

**Complexity: 1/10** — one imported glyph and one test assertion.

## Goal

The grid's action bar ends with **Choose columns** and the host's **Split**. Split is drawn as
`faTableColumns` — three vertical bars, the shape of a table — and the chooser is drawn as `faColumns`,
which is the same three vertical bars a size or two apart. Two controls that look alike, side by
side, opening two unrelated things.

The chooser's job is not the shape of the table. It is deciding what the grid shows of it: a column
put out of the way is still selected and still filtered, so hiding one is about visibility and
nothing else.

## Approach

Draw it as visibility. `faEye` says what the control is about, and it is not a near neighbour of a
three-bar split glyph the way two column glyphs are. The label and the tooltip are unchanged — the
glyph is the only thing that was wrong, and `Columns (2 hidden)` already says the rest.

The central icon registry in `web/src/shared/icons.ts` is not where this glyph goes: a client tab
plugin may reach only its own `api` and `shared.css`, so it imports Font Awesome directly, as it
already does for the trash, the plus, the filter and the rest.

## Implementation steps

1. **`web/src/plugins/sql/ColumnChooser.tsx`** — `faColumns` becomes `faEye`, and the comment above the
   component says why the glyph is about visibility rather than about columns.

## Tests

- `web/src/plugins/sql/Pager.test.tsx` — a new case reads the rendered glyph's `data-icon` and
  asserts it is not the split glyph's, which is what stops the two drifting back together.

## Spec

None. `product/specs/sql-database.md` names the **Columns** control and what it does, and says
nothing about what it looks like.
