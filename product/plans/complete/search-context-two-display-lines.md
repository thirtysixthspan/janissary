# Bound the Search Context to Two Display Lines

**Complexity: 3/10** — the server already sends the right two buffer lines; the fix is a wrapping
element per side in the row markup and a clipping rule in the plugin's stylesheet, plus a new
stylesheet test. No server change, no payload change, no new module.

## Goal

The context shown around a search match should occupy two *display* lines, not two *buffer* lines.

`search-files.ts` slices two source lines either side of the match and the row renders each of them
as a `.search-line` with `white-space: pre-wrap`, so a source line long enough to wrap turns two
buffer lines into four, six, or eight display lines. The context then outweighs the match it exists
to frame, and the reader loses the one line they opened the row for. "Two lines of context" means
two lines on screen.

The fix belongs on the client. How many display lines a buffer line occupies is a function of the
panel's width and the font, neither of which the server can see — and the two are exactly what the
browser already resolves while it wraps the text. So the client bounds the rendered block rather
than trying to predict its height.

## Approach

Wrap each side's context in its own block element and give that block a `max-height` of two line
boxes with `overflow: hidden`. The browser does the measuring, so the cap is exact at any width,
any font size, and any pane size, and it costs no layout work per keystroke.

Which two display lines survive is the other half of the requirement, because a bare cap would clip
the wrong end: the lines nearest the match are the ones that carry its meaning, so the block above
the match must be clipped at the top and the block below it at the bottom.

- The **above** block is a column flex packed to the end, so it overflows — and is therefore
  clipped — at the start, keeping its last display lines, which are the ones adjacent to the match.
- The **below** block packs to the start, which is the default, so it is clipped at the end and
  keeps the lines adjacent to the match.

This keeps the document order of the context lines, so the row still reads top-to-bottom the way
the file does, and no existing assertion about that order changes.

## Implementation steps

1. **One block per side.** In `web/src/plugins/search/ResultTable.tsx`, `SearchRow` renders the
   `above` lines inside a `.search-context-block .search-context-above` element and the `below`
   lines inside a `.search-context-block .search-context-below` element, in the order the server
   sent them. Nothing else about the row changes: the same `ContextLine` elements, the same keys,
   the same line numbers, and the match line still sits between the two blocks.

2. **The cap.** In `web/src/plugins/search/search.css`, add the two block rules. The height is
   `3em` against the row's own `font-size: 12px` and `line-height: 1.5`, which is exactly two
   18px line boxes; expressing it in `em` keeps it correct if the row's font size changes, since
   both the cap and the line box it is counting scale together.

3. **The server does not change.** `CONTEXT` in `search-files.ts` stays at 2. It is the *upper
   bound* on what the client may draw, and two buffer lines are always enough to fill two display
   lines: a narrower pane means a buffer line wraps sooner, not later. Widening the server's
   window would only send rows the client is about to clip.

## Tests

- `web/src/plugins/search/search-style.test.ts` (new): pins the two-display-line cap, that the
  block is a column flex clipped with `overflow: hidden`, that the above block packs to the end and
  the below block to the start, and that both counts of line boxes are derived from the row's own
  `font-size`/`line-height` rather than hard-coded pixels. This is the file that would catch a
  regression, since the behavior is a stylesheet rule jsdom does not lay out.
- `web/src/plugins/search/SearchTab.test.tsx`: add a case asserting each side of the match is
  wrapped in its own block, and that the two blocks appear in the order above, match, below with
  the context still in document order inside them. The existing "shows the context lines either
  side of the match" and "labels each context line with the line number it sits on" cases are
  unchanged and are what pin the document order.

## Out of scope

- The number of context lines the server sends, and every `search-files.ts` test.
- The match line itself, which is never clipped however long it is — a wrapped match is the code the
  user came to read.
- The row header, the path, and the line number.
- Clipping mid-line. A display line that only half fits is cut, which is the point: the budget is
  display lines, and a partial line still shows what the text starts with.
