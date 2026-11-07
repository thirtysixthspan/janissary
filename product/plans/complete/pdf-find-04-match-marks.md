# Mark PDF find matches on the pages

**Complexity: 4/10** — DOM range mapping across the spans PDF.js splits a line into, an aggregate repaint and cleanup lifecycle tied to redraws, the query, and the highlighted row, and a callback threaded through the page renderer. The pure matching and painting modules are small; the care is in range boundaries, cleanup, and not causing redraws.

## Goal

While the PDF find overlay is open with a non-empty query, every occurrence on every drawn page is marked, with the occurrence behind the highlighted row stronger. Pages drawn later get marks, a query that becomes empty clears the previous marks, and closing the overlay clears every mark without touching the text layer or the selection.

## Design decisions and dependencies

`pdf-find-02-pdf-text-lines` and `pdf-find-03-find-hook-and-overlay` are already merged on this branch: `pdf-document.ts` exposes `readPageText`, `pdf-find-lines.ts` exports `PdfTextItem`, `PdfLine`, and `pageLines`, and `usePdfFind` exposes `findOpen`, `query`, `current`, `lines`, `reading`, `open`, `select`, and `close`. `PdfTab` already owns `stageRef` and renders `LineFind` as a direct child of `.pdf-tab`. This subplan adds the `onTextLayer` plumbing to the existing `usePdfPageRender.ts`, `PdfPage.tsx`, and `PdfStage.tsx`; it does not change the overlay, the reveal, or the line reading. `pdf-find-01-shared-overlay` is not used directly. `pdf-find-05-specs-docs-and-verification` documents the result.

