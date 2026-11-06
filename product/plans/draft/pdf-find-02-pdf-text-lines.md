# Read PDF page text and build the line model

**Complexity: 4/10** — a new PDF.js text read behind the existing loader boundary and a pure grouper that has to match how `TextLayer` draws line breaks. The coordinate conversion for rotated pages is the fiddly part.

## Goal

Let the PDF plugin read a page's text in the browser from the document already loaded. `LoadedPdf` gains `readPageText(index)`, which returns plain text items, and a new pure module groups those items into the lines a reader sees. Nothing outside `pdf-document.ts` sees a PDF.js type.

## Design decisions and dependencies

This subplan depends on nothing earlier. It lands after `pdf-find-01-shared-overlay` only for sequence, and it does not use that subplan's code. `pdf-find-03-find-hook-and-overlay` consumes `readPageText` and `pageLines`, and `pdf-find-04-match-marks` consumes the line indexes it defines.

- `LoadedPdf` gains `readPageText(index: number): Promise<PdfTextItem[]>`. The method closes over the page proxies already fetched by `loadPdf`, so it performs no server call, opens no second document, and creates no new PDF.js loading task. The browser reads the bytes it already has, exactly as it draws the pages today.
- Each returned item is plain data: `text` is the item's string, `hasEOL` is PDF.js's line-end flag, and `top` is the item's viewport y divided by the page's scale-1 viewport height. `top` is a fraction in 0 through 1 for ordinary text, and PDF.js's `convertToViewportPoint` handles a rotated page.
- Items without a string are skipped. That covers PDF.js's marked-content entries, the same ones `TextLayer` ignores before it draws a span. The filter is a `'str' in item` check, not a cast.
- `web/src/plugins/pdf/pdf-find-lines.ts` is a new pure module. It exports `PdfTextItem`, `PdfLine`, and `pageLines(pageIndex, items)`. `PdfLine` carries `text`, the 0-based `page`, the 0-based `index` on that page, and `top` taken from the line's first item. It has no React, DOM, or PDF.js import.
- A line's text is its items' strings concatenated in order with no inserted separators. PDF.js includes the spaces and punctuation in the item strings, and adding our own would change what is searched.
- A line ends after every item whose `hasEOL` is true, and the final unterminated run ends at the page boundary. An item with an empty string and `hasEOL` still produces an empty line, because `TextLayer` appends a `<br>` for it. A page whose last item ends a line gets no extra trailing line, because no text follows the final `<br>` and an empty segment cannot match or carry a mark. A page with no items produces no lines. This is the contract that lets a mark's line index and a `PdfLine.index` mean the same number for every line that can contain text.
- Every line is kept, including empty ones and duplicate text. Two lines with the same text are two entries with different `index` values; nothing is deduplicated.
- `pdf-find-lines.ts` is tested without a DOM. `pdf-document.test.ts` mocks PDF.js as it already does and checks the loader's mapping.
- Adding a required `readPageText` to `LoadedPdf` breaks every literal of that type. Update both existing test mocks in the same change, `web/src/plugins/pdf/PdfTab.test.tsx` and `web/src/plugins/pdf/usePdfDocument.test.ts`, with a stub that resolves to an empty array. This keeps typecheck and tests green before the hook exists.
- No server code, wire shape, or manifest change. The document bytes and page proxies are already there.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| PDF.js boundary | `web/src/plugins/pdf/pdf-document.ts` (`loadPdf`, `LoadedPdf`, `drawPage`, `pages`) | Extended in place. `readPageText` uses the already-fetched `pages[index]` proxy and shares the same failure and teardown behavior. |
| PDF.js text API | `PDFPageProxy.getTextContent()` and `TextItem.hasEOL`, `TextItem.transform`, `TextItem.str` | Read only inside `pdf-document.ts`. |
| Viewport conversion | `PDFPageProxy.getViewport({ scale: 1 })` and `PageViewport.convertToViewportPoint` | Converts each item's transform origin to viewport coordinates. `getViewport` is already used for `pageSizes`; `convertToViewportPoint` is new to this feature. |
| Page size model | `web/src/plugins/pdf/pdf-view-model.ts` (`PageSize`) | Unchanged. The line's `top` is a fraction, so marks and reveal do not depend on zoom. |
| Existing PDF tests | `web/src/plugins/pdf/pdf-document.test.ts`, `web/src/plugins/pdf/PdfTab.test.tsx`, `web/src/plugins/pdf/usePdfDocument.test.ts` | Extended and kept green. |
| PDF spec | `product/specs/pdf-tab.md` § Text selection and § When a document cannot be rendered | Read for behavior. The spec update is `pdf-find-05-specs-docs-and-verification`. |

