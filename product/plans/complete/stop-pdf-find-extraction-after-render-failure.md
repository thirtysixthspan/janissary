# Stop PDF find extraction after render failure

**Complexity: 3/10** — one hook's sequential asynchronous read needs invalidation, with a focused unit test, a component regression test, and a spec update. No plugin contract or visible controls change.

## Goal

When a render failure makes the PDF unavailable, stop Find from extracting the remaining pages and discard any text already retained for search. A page request already in flight may finish, but its result must not be kept and no later page may be requested. A tab becoming inactive alone must continue to leave the read and its retained text intact.

## Approach

Give the Find hook's single per-tab text read a generation number. Starting extraction records its generation. When `pdf` becomes `null`, advance the generation, clear retained lines, and stop the reading state. The sequential loop checks that its generation is still current before requesting each page and after each awaited result, including before appending lines. Keep the existing unmount guard and do not invalidate merely because the tab is inactive.

## Implementation steps

1. Add generation tracking and invalidation to `usePdfFind`, including clearing lines and ending the reading state when the document becomes unavailable.
2. Add a deferred-read unit test that invalidates after some lines have been read, then settles the pending page and confirms its lines are discarded and no subsequent page read starts. Add a `PdfTab` integration test that render failure closes Find, allows the in-flight text request to settle, and prevents further page reads.
3. Update the PDF tab spec with the invalidation behavior and explicitly retain the existing behavior for a tab that only becomes inactive.

## Tests

- In `web/src/plugins/pdf/usePdfFind.test.ts`, cover invalidation with previously retained lines and a pending page result; assert the hook clears lines, ends reading, discards the late result, and does not request another page.
- In `web/src/plugins/pdf/PdfTab.test.tsx`, hold a page-text request open, trigger a render failure, settle that request, and assert the overlay is closed and no later page read starts.
- Run `./scripts/run.mjs check-diff` after each change.

## Out of scope

- Cancelling a PDF.js page-text request already in flight; it is allowed to settle and its result is discarded.
- Stopping extraction or clearing its retained text only because the tab becomes inactive.
- Changes to the PDF find UI, plugin API, public help, or user documentation.