- `web/src/plugins/pdf/pdf-find-marks.ts` is a new DOM-only module with no React or PDF.js import. It exports the highlight-name constants `PDF_FIND_MATCH` and `PDF_FIND_CURRENT`, whose values are `pdf-find-match` and `pdf-find-current`; a `PdfFindOccurrence` type carrying the range, its 0-based line index, and its line-relative start; `occurrencesInLayer(layer, query)`; and `paintMarks(ranges, current)`.
- `occurrencesInLayer` walks the layer's whole subtree, not just its direct children, visiting text nodes and `<br>` elements in document order. PDF.js can nest a line's spans and its `<br>` inside `.markedContent` wrappers (`pdfjs-dist/build/pdf.mjs`, `TextLayer.#processItems` creates them and `#appendText` appends text and the `<br>` to the current wrapper), so a direct-child walk misses text. A `<br>` ends the current line. Text nodes are concatenated into the line's text, with each node's start offset remembered, and the line index starts at 0.
- The line index is the same number as `PdfLine.index`. `TextLayer.#appendText` appends one `<br>` for every item with `hasEOL`, including an item whose string is empty, and `pageLines` at `pdf-find-lines.ts:14` ends a line at every `hasEOL` item and keeps empty lines. `readPageText` (`pdf-document.ts:118`) and `drawPage` (`pdf-document.ts:63`) read the same PDF.js text items, so concatenating a line's text nodes reproduces `PdfLine.text` item for item; that is what makes the `start` offsets line up. Consecutive `<br>`s therefore produce empty lines and still advance the index, matching `pdf-find-lines.test.ts`'s empty-line cases.
- Matching is case-insensitive and uses the same lowercased `indexOf` walk as `contiguousMatch` (`web/src/shared/fuzzy-match.ts:120`), including the matcher's advance of one character rather than one query length (`fuzzy-match.ts:135`) so overlapping occurrences are all returned. The trimmed query is used; an empty or whitespace-only query returns no occurrences. There is no regex.
- A match must sit within one line. A query that crosses a `<br>` is not found. A match may cross two or more spans on the same line because the range's start and end can be in different text nodes.
- Each returned occurrence is `{ range, line, start }`. `line` is the 0-based line index on the page, and `start` is the range's start offset within that line's text, not within the layer. The page index is the caller's job because the layer does not carry it.
- Offset mapping treats a text node's span as half-open and stays within the line's own nodes. A start boundary belongs to the next text node of that line when one exists. An end boundary uses the node whose span contains the final matched character, so a match ending at the line's last character ends at the last node's end and never advances to the first node of the next line. Zero-length text nodes are skipped. This is what lets a range that starts in one span and ends in the next be built correctly.
- `paintMarks(ranges, current)` takes the layer's occurrence ranges and the current occurrence's range, which is one of `ranges` or null. It adds every non-current range to `pdf-find-match` and `current` to `pdf-find-current`. It filters the current range out of the match set by object identity, not by comparing boundaries, so two different ranges covering the same text remain distinct. It returns a cleanup function that deletes exactly the ranges it added, from the highlight objects it captured at paint time.
- Each tab creates and removes only its own ranges. Two PDF tabs in a split share the highlight names but not their range sets, so closing one leaves the other's marks alone. The cleanup must not call `CSS.highlights.delete` or remove the highlight object itself: another tab may still have ranges on it.
- Where `CSS.highlights` or `Highlight` is missing, `paintMarks` adds nothing and returns a no-op cleanup. This is the same guard `paint` uses at `web/src/plugins/shell/reply-selection.ts:73`, and the module copies those few lines rather than importing another plugin. A plugin may not import another plugin (`ai/guidelines/plugins.md`).
- `web/src/plugins/pdf/usePdfFindMarks.ts` is a new hook. It takes five inputs: `open`, `query`, `current`, `stageRef`, and `textLayerVersion`. `open` is the boolean `find.findOpen` (`usePdfFind.ts:102`), not the `open()` action. While `open` is true and the trimmed query is non-empty, it walks every `.pdf-text-layer` under `stageRef.current`, reads the page index from the closest `.pdf-page` element's `data-page` (`PdfPage.tsx:17`), finds occurrences, and paints them. `data-page` is already 0-based, the same as `current.page`; do not add 1. A layer with no `.pdf-page` ancestor, or with a missing, empty, or non-integer `data-page`, is skipped. A missing stage paints nothing; a closed overlay or an empty query also clears the previous marks.
- For each layer, the hook finds the occurrence whose page, line index, and start all equal `current`, and passes that occurrence's range as `paintMarks`'s current argument; every other layer passes null. All non-current occurrences go into `pdf-find-match`. If `current` is null, or its page is not drawn, every visible occurrence is a normal mark.
- The hook collects the cleanup returned by every layer's `paintMarks` call into one function and returns it, so a repaint, a close, or an unmount clears all layers, not only the last one. It repaints when `open`, `query`, `current`, or `textLayerVersion` changes. Each repaint walks every drawn layer. That is acceptable because a page keeps its drawn layer once drawn; repainting only the layer that changed is the documented upgrade if typing ever lags, not part of this subplan.
- `onTextLayer(index)` is an optional callback threaded through `web/src/plugins/pdf/usePdfPageRender.ts`, `PdfPage.tsx`, and `PdfStage.tsx`. It is called only on the resolved path after `renderPage`, for a page with `text` true and only while the render is still live. A rejected or superseded render still goes to `onFailure` or is ignored exactly as today, and a throw from the callback must not be reported as a render failure. A zoom, resize, or layout change that changes the fit scale redraws the layer and replaces its children, so every old range is detached; `PdfTab` bumps `textLayerVersion` on each call and the marks hook repaints against the new nodes.
- `onTextLayer` belongs in `usePdfPageRender`'s render-effect dependency list: the effect calls it, and `react-hooks/exhaustive-deps` is an error in this repo. `PdfTab` keeps it stable with `useCallback` and an empty dependency list, using React's functional state-update form and never reading the counter inside the callback. An inline callback would change identity on every `PdfTab` render, and one that closes over the counter would change identity whenever the counter bumps and trigger another redraw. Either way the page effect would redraw pages on every keystroke or loop.
- The text-layer callback is not passed to `PdfThumbnails`. Thumbnails render with `text={false}` and have no layer to mark; `usePdfPageRender` also guards the call on `text`.
- `web/src/plugins/pdf/pdf.css` gets the two rules, written as `.pdf-text-layer ::highlight(pdf-find-match)` and `.pdf-text-layer ::highlight(pdf-find-current)`, placed together with a short comment. Only `background-color` is set: the text layer's glyphs are transparent stand-ins for the canvas text, so a `color` declaration would paint a second copy of the page's text. Mix `var(--accent)` into transparent with `color-mix` at 20% for every match and 45% for the current one, following the shape `theme.css` already uses for its tinted rows. Both stay translucent so the page's own text shows through, and they are recognizably different from the blue `::selection` at `pdf-text-layer.css:84`. Every selector stays rooted in a `pdf-` class, and `pdf.css` is loaded after `pdf-text-layer.css` by `index.tsx:1-3`.
- `web/src/plugins/pdf/pdf-styles.test.ts`'s "matches nothing the host draws" check strips a trailing pseudo-element with `/::[\w-]+$/` at `pdf-styles.test.ts:63`. That does not strip `::highlight(pdf-find-match)`, and in this repo's jsdom `Element.matches` throws `SyntaxError: Unknown pseudo-element ::highlight` on it. Widen the expression to allow an optional parenthesized argument after the pseudo-element name, so `::selection` and `::highlight(...)` are both removed and the stripped selector is a valid element selector. jsdom does parse `::highlight(...)` as a CSS rule, so the two new selectors must also be asserted present; otherwise the containment check could pass vacuously if a parser change stopped keeping them.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Highlight painting pattern | `web/src/plugins/shell/reply-selection.ts:73` (`paint`, `CSS.highlights.get(...) ?? new Highlight()`), `shell.css:53` (`::highlight(shell-reply-selection)`) | Copied in shape into the PDF plugin. A plugin may not import another plugin. |
| Highlight test stub | `web/src/plugins/shell/reply-selection.test.ts:102-104` (a `Map<string, Set<Range>>` stubbed as `CSS.highlights`, and a `Highlight` class extending `Set<Range>`) | `pdf-find-marks.test.ts` and the marks hook test stub the API the same way. `PdfTab.test.tsx` must keep `CSS.escape` on its stub; see Tests. |
| Page render path | `web/src/plugins/pdf/usePdfPageRender.ts:38-46` (the render effect), `PdfPage.tsx:11`, `PdfStage.tsx:48` | Extended with the optional `onTextLayer` callback. |
| Text layer | `web/src/plugins/pdf/pdf-document.ts:63` (`drawPage`), `pdf-document.ts:78` (`textLayer.replaceChildren()`), `pdf-text-layer.css:84` | Read only. The marks never rewrite the layer or its spans. |
| PDF.js line breaks | `pdfjs-dist/build/pdf.mjs`, `TextLayer.#appendText` (one `<br>` for every `hasEOL`, even an empty item) | Makes the DOM line index the same as `PdfLine.index` from `pageLines`. |
| Selection color | `web/src/plugins/pdf/pdf-text-layer.css:84` (`::selection`) | Left alone. The mark colors are separate, translucent, and set only `background-color`. |
| Line model | `PdfLine` from `pdf-find-lines.ts:7`, `current` from `usePdfFind.ts:93` | Supplies page, line index, and line-relative start for the current mark. |
| Overlay state | `find.findOpen`, `find.query`, `find.current` from `usePdfFind.ts:102` | The marks hook's inputs. `open` is the boolean, not the action. |
| Test `CSS` global | `web/src/plugins/pdf/PdfTab.test.tsx:73` (`CSS.escape`), the `css.escape` polyfill loaded by the testing-library packages | `PdfTab.test.tsx`'s marks tests must preserve `CSS.escape` when they add `highlights`; the other two test files do not use it. |

