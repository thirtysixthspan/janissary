# Close the PDF find overlay when a render failure fails the document

**Complexity: 4/10** — two small production changes in the PDF plugin, one new component test, and one spec paragraph; the care is in closing the hook state without stealing focus and in proving both the overlay and the marks are gone after a failure that arrives while a search is underway.

## Goal

When a page render failure turns a PDF tab into its failed body, `PdfTab` still renders `LineFind` from `find.findOpen`, so the overlay sits over `Failed to load <name>` with its old rows and no `Reading pages…` status. The overlay's input may hold focus, but `usePdfKeys` is gated on a loaded document, so Escape no longer reaches the close path from the page. The stale search is both meaningless — the stage it searched is gone — and, from the page, hard to dismiss.

A failed document must close an open find overlay. Closing it through `useLineFind` also lets `usePdfFindMarks` clear every range, because its effect returns no painter when the overlay is closed.

## Approach

The document state has three values: `loading`, `ready`, and `failed`. `PdfTab` already derives `loaded` from `ready`, and the failed body replaces the stage. Two changes make the failure path authoritative:

1. **Render the overlay only while the document is ready.** Gate `LineFind` on `state.status === 'ready' && find.findOpen`. This removes the stale overlay in the same commit that swaps in the failed body, before any effect has run.
2. **Close the find state when the document leaves the hook.** In `usePdfFind`, add an effect that calls the raw `closeFind` from `useLineFind` when `pdf` becomes `null` while `findOpen` is true. `PdfTab` passes `loaded`, which is `null` after a failure and also while loading; the `findOpen` guard keeps the loading case a no-op since the overlay cannot open without a document. The raw `closeFind` is deliberate: the public `close` restores focus to the element that had it before opening, and on a failed document that element is inside the stage that has just been removed, so there is nothing useful to focus. `useLineFind`'s close resets only the open flag; the next open already starts from an empty query.

Both changes are needed. The render gate prevents a frame of stale overlay before the effect runs; the effect settles the hook state so the marks' effect sees `open: false` and clears its ranges. With only the render gate, `findOpen` would stay true and the marks would remain in their highlight sets; with only the effect, one commit would still paint the overlay over the failed body.

## Implementation steps

1. **`web/src/plugins/pdf/PdfTab.tsx`** — change the overlay condition from `find.findOpen` to `state.status === 'ready' && find.findOpen`. No other change: `find.findOpen` still drives `usePdfKeys`, and the chord handler still opens only when `loaded` is non-null.
2. **`web/src/plugins/pdf/usePdfFind.ts`** — add an effect after `close` that calls `closeFind()` when `pdf === null && findOpen`, with `closeFind`, `findOpen`, and `pdf` as its dependencies.
3. **`web/src/plugins/pdf/PdfTab.test.tsx`** — in `describe('PdfTab failure')`, add a case that mounts a two-page marked document in continuous layout, opens find, types a query, draws page 0 so a mark is painted, then makes `renderPage` reject with a non-cancellation error and drives page 1 on screen. Wait for the failed body, then assert the `Search document` input is gone and both highlight sets hold no ranges. Keep the existing failure cases untouched.
4. **`product/specs/pdf-tab.md` § Find** — extend the loading/failed paragraph with the new rule: an overlay that is open when the document fails closes, and its marks clear.
5. Run `$janissary/scripts/run.mjs check-diff` and the focused PDF tests after each production change and again after the test and spec edits.

## Tests

- New case in `web/src/plugins/pdf/PdfTab.test.tsx`, `PdfTab failure`: "closes the find overlay and clears its marks when a render fails".
  - Mount a marked two-page document and switch to continuous layout so every page is listed.
  - Open find with `meta+f`, type `needle`, and wait for reading to finish.
  - Drive page 0 on screen and wait for one match range and one current range.
  - Replace `renderPage` with a rejection for a plain `Error`, drive page 1 on screen, and wait for `Failed to load paper.pdf`.
  - Assert `queryByLabelText('Search document')` is absent and `allRanges(highlights)` is empty.
- Existing `PdfTab failure` cases stay green, including the once-only notification and cancellation cases.
- `$janissary/scripts/run.mjs check-diff` covers lint, typecheck, and the affected web tests.

## Out of scope

- Any server change: the failure path is entirely client-side.
- Focus restoration on a failure-driven close. The raw `closeFind` is intentional; the pre-find origin is in the removed stage, and the failed body is not an equivalent place to send focus.
- Clearing the query or the read lines when failure closes the overlay. `useLineFind` keeps its query while closed and every open resets it, and the tab never reloads a document, so no stale state can surface.
- Updating `help/` or `documentation/user-documentation/tab-types/pdf-viewer.md`. Their existing wording already limits search to a loaded document and does not describe an overlay surviving a failure.
- The other entry in `product/backlog/pull-request.md`.