## Proposed changes

- In `web/src/plugins/pdf/pdf-document.ts`, import the `PdfTextItem` type from `./pdf-find-lines` and add `readPageText` to `LoadedPdf`.
- Implement `readPageText` in the object returned by `loadPdf`. Resolve the page proxy, get its scale-1 viewport once, await `getTextContent()`, filter items to those with a string, convert `transform[4]` and `transform[5]` through `convertToViewportPoint`, and return each item's string, `hasEOL`, and `y / viewport.height`.
- Do not add any other PDF.js export to the plugin. Do not expose `PDFPageProxy`, `TextItem`, or `PageViewport` outside `pdf-document.ts`.
- Create `web/src/plugins/pdf/pdf-find-lines.ts` with the two exported types and `pageLines`. Keep it pure and under the file-size limit.
- Add `readPageText: vi.fn(async () => [])` to `makeDocument` in `web/src/plugins/pdf/PdfTab.test.tsx` and `web/src/plugins/pdf/usePdfDocument.test.ts`.
- Add `web/src/plugins/pdf/pdf-find-lines.test.ts` beside the new module.

## Tests

In `web/src/plugins/pdf/pdf-document.test.ts`, beside the existing loading and rendering cases:

- `readPageText` returns each item's string, `hasEOL`, and top fraction from a mocked page. The mock's `convertToViewportPoint` returns a known y, and the test asserts the fraction is that y divided by the mocked viewport height, not the raw transform y.
- Marked-content entries, such as an item with only a `type` and no `str`, are left out.
- A rotated-page case can make `convertToViewportPoint` swap or offset the axes and still asserts the returned fraction, proving the loader uses the viewport rather than reading `transform` directly.
- A rejected `getTextContent` propagates to the caller. The hook decides what to do with a failed page; the loader does not swallow it.

In `web/src/plugins/pdf/pdf-find-lines.test.ts`:

- Items join into one line and split at every `hasEOL`, with a final unterminated run emitted at the page end.
- An item with an empty string and `hasEOL` yields an empty line, and indexes count every `hasEOL`, so the line after it has the expected index.
- A page whose last item has `hasEOL` gets no extra trailing line.
- Two identical lines stay two lines.
- A page with no items yields no lines.
- Each line carries the page passed in, its index on that page, and the first item's `top`.
- A line made of several items concatenates their strings without adding separators.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then run the focused tests and the incremental typecheck:

`npm run test:client -- web/src/plugins/pdf/pdf-document.test.ts web/src/plugins/pdf/pdf-find-lines.test.ts web/src/plugins/pdf/PdfTab.test.tsx web/src/plugins/pdf/usePdfDocument.test.ts`

`npm run typecheck:diff`

The typecheck is the check that both `LoadedPdf` literals were updated.

## Out of scope

- Any find UI, chord claim, overlay, or reveal. Those are `pdf-find-03-find-hook-and-overlay`.
- Match marks or CSS Custom Highlight ranges. Those are `pdf-find-04-match-marks`.
- Caching text across tabs, writing extracted text anywhere, or reading text on the server.
- A second line model for thumbnails or a different definition of a line in another module.
- Changing `drawPage`, the text layer, page sizing, zoom, or PDF loading.
