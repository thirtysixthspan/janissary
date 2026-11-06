# Mark PDF find matches on the pages

**Complexity: 4/10** — DOM range mapping across the spans PDF.js splits a line into, plus a repaint lifecycle tied to redraws, the query, and the highlighted row. The pure matching and painting modules are small; the care is in range boundaries and cleanup.

## Goal

While the PDF find overlay is open with a non-empty query, every occurrence on every drawn page is marked, with the occurrence behind the highlighted row stronger. Pages drawn later get marks, and closing the overlay clears every mark without touching the text layer or the selection.

## Design decisions and dependencies

This subplan depends on `pdf-find-02-pdf-text-lines` for the line indexes and `pdf-find-03-find-hook-and-overlay` for the overlay state, the selected result, the stage ref, and the page render path. `pdf-find-05-specs-docs-and-verification` documents the result. `pdf-find-01-shared-overlay` is not used directly.

- `web/src/plugins/pdf/pdf-find-marks.ts` is a new module with no React import. It exports `occurrencesInLayer(layer, query)`, `paintMarks(ranges, current)`, and the two highlight names.
- `occurrencesInLayer` walks the text nodes of one `.pdf-text-layer` in document order. A `<br>` ends the current line. Text nodes are concatenated into the line's text, with each node's start offset remembered. The line index starts at 0, so it matches the `PdfLine.index` contract from `pdf-find-lines.ts`.
- Matching is case-insensitive and uses the same lowercased `indexOf` model as `contiguousMatch`, so a row and its marks agree on where the occurrence starts. There is no regex. The trimmed query is used; an empty query returns no occurrences.
- A match must sit within one line. A query that crosses a `<br>` is not found. A match may cross two or more spans on the same line, because the range's start and end can be in different text nodes.
- Each returned occurrence is `{ range, line, start }`. `line` is the 0-based line index on the page, and `start` is the range's start offset within the line text. The page index is the caller's job, because the layer does not carry it.
- Offset mapping treats a text node's span as half-open. A boundary offset belongs to the following node when one exists, and to the final node's end otherwise. Zero-length text nodes are skipped. This is what lets a range that starts in one span and ends in the next be built correctly.
- `paintMarks` adds every range in `ranges` to the shared `pdf-find-match` highlight and adds `current` to `pdf-find-current` instead. The current range is not also added to the match set. It returns a cleanup function that deletes exactly the ranges it added, from whichever highlight received them.
- Each tab creates and removes only its own ranges. Two PDF tabs in a split share the highlight names but not their range sets, so closing one leaves the other's marks alone. The cleanup must not delete the highlight object itself.
- Where `CSS.highlights` or `Highlight` is missing, `paintMarks` returns a no-op. This is the same guard `paint` in `web/src/plugins/shell/reply-selection.ts` uses, and the module copies those few lines rather than importing another plugin.
- `web/src/plugins/pdf/usePdfFindMarks.ts` is a new hook. It takes `open`, `query`, `current`, `stageRef`, and `textLayerVersion`. While the overlay is open with a non-empty trimmed query, it walks every `.pdf-text-layer` under the stage, reads the page index from the closest `.pdf-page` element's `data-page`, finds occurrences, and paints them. A page whose layer has no `.pdf-page` ancestor is skipped.
- The occurrence whose page, line index, and start equal `current` is painted into `pdf-find-current`. All others go into `pdf-find-match`. If the current result's page is not drawn, no current range is painted and every visible occurrence is a normal mark.
- The hook repaints when the query, the highlighted row, or the text-layer counter changes. It clears everything when the overlay closes or the tab unmounts, through the effect's cleanup. Each repaint walks every drawn layer. That is acceptable because a page keeps its drawn layer once drawn; repainting only the layer that changed is the documented upgrade if typing ever lags, not part of this subplan.
- `onTextLayer(index)` is an optional callback through `web/src/plugins/pdf/usePdfPageRender.ts`, `PdfPage.tsx`, and `PdfStage.tsx`. It is called after `renderPage` resolves for a page that has a text layer and is still live. A zoom, resize, or layout change replaces the layer's children and therefore every old range, so `PdfTab` bumps a counter on each call and the marks hook repaints against the new nodes.
- `PdfTab` creates the `onTextLayer` callback with `useCallback` and an empty dependency list. An inline callback would change identity on every `PdfTab` render, and `usePdfPageRender`'s render effect depends on its callback, so an inline one would redraw pages every time the user typed.
- The text-layer callback is not passed to `PdfThumbnails`. Thumbnails render with `text={false}` and have no layer to mark.
- `web/src/plugins/pdf/pdf.css` gets the two rules, written as `.pdf-text-layer ::highlight(pdf-find-match)` and `.pdf-text-layer ::highlight(pdf-find-current)`. Both use the theme accent mixed toward transparent with `color-mix`, at a low strength for all matches and a higher strength for the current one. Both stay translucent so the page's own text shows through, and they are distinct from the text layer's blue selection. Every selector stays rooted in a `pdf-` class.
- `web/src/plugins/pdf/pdf-styles.test.ts`'s "matches nothing the host draws" check strips a trailing pseudo-element with `/::[\w-]+$/`. That does not strip `::highlight(pdf-find-match)` and `Element.matches` would throw on it. Widen the expression to strip a parenthesized argument too, so `::selection` and `::highlight(...)` are both removed. The containment checks must keep passing with the new rules.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Highlight painting pattern | `web/src/plugins/shell/reply-selection.ts` (`paint`, `CSS.highlights.get(...) ?? new Highlight()`), `shell.css`'s `::highlight(shell-reply-selection)` | Copied in shape into the PDF plugin. A plugin may not import another plugin. |
| Highlight test stub | `web/src/plugins/shell/reply-selection.test.ts` (a `Map<string, Set<Range>>` stubbed as `CSS.highlights`, and a `Highlight` class extending `Set<Range>`) | `pdf-find-marks.test.ts` and the marks hook test stub the API the same way. |
| Page render path | `web/src/plugins/pdf/usePdfPageRender.ts`, `PdfPage.tsx`, `PdfStage.tsx` | Extended with the optional `onTextLayer` callback. |
| Text layer | `web/src/plugins/pdf/pdf-document.ts` (`drawPage` replaces the layer's children with `TextLayer`), `pdf-text-layer.css` | Read only. The marks never rewrite the layer or its spans. |
| Selection color | `web/src/plugins/pdf/pdf-text-layer.css` `::selection` | Left alone. The mark colors are separate and translucent. |
| Line model | `PdfLine` from `pdf-find-lines.ts`, `current` from `usePdfFind` | Supplies page, line index, and start for the current mark. |
| Overlay state | `find.findOpen`, `find.query`, `find.current` from `pdf-find-03-find-hook-and-overlay` | The marks hook's inputs. |

## Proposed changes

- Create `web/src/plugins/pdf/pdf-find-marks.ts` with `PDF_FIND_MATCH`, `PDF_FIND_CURRENT`, `occurrencesInLayer`, and `paintMarks` as described above.
- Create `web/src/plugins/pdf/usePdfFindMarks.ts` with the repaint and cleanup effect.
- In `web/src/plugins/pdf/usePdfPageRender.ts`, add `onTextLayer?(index: number): void` to the params and `PdfPageProperties`, and call it after `renderPage` resolves when the page has a text layer, the render is still live, and the callback exists.
- In `web/src/plugins/pdf/PdfPage.tsx`, accept and forward `onTextLayer`.
- In `web/src/plugins/pdf/PdfStage.tsx`, accept `onTextLayer?` and pass it to each stage `PdfPage`.
- In `web/src/plugins/pdf/PdfTab.tsx`, add the `textLayerVersion` state and the stable `onTextLayer` callback, pass the callback to `PdfStage`, and call `usePdfFindMarks` with the find state and the stage ref.
- In `web/src/plugins/pdf/pdf.css`, add the two `::highlight` rules.
- In `web/src/plugins/pdf/pdf-styles.test.ts`, widen the pseudo-element stripping expression and keep the existing containment expectations.

## Tests

In `web/src/plugins/pdf/pdf-find-marks.test.ts`, with a layer built by hand from spans and `<br>`s:

- Occurrences are found case-insensitively.
- An occurrence that crosses two spans of one line yields one range covering the matched text.
- Nothing is found across a `<br>`.
- Each range is tagged with its line index, including the line after a `<br>`.
- Empty and whitespace-only queries return nothing.
- A query with more than one occurrence returns each occurrence.
- `paintMarks` adds the non-current ranges to `pdf-find-match` and the current range to `pdf-find-current`, and its cleanup removes exactly those ranges.
- Two painters on the same highlights leave each other's ranges alone when one cleans up.
- `paintMarks` does nothing when `CSS.highlights` or `Highlight` is missing.

In `web/src/plugins/pdf/usePdfFindMarks.test.tsx`, with a stage element containing two `.pdf-page` elements and their layers:

- An open overlay with a query paints occurrences from both layers.
- The current occurrence goes to the current highlight and not the match highlight.
- Changing the query replaces the old ranges.
- Bumping the text-layer counter repaints the new layer contents.
- Closing the overlay clears every range.
- Unmounting clears every range.
- A layer with no `.pdf-page` ancestor is skipped.

In `web/src/plugins/pdf/PdfTab.test.tsx`:

- With a mocked `renderPage` that fills the text layer, opening find and typing marks the occurrences on the shown page, and the current row's occurrence is in the current highlight.
- Closing the overlay clears the highlights.
- A redraw caused by a zoom change repaints the new layer, and the old ranges are gone.

In `web/src/plugins/pdf/pdf-styles.test.ts`:

- The existing root-selector and host-containment checks pass with the two `::highlight(...)` rules.
- The widened stripping expression is exercised by the new selectors, so the check does not throw and does not match a host element.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then run the focused tests:

`npm run test:client -- web/src/plugins/pdf/pdf-find-marks.test.ts web/src/plugins/pdf/usePdfFindMarks.test.tsx web/src/plugins/pdf/pdf-styles.test.ts web/src/plugins/pdf/PdfTab.test.tsx`

`npm run typecheck:diff`

Manual check with a multi-page PDF: open find and type a word on several pages. Every occurrence on the shown page is marked, and the highlighted row's occurrence is stronger. Scroll to another page in continuous layout and confirm its marks appear when the page draws. Zoom in and confirm the redrawn page's marks are in the right places and the old ranges are gone. Switch layouts and confirm the same. Press Escape and confirm every mark clears while the text is still selectable.

## Out of scope

- Marking pages that contain matches in the page strip.
- A match counter or next and previous match buttons.
- Changing the text layer's DOM, the selection color, or PDF.js's text geometry.
- Rewriting only the layer that changed during a repaint. The per-layer optimization is a documented upgrade.
- Using the browser's Selection API or making a text selection when highlighting a row.
- Any code outside the PDF plugin except the shared overlay work already done in `pdf-find-01-shared-overlay`.
- The PDF spec, help, and user docs. Those are `pdf-find-05-specs-docs-and-verification`.
