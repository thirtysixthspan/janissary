# Editor query line should insert between two lines, not consume a real line's number

**Complexity: 3/10** — a display-only offset added to the existing per-row gutter-number
computation; no buffer mutation, no change to cursor/click/motion logic.

## Goal

The ephemeral agent query line only ever opens on a buffer line that is already empty
(`web/src/editor/handleSuggestKeyDown.ts`), and `EditorLines.tsx` renders the query row in place
of that anchor line rather than adding an extra row — so the total row count never changes and no
real buffer text is displaced. But every ordinary row still shows its literal `line + 1` gutter
number (`web/src/editor/render.tsx`), so a real line of text sitting right after the anchor line
keeps the number it would have had if the (now query-occupied) blank line were still an ordinary,
counted line. Per the backlog request, opening a query between two lines of real text should read
as an insertion that does not consume a number from the sequence — e.g. `1 some text` / `>> a
query` / `2 more text`, not `1 some text` / `>> a query` / `3 more text`.

## Approach

`EditorLines.tsx` already knows exactly where the query's anchor line is (`suggest.queryLine.anchorLine`)
when it renders each row. The fix only changes what gutter number a row displays, not which row
index it is or how it maps to buffer/cursor/click state: for any ordinary row whose index is
greater than the open query line's anchor line, display `index` instead of `index + 1` — i.e.
skip counting the anchor line itself, since the query row occupies its position but is not a
counted buffer line for numbering purposes. Rows at or before the anchor line, and every row when
no query line is open, are unaffected.

This requires threading an optional override number through to `EditorLine`'s gutter span
(`render.tsx`), since `EditorLine`'s existing `line` prop is also used for `data-editor-line` and
caret placement and must keep referring to the true buffer index.

## Implementation steps

1. In `web/src/editor/render.tsx`, add an optional `gutterNumber?: number` prop to `LineProps`.
   In `EditorLine`'s gutter span, render `{query ? '' : (gutterNumber ?? line + 1)}` instead of the
   current `{query ? '' : line + 1}`.
2. In `web/src/editor/EditorLines.tsx`, in `renderLine`, compute
   `const gutterNumber = queryLine && index > queryLine.anchorLine ? index : index + 1;` and pass
   it as the new `gutterNumber` prop on `EditorLine`.

## Tests

- `web/src/editor/render.test.tsx` — add a test asserting that when `gutterNumber` is passed
  (e.g. `3`) it overrides the default `line + 1` gutter text, and that omitting it still falls
  back to `line + 1` (protects the existing non-query gutter-number test).
- New test file `web/src/editor/EditorLines.test.tsx` — render `EditorLines` with a 3-line buffer
  (`['some text', '', 'more text']`), an open query line anchored at index `1`, and assert:
  - the gutter for the row at index `0` reads `1`.
  - the query row (index `1`) has an empty gutter (`.editor-row-query`).
  - the gutter for the row at index `2` reads `2` (not `3`).
  - and, as a control, with no query line open, the row at index `2` reads `3`.
- Run `./scripts/run.mjs check-diff` after the change; all suites must pass.

## Spec updates

- `product/specs/editor-tab.md` — the "In-editor persona suggestions" section already notes the
  query row "visually distinct from ordinary buffer rows... including showing no line number in
  its gutter" (around line 212). Add a clause noting that lines after the query row keep the
  gutter numbers they would have if the query row's line were not present, so the row reads as an
  insertion between two lines rather than a replacement of one.

## Docs

- Check `help.md` for any mention of the query line's gutter numbering — none currently. No update
  expected.
- Check `documentation/user-documentation/` for any page describing this numbering — none
  currently. No update expected.

## Out of scope

- Any change to which buffer line the query line requires as its anchor (still must be an
  already-empty line) — that trigger condition is unaffected and is a separate backlog item
  (up/down arrow navigation).
- The run button's fixed size (separate backlog issue).
- `gutterCh` (the gutter column's width) — unaffected; still computed from the buffer's real line
  count elsewhere.