## Proposed changes

- Create `web/src/plugins/pdf/pdf-find-marks.ts` with `PDF_FIND_MATCH`, `PDF_FIND_CURRENT`, `PdfFindOccurrence`, `occurrencesInLayer`, and `paintMarks` as described above. Keep it DOM-only and React-free.
- Create `web/src/plugins/pdf/usePdfFindMarks.ts` with the repaint and aggregate cleanup effect described above.
- In `web/src/plugins/pdf/usePdfPageRender.ts`, add `onTextLayer?(index: number): void` to the params and `PdfPageProperties`, add it to the render effect's dependency list, and call it after `renderPage` resolves when the page has a text layer, the render is still live, and the callback exists.
- In `web/src/plugins/pdf/PdfPage.tsx`, accept and forward `onTextLayer` to `usePdfPageRender`.
- In `web/src/plugins/pdf/PdfStage.tsx`, accept `onTextLayer?` in `PdfStageProperties` and pass it to each stage `PdfPage`; leave `PdfThumbnails` alone.
- In `web/src/plugins/pdf/PdfTab.tsx`, add the `textLayerVersion` state and the stable `onTextLayer` callback next to the other per-tab state, pass the callback to `PdfStage`, and call `usePdfFindMarks` after `usePdfFind`, passing the boolean `find.findOpen` (not `find.open`), `find.query`, `find.current`, `stageRef`, and `textLayerVersion`. The file is 172 counted lines today; these additions are under 10, so it stays under the 200-line `max-lines` cap and needs no extraction.
- In `web/src/plugins/pdf/pdf.css`, add the two `::highlight` rules described above.
- In `web/src/plugins/pdf/pdf-styles.test.ts`, widen the pseudo-element stripping expression, keep the existing containment expectations, and add the assertion that both highlight selectors survive parsing.
- Land in this order so each step typechecks and tests green: the pure module and its test; the `onTextLayer` plumbing with the stable `PdfTab` callback; the hook and its `PdfTab` wiring; then the CSS and the styles test. The optional callback can land before the hook because every caller tolerates `undefined`.

