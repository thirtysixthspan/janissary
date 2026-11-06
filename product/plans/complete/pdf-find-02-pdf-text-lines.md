# Read PDF page text and build the line model

**Complexity: 4/10** — a new PDF.js text read behind the existing loader boundary plus a pure grouper that must reproduce `TextLayer`'s `hasEOL` breaks and the text layer's own text offsets. The coordinate conversion and the two `LoadedPdf` test fixtures are the fiddly parts.

## Goal

Let the PDF plugin read a page's text in the browser from the document already loaded. `LoadedPdf` gains `readPageText(index)`, which returns plain text items, and a new pure module groups those items into the lines a reader sees. Nothing outside `pdf-document.ts` sees a PDF.js type, and a line's text is the same string the drawn text layer holds, offset for offset, so later subplans can map a match back to a page line.

## Design decisions and dependencies

This subplan depends on nothing earlier. `pdf-find-01-shared-overlay` is already merged on this branch and none of its code is used here, so this subplan can land on its own. `pdf-find-03-find-hook-and-overlay` consumes `readPageText`, `pageLines`, and `PdfLine`; `pdf-find-04-match-marks` relies on the line index contract; `pdf-find-05-specs-docs-and-verification` documents the result.

- `LoadedPdf` (`pdf-document.ts:31`) gains `readPageText(index: number): Promise<PdfTextItem[]>`. The method closes over the `pages` array already fetched by `loadPdf` (`pdf-document.ts:101`), so `pages[index]` is the already-resolved proxy for the same 0-based index that `pageSizes` and `renderPage` use. It creates no PDF.js loading task, makes no server call, and opens no second document. Implement it as an `async` function: an out-of-range index or a synchronous PDF.js throw then reaches the caller as a rejected promise, which is what subplan 3 catches. It takes no signal and does no caching of its own; `destroy()` is the only teardown, and subplan 3 reads each page once and owns the document-level cache.

- Each returned item is plain data: `text` is the item's `str`, `hasEOL` is PDF.js's line-end flag, and `top` is the item's transform origin mapped through the page's scale-1 viewport with `convertToViewportPoint` and divided by that viewport's height. `top` is a zoom-independent fraction of the displayed page height, including a page with `/Rotate`. It is the glyph baseline, not the top edge of the glyph box; the reveal places that anchor, so do not subtract a font ascent. The default viewport flips the y axis and rotation changes it again, so the transform's own y is never used directly.

- `getTextContent()` is called with no options, exactly as `drawPage` calls `streamTextContent()` with none (`pdf-document.ts:79`). `getTextContent()` collects the same `streamTextContent()` chunks in the same order, so the line model sees the same items and `hasEOL` flags the text layer draws from. Its declared `items` type is still `TextItem | TextMarkedContent` (`pdfjs-dist` 6.3.289, `types/src/display/api.d.ts`), so filter with a `'str' in item` narrowing guard rather than a cast. `getTextContent()` does not request marked-content entries; the guard keeps the declared union honest, and the mocked-page test exercises it.

- `web/src/plugins/pdf/pdf-find-lines.ts` is a new pure module, shaped like `pdf-view-model.ts`: no React, DOM, or PDF.js import, with a colocated `pdf-find-lines.test.ts`. It exports `PdfTextItem`, `PdfLine`, and `pageLines`. `pageLines` takes a page index and a readonly `PdfTextItem[]`, returns a new `PdfLine[]`, and does not mutate its input. `PdfLine` carries `text`, the 0-based `page`, the 0-based `index` on that page, and `top` from the line's first item. `pdf-document.ts` imports `PdfTextItem` from it as a type, the same direction as its existing `PageSize` import from `./pdf-view-model` (`pdf-document.ts:14`); there is no cycle because the pure module imports nothing.

- A line's text is its items' strings concatenated in their original order with no inserted separators and no trimming. PDF.js already includes the spaces and punctuation in the item strings. Adding a separator, sorting the items, or trimming the result would change what is searched and shift the range offsets that `pdf-find-04-match-marks` matches against the text layer's own nodes.

- `hasEOL` is the only line boundary, because it is the only source of `TextLayer`'s `<br>`. Do not add a break for a change of `top`, a gap in x, or a change of font, and never sort items by geometry.

