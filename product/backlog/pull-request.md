<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Stop PDF find's background text extraction when a render failure invalidates the document.

Existing Issue: When `PdfTab` enters its failed state after a render error, `usePdfFind` closes the overlay but its in-flight `read` loop continues extracting and retaining every remaining page's text until the loop finishes. Severity: 4/10

Existing Risk: 4/10 - A render failure during a search of a large document can leave PDF.js extracting text and the failed tab accumulating unused line data, causing avoidable CPU and memory pressure.

Proposal Risk: 1/10 - Invalidating the read when the document becomes unavailable prevents further page extraction and releases accumulated lines, leaving only a page read already in flight to finish.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "cancel PDF find text extraction after render failure". In `web/src/plugins/pdf/usePdfFind.ts`, track the current read generation and invalidate it when the loaded `pdf` becomes `null`; check that generation before each page request and after each awaited result so a pending request cannot start another page or append stale lines. Clear retained lines and stop the reading state on invalidation, while preserving the current behavior when a tab merely becomes inactive. Add a deferred-read case to `web/src/plugins/pdf/usePdfFind.test.ts` and an integration assertion in `web/src/plugins/pdf/PdfTab.test.tsx` that a render failure closes find, lets the in-flight page settle, starts no later page reads, and retains no lines.