## Tests

Both new test files clear the DOM and call `vi.unstubAllGlobals()` after each case, as `web/src/plugins/shell/reply-selection.test.ts:5-9` does.

In `web/src/plugins/pdf/pdf-find-marks.test.ts`, with a layer built by hand from spans and `<br>`s:

- Occurrences are found case-insensitively.
- An occurrence that crosses two spans of one line yields one range covering the matched text.
- Nothing is found across a `<br>`.
- Each range is tagged with its line index, including the line after a `<br>`.
- Two consecutive `<br>`s produce an empty line, and text after them is indexed one higher, matching `pageLines`' empty-line rule.
- `start` is relative to the line, not the layer: a match on the second line starts at its own first character.
- A match ending at a line's last character ends at the last text node's end and does not reach into the next line.
- A query with more than one occurrence returns each occurrence, including overlapping ones (`aa` in `aaa` returns starts 0 and 1).
- Empty and whitespace-only queries return nothing.
- `paintMarks` adds the non-current ranges to `pdf-find-match` and the current range to `pdf-find-current`, and its cleanup removes exactly those ranges.
- The current range is excluded from the match set by identity even when a different Range covers the same text.
- Two painters on the same highlights leave each other's ranges alone when one cleans up, and a cleanup leaves the highlight object registered for the other.
- `paintMarks` does nothing when `CSS.highlights` is missing and when `Highlight` is missing, returning a cleanup that is safe to call.

In `web/src/plugins/pdf/usePdfFindMarks.test.tsx`, with a stage element containing two `.pdf-page` elements and their layers, and with `CSS.highlights` and `Highlight` stubbed:

