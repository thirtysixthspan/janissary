<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the PDF find overlay when a page render failure turns the tab into its failed body, which otherwise leaves stale results and a search that Escape cannot dismiss from the page.

Existing Issue: When a page render failure flips the PDF tab to its failed body while the find overlay is open, PdfTab.tsx still renders LineFind from find.findOpen, so the overlay sits over the failure with its old rows and no stage, and with focus outside the input Escape no longer closes it because usePdfKeys is disabled once the document is gone. Severity: 4/10

Existing Risk: 3/10 - A user searching a document that hits a bad page sees the tab fail under a still-active find overlay, can type into a search whose rows no longer correspond to anything, and may be unable to dismiss it from the page with Escape.

Proposal Risk: 1/10 - Closing the overlay when the document leaves the ready state removes the stale UI and leaves the failed body and its existing notification untouched; the only residual risk is closing a search the user might have wanted to keep, which the failed state makes meaningless.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "close the PDF find overlay when the document leaves the ready state". In web/src/plugins/pdf/PdfTab.tsx, render LineFind only when state.status === 'ready' in addition to find.findOpen. In web/src/plugins/pdf/usePdfFind.ts, add an effect that calls the raw closeFind (not the focus-restoring close) when pdf becomes null while findOpen is true, so the overlay state settles closed and usePdfFindMarks clears its ranges. Add a case in the existing PdfTab failure describe: mount a ready document, open find with a query, make renderPage reject with a non-cancellation error (not the cancelled sentinel), drive onScreen so the page render runs, wait for the failed body, then assert queryByLabelText('Search document') is null and both highlight sets are empty; keep the existing failure tests green. Update product/specs/pdf-tab.md § Find's loading/failed paragraph to say an open overlay closes when the document fails. No server change; $janissary/scripts/run.mjs check-diff after.


* Keep a valid highlighted row when Down is pressed while the PDF find results are still empty, so the first row is selected when results arrive.

Existing Issue: With a non-empty query and no results yet (the overlay's Reading pages… state), rankedOverlayKeys computes Math.min(-1, selected + 1) for ArrowDown and calls onChangeSelected(-1), and useLineFind's clamp only uses Math.min, so the negative selection survives when pages arrive and no row or current mark is highlighted. Severity: 2/10

Existing Risk: 2/10 - A reader who presses Down while waiting for results gets an overlay whose rows have no highlight and whose current occurrence is unmarked until another key press, which looks like a broken selection.

Proposal Risk: 1/10 - Ignoring a negative index in the PDF find hook leaves the shared editor and shell behavior untouched; the only residual risk is a caller that legitimately needs a negative selection, which none does.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "keep the PDF find selection non-negative when Down is pressed before results exist". In web/src/plugins/pdf/usePdfFind.ts, make select(index) return before setSelected when index is negative, so the current row stays selected while the document is still being read; do not change web/src/shared/line-find/useLineFind.ts or rankedOverlayKeys.ts, since the editor and shell paths are pre-existing and outside this fix. Add a case to web/src/plugins/pdf/usePdfFind.test.ts: with a deferred PDF, open, setQuery('needle') while reading, call select(-1), resolve the page with a matching line, and assert selected is 0 and current is the first result's page, line, and start; keep the existing usePdfFind focus and reveal tests green. Note in the plan's reuse table that the PDF hook guards the shared handler's zero-result Down if the change is kept. No other behavior change; $janissary/scripts/run.mjs check-diff after.