- A line ends after every item whose `hasEOL` is true, and the final unterminated run ends at the page boundary. An empty-string item contributes no text; with `hasEOL` it still ends the current line, and a line it starts is empty and is kept, because `TextLayer` appends a `<br>` for every `hasEOL` item even when it draws no span (`pdfjs-dist` 6.3.289, `build/pdf.mjs`, `#appendText`, `if (textDivProperties.hasEOL)`). A page with text items but no `hasEOL` yields one line, even if every string is empty; a page with no items yields no lines. A page whose last item ends a line gets no extra trailing line, because no text follows the final `<br>` and an empty segment cannot match or carry a mark. This contract makes a mark's line index and a `PdfLine.index` the same number for every line that can contain text.

- Every run the items form is kept, including empty ones; duplicate text is not deduplicated. Two lines with the same text are two entries with different `index` values.

- `pdf-find-lines.test.ts` needs no DOM; it exercises the pure function directly. `pdf-document.test.ts` mocks PDF.js as it already does and checks the loader's mapping.

- Adding a required `readPageText` to `LoadedPdf` breaks both existing literals of that type. Update `makeDocument` in `web/src/plugins/pdf/PdfTab.test.tsx:30` and `web/src/plugins/pdf/usePdfDocument.test.ts:14` in the same change with a stub that resolves to an empty array. No other file constructs a `LoadedPdf` literal. This keeps typecheck and tests green before subplan 3 exists.

- No server code, wire shape, or manifest change. The document bytes and page proxies are already there.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| PDF.js boundary | `web/src/plugins/pdf/pdf-document.ts` (`loadPdf`, `LoadedPdf`, `drawPage`, `pages`) | Extended in place. `readPageText` indexes the already-resolved `pages` entry; a rejection propagates unchanged rather than going through `failureKind` or failing the document. |
| PDF.js text API | `PDFPageProxy.getTextContent()` and `TextContent.items`, `TextItem.str`, `TextItem.hasEOL`, `TextItem.transform` (`pdfjs-dist` 6.3.289, `types/src/display/api.d.ts`) | Read only inside `pdf-document.ts`. The item union is narrowed before mapping. |
| Viewport conversion | `PDFPageProxy.getViewport({ scale: 1 })` and `PageViewport.convertToViewportPoint` (`types/src/display/page_viewport.d.ts`) | Converts each item's transform origin to viewport coordinates. `getViewport` is already used for `pageSizes` (`pdf-document.ts:107`) and in `drawPage`; `convertToViewportPoint` is not used anywhere in the repo yet. |
| Page size model | `web/src/plugins/pdf/pdf-view-model.ts` (`PageSize`) | Unchanged. The line's `top` is a fraction, so marks and reveal do not depend on zoom. |
| Pure module and test precedent | `web/src/plugins/pdf/pdf-view-model.ts`, `pdf-view-model.test.ts` | The new module follows the same shape: plain exports, no React or DOM, tested directly. |
| Existing PDF tests | `web/src/plugins/pdf/pdf-document.test.ts`, `web/src/plugins/pdf/PdfTab.test.tsx` (`makeDocument`), `web/src/plugins/pdf/usePdfDocument.test.ts` (`makeDocument`) | Extended and kept green. The two `makeDocument` functions are the only `LoadedPdf` literals. |
| PDF spec | `product/specs/pdf-tab.md` § Text selection and § When a document cannot be rendered | Read for behavior. The spec update is `pdf-find-05-specs-docs-and-verification`. |

## Proposed changes