- An open overlay with a query paints occurrences from both layers.
- The current occurrence goes to the current highlight and not the match highlight; assert its start container and offset, because both occurrences can render as the same text.
- Changing the highlighted row moves the current range, and the previous current becomes a normal match.
- Changing the query replaces the old ranges, asserted by Range identity.
- Bumping the text-layer counter repaints the new layer contents and drops the old Range objects.
- Closing the overlay clears every range on both layers; unmounting does the same.
- A closed overlay with a non-empty query paints nothing.
- Clearing the query while the overlay stays open clears every range.
- A current with no matching result, or on a page that is not drawn, leaves every visible occurrence as a normal mark.
- A layer with no `.pdf-page` ancestor is skipped, and so is a `.pdf-page` with a missing, empty, or non-integer `data-page`.
- A current page of 0 matches `data-page="0"`, confirming the 0-based comparison.

In `web/src/plugins/pdf/PdfTab.test.tsx`:

- Stub `CSS.highlights` and `Highlight`, preserving the existing `CSS.escape` the `onScreen` helper uses at `PdfTab.test.tsx:73`; the file's `afterEach` already calls `vi.unstubAllGlobals()`.
- The mocked `renderPage` must replace the text layer's children and append the page's spans and `<br>`s on every draw, as `drawPage` does. Leave `makeDocument`'s default no-op renderer unchanged for the existing tests, and override `renderPage` in the marks tests.
- Remember that `mount` does not draw a stage page until `onScreen({ 0: 1 })` is called; await the render before asserting marks.
- Opening find and typing marks the occurrences on the drawn page, and clicking a row puts that row's occurrence in the current highlight and not the match highlight.
- Opening find and typing before the page is drawn marks the page when `onScreen` draws it, covering the "pages drawn later" path.
- Typing does not redraw an already drawn page: the mocked `renderPage` call count stays the same, proving the `onTextLayer` callback is stable.
- A zoom change redraws the layer and repaints it; capture the old Range objects and assert those objects are gone, not merely that a Range with the same text exists.
- Closing the overlay clears the highlights.

In `web/src/plugins/pdf/pdf-styles.test.ts`:

- The existing root-selector and host-containment checks pass with the two `::highlight(...)` rules.
- The widened stripping expression is exercised by the new selectors, so the "matches nothing the host draws" check does not throw and does not match a host element.
- Both `.pdf-text-layer ::highlight(pdf-find-match)` and `.pdf-text-layer ::highlight(pdf-find-current)` are present in `selectorsOf(styles)`, so a jsdom parser change cannot make the containment check vacuous.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then run the focused tests:

`npm run test:client -- web/src/plugins/pdf/pdf-find-marks.test.ts web/src/plugins/pdf/usePdfFindMarks.test.tsx web/src/plugins/pdf/pdf-styles.test.ts web/src/plugins/pdf/PdfTab.test.tsx`

`npm run typecheck:diff`

Manual check with a multi-page PDF: open find and type a word on several pages. Every occurrence on the shown page is marked, and the highlighted row's occurrence is stronger. Clear the query while the overlay stays open and confirm the marks clear. Scroll to another page in continuous layout and confirm its marks appear when the page draws. Zoom in and confirm the redrawn page's marks are in the right places and the old ranges are gone. Switch layouts and confirm the same, and confirm the thumbnail strip shows no marks. Press Escape and confirm every mark clears while the text is still selectable and copyable.

## Out of scope

- Marking pages that contain matches in the page strip.
- A match counter or next and previous match buttons.
- Changing the text layer's DOM, the selection color, or PDF.js's text geometry.
- Rewriting only the layer that changed during a repaint. The per-layer optimization is a documented upgrade.
- Using the browser's Selection API or making a text selection when highlighting a row.
- Any code outside the PDF plugin except the shared overlay work already done in `pdf-find-01-shared-overlay`.
- The PDF spec, help, and user docs. Those are `pdf-find-05-specs-docs-and-verification`.
