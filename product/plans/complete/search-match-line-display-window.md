# Window a Long Match Line to Two Display Lines Either Side

**Complexity: 5/10** — a match position added to each row on the server, and on the client a measured window over the match line that also shrinks the neighbouring context. It touches the matcher, the row builder, the wire shape, one new pure module, one new hook, and the row component, all inside the search plugin.

## Goal

A result shows two *display* lines of context either side of the match, not two buffer lines. The earlier fix (`search-context-two-display-lines.md`) capped the context *blocks* at two display lines, but it left the match line itself uncapped. So a match found inside a really long line, a minified bundle or a lockfile or a long generated string, still draws the entire line: dozens of wrapped display lines with the matched text somewhere in the middle.

The rule should apply to the display lines around the match itself. The entry shows the display line the match is on, plus up to two display lines before it and two after it. When the match line is long enough to supply those lines itself, they come from that same buffer line, and the neighbouring buffer lines are not shown on that side. When it is not, the neighbouring buffer lines make up the difference, exactly as they do today.

## Approach

Treat the entry as one run of display lines: the context above, then the match line, then the context below. Take the display line holding the match and two either side of it.

1. **The server says where the match is.** How far a line wraps depends on the pane's width and font, which only the browser knows, but *where in the line* the match sits is a fact about the text. Each `SearchMatch` gains `start` and `end`, the UTF-16 offsets of the first match in `match`. `Matcher` gains a `locate(line)` that returns them. It uses the same compiled pattern `test` uses, so the two can never disagree, and the whole-word lookarounds keep the offsets on the matched word itself.

2. **The client marks the match.** The match line is rendered as the text before the match, the match in its own `span`, and the text after, all inside one block. Nothing about its look changes.

3. **The client measures the match line's display lines.** A hook, `useMatchWindow`, reads the match line's line height from its computed style. It measures the block's height and the top of the match span's first line box relative to the block, which gives the number of display lines the match line wraps to and the index of the one holding the match. It re-measures when the row changes and when the block resizes, through a `ResizeObserver`, so narrowing the pane re-windows every row.

4. **A pure function turns that into a window.** `matchWindow(matchLine, total)` returns the first display line of the match line to show, how many to show, and how many display lines of context each neighbouring block may still draw:
   - `first = max(0, matchLine − 2)` and `last = min(total − 1, matchLine + 2)`
   - `above = 2 − (matchLine − first)` and `below = 2 − (last − matchLine)`

   A match line that fits on one display line gives `first 0, count 1, above 2, below 2`, exactly today's layout.

5. **The row applies it.** The match line's text is clipped to `count` display lines, and the block inside it is shifted up by `first` display lines, so the window lands on the match. Each context block's cap becomes its budget in display lines, which is zero when the match line supplies both lines on that side. Until a measurement exists, the row renders exactly as it does today. That covers jsdom, which lays nothing out, and the first paint before the layout effect runs.

The line number stays beside the first visible display line, because it names the buffer line the whole entry is about.

## Implementation steps

1. **Matcher.** In `src/plugins/search/compile-matcher.ts`, extend `Matcher` with `locate(line: string): { start: number; end: number } | null`, built from the same `RegExp` as `test` via `exec`.
2. **Rows.** In `src/plugins/search/search-files.ts`, `matchFile` uses `locate` and records `start` and `end` on each row. `fileMatches` keeps using `test`.
3. **Wire shape.** In `src/plugins/search/shared.ts`, add `start: number; end: number` to `SearchMatch`, with a comment, and check both in `isMatch`. The plugin is unreleased on this branch, so the payload schema version stays at 1.
4. **Pure window.** New `web/src/plugins/search/match-window.ts`: `CONTEXT_DISPLAY_LINES`, `matchWindow`, `displayLineCount(height, lineHeight)`, `displayLineOf(offset, lineHeight)`, and `splitAtMatch(text, start, end)`, which clamps out-of-range offsets so a bad row still renders its whole text.
5. **Hook.** New `web/src/plugins/search/useMatchWindow.ts`: takes the block and match refs plus the row's text and offsets, measures in a layout effect, observes the block with a `ResizeObserver` and disconnects it on cleanup, and returns `{ window, lineHeight }` or `null` while there is no usable measurement.
6. **Row component.** Move `SearchRow` and `ContextLine` out of `web/src/plugins/search/ResultTable.tsx` into a new `web/src/plugins/search/SearchRow.tsx`, since the row now carries its own hook and markup. `ResultTable` imports it. Apply the window as inline `max-height` and `margin-top` in pixels, from the measured line height.
7. **Stylesheet.** In `web/src/plugins/search/search.css`, make the match block `display: block` so it can be shifted, and give the match line's text `overflow: hidden` so the inline cap clips it. Update the comment on the two-display-line rules to say the stylesheet's `3em` is the default, which the measured window narrows.

## Tests

- `src/plugins/search/compile-matcher.test.ts`: `locate` returns the offsets of the first occurrence for plain text, for a case-insensitive match, for a regex, and for whole word, where the offsets cover the word and not the lookaround. It returns null where `test` is false.
- `src/plugins/search/search-files.test.ts`: rows carry `start` and `end` of the first occurrence on the line.
- `src/plugins/search/shared.test.ts`: fixtures carry `start` and `end`, and a row missing or mistyping either is rejected.
- `src/plugins/search/scan.test.ts`: the full-row equality case includes the offsets.
- `web/src/plugins/search/match-window.test.ts` (new): a one-line match line keeps today's layout. A match on display line 0 of a long line shows lines 0 to 2 and gives the above block two lines and the below block none. A match deep inside a long line shows the five lines around it and gives both blocks none. A match on the last display line gives the above block none and the below block two. A match on display line 1 of a three-line match line gives each block one. The line count and line index helpers round and floor as described. `splitAtMatch` splits at the offsets and clamps bad ones.
- `web/src/plugins/search/SearchRow.test.tsx` (new, beside the extracted component): the match line renders its match in its own element between the text before and after it. With the layout stubbed on the row's own elements (computed line height, the block's box, the match's first line box) and a resize reported, a match deep in a long line clips the match line to five display lines, shifts it to the match, and caps both context blocks at zero. A match on a long line's first display line keeps its context above. A one-line match line keeps its full context. A second resize re-windows the row. With no usable measurement the row carries no inline caps at all, and unmounting disconnects the observer.

Rendering three rows in a real browser against the shipped stylesheets confirmed the layout jsdom cannot show. A short line kept its two context lines either side. A match halfway along a line that wrapped to 35 display lines showed exactly five, with the match on the middle one and no neighbouring lines. A match at the start of a long line showed its two lines above and three display lines of the match line.
- `web/src/plugins/search/search-style.test.ts`: the match block is `display: block`, and the match line's text is `overflow: hidden`. The stylesheet still sets no `max-height` on the match line, because its cap is the measured one.

## Spec

`product/specs/search-tab.md`, "The results": rewrite the two-display-lines paragraph. The entry shows the display line holding the match and two display lines either side. On a match line long enough to supply them, they come from that same line and the neighbouring lines are not shown on that side. Otherwise neighbouring lines fill the rest, cut off at the far end.

## Out of scope

- Highlighting the matched text. It gets its own element so it can be measured, but it keeps the line's colour.
- Showing more than the first occurrence's window when a line matches more than once. The entry is still one row per matching line.
- The number of buffer lines of context the server sends, which stays at two.
- The remaining entries in the pull request's backlog.
