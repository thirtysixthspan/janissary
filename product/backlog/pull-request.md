<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep a valid highlighted row when Down is pressed while the PDF find results are still empty, so the first row is selected when results arrive.

Existing Issue: With a non-empty query and no results yet (the overlay's Reading pages… state), rankedOverlayKeys computes Math.min(-1, selected + 1) for ArrowDown and calls onChangeSelected(-1), and useLineFind's clamp only uses Math.min, so the negative selection survives when pages arrive and no row or current mark is highlighted. Severity: 2/10

Existing Risk: 2/10 - A reader who presses Down while waiting for results gets an overlay whose rows have no highlight and whose current occurrence is unmarked until another key press, which looks like a broken selection.

Proposal Risk: 1/10 - Ignoring a negative index in the PDF find hook leaves the shared editor and shell behavior untouched; the only residual risk is a caller that legitimately needs a negative selection, which none does.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "keep the PDF find selection non-negative when Down is pressed before results exist". In web/src/plugins/pdf/usePdfFind.ts, make select(index) return before setSelected when index is negative, so the current row stays selected while the document is still being read; do not change web/src/shared/line-find/useLineFind.ts or rankedOverlayKeys.ts, since the editor and shell paths are pre-existing and outside this fix. Add a case to web/src/plugins/pdf/usePdfFind.test.ts: with a deferred PDF, open, setQuery('needle') while reading, call select(-1), resolve the page with a matching line, and assert selected is 0 and current is the first result's page, line, and start; keep the existing usePdfFind focus and reveal tests green. Note in the plan's reuse table that the PDF hook guards the shared handler's zero-result Down if the change is kept. No other behavior change; $janissary/scripts/run.mjs check-diff after.