- In `web/src/plugins/pdf/pdf-document.ts`, import the `PdfTextItem` type from `./pdf-find-lines` and add `readPageText` to `LoadedPdf` (`pdf-document.ts:31`). The import is type-only and extensionless, per `eslint.config.mjs`.
- Implement `readPageText` as an `async` method in the object returned by `loadPdf` (`pdf-document.ts:110`). Index `pages[index]` with no `+ 1`; `loadPdf` already turned the 0-based index into PDF.js's 1-based page number when it built `pages` (`pdf-document.ts:102`). Get `getViewport({ scale: 1 })` once, call `getTextContent()` once with no options, skip items without `str`, and map each remaining item to `text` from `str`, `hasEOL` unchanged, and `top` from converting `transform[4]` and `transform[5]` through the viewport and dividing the resulting y by the viewport height. Coerce the converted y to a number before dividing: `convertToViewportPoint` is typed `any[]`, and `@typescript-eslint/no-unsafe-assignment` rejects an `any` reaching the returned object's `number` field. Index `transform` in place rather than destructuring its `any[]` elements into locals, for the same rule. Do not add a signal parameter, cache, retry, or catch.
- Do not add any other PDF.js export to the plugin. Do not expose `PDFPageProxy`, `TextItem`, `TextMarkedContent`, or `PageViewport` outside `pdf-document.ts`.
- Create `web/src/plugins/pdf/pdf-find-lines.ts` with the two exported types and `pageLines` as decided above. Keep it pure. `pdf-document.ts` is 127 lines on disk today (comments included) and the new method is well under the 200-line `max-lines` cap, so no extraction is needed.
- Do not wire `readPageText` into `PdfTab`, `PdfStage`, `usePdfDocument`, or any hook. It has no caller until `pdf-find-03-find-hook-and-overlay`.
- Add `readPageText` to `makeDocument` in `web/src/plugins/pdf/PdfTab.test.tsx:30` and `web/src/plugins/pdf/usePdfDocument.test.ts:14` as a stub that resolves to an empty array.
- Add `web/src/plugins/pdf/pdf-find-lines.test.ts` beside the new module.
- Land the pure module and its tests first, then add `readPageText`, its loader tests, and both fixture updates together. The required method makes the fixtures a same-change dependency, not a follow-up, and each step keeps the suite green.

## Tests

In `web/src/plugins/pdf/pdf-document.test.ts`, beside the existing loading and rendering cases:

- `readPageText(1)` reads the second entry of `pages` and returns each item's string, `hasEOL`, and top fraction. The mock's `convertToViewportPoint` returns a known y, and the test asserts the fraction is that y divided by the mocked viewport height, not the raw transform y, and that the conversion was called with the item's `transform[4]` and `transform[5]`. Reading page 1 rather than page 0 pins the 0-based indexing.
- An item with only a `type` and no `str` is left out. This is a guard test: the mock returns the marked-content shape even though `getTextContent()` does not request it.
- A case whose `convertToViewportPoint` returns a y unrelated to `transform[5]`, as the default y-flip and a 90° rotation both do, still yields the fraction from the converted y. This proves the loader uses the viewport rather than reading `transform` directly.
- A rejected `getTextContent` propagates to the caller. The hook decides what to do with a failed page; the loader does not swallow it or convert it to a `PdfLoadFailure`.
- A page whose `getTextContent` resolves to no items returns an empty array.

In `web/src/plugins/pdf/pdf-find-lines.test.ts`:

- Items join into one line and split at every `hasEOL`, with a final unterminated run emitted at the page end.
- An empty-string item with `hasEOL` that begins a line yields an empty line, and indexes count every `hasEOL`, so the line after it has the expected index. When it is the whole page, that empty line is the only line. The same item after text only ends that text line and does not add a second empty line.
- A page whose last item has `hasEOL` gets no extra trailing line.
- A page with items but no `hasEOL` yields one line, even when every string is empty; a page with no items yields no lines.
- Two identical lines stay two lines.
- Each line carries the page passed in, its index on that page, and the first item's `top`, including when that first item is empty.
- A line made of several items concatenates their strings without adding separators, and leading and trailing spaces in an item are preserved.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then run the focused tests and the incremental typecheck:

`npm run test:client -- web/src/plugins/pdf/pdf-document.test.ts web/src/plugins/pdf/pdf-find-lines.test.ts web/src/plugins/pdf/PdfTab.test.tsx web/src/plugins/pdf/usePdfDocument.test.ts`

`npm run typecheck:diff`

The typecheck is the check that both `LoadedPdf` literals were updated.

This subplan adds no user-visible control, so the end-to-end check is a regression check: open a multi-page PDF that has selectable text in the running app and confirm the pages still draw, text selection and copy still work, zoom and the layout toggle behave as before, and the console shows no PDF.js errors. The functional check of the read and the line grouping happens in `pdf-find-03-find-hook-and-overlay`, where the overlay is the first caller.

## Out of scope

- Any find UI, chord claim, overlay, or reveal. Those are `pdf-find-03-find-hook-and-overlay`.
- Match marks or CSS Custom Highlight ranges. Those are `pdf-find-04-match-marks`.
- Caching text inside `readPageText`, across pages, or across tabs; writing extracted text anywhere; or reading text on the server. Subplan 3 reads each page once and holds the lines for the tab's lifetime.
- A second line model for thumbnails or a different definition of a line in another module.
- Changing `drawPage`, the text layer, page sizing, zoom, or when and how the document is loaded. `readPageText` is added to the object `loadPdf` returns, not to the loading task or `drawPage`.
