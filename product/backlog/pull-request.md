<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the pull request description's account of screen-reader completion announcements.

Existing Issue: The PR body lists reading, first-match, and final-result announcements but omits the empty-query completion message, `Document text is ready to search.` Severity: 2/10

Existing Risk: 2/10 - A reviewer sees only part of the PDF find accessibility behavior, so the empty-query completion behavior can be missed when evaluating or documenting the feature.

Proposal Risk: 1/10 - The PR description will match the implementation, leaving only routine risk that announcements change later.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "describe empty-query completion announcement". Add the empty-query completion message to the screen-reader paragraph in the PR body: after reading finishes with an empty query, the live region announces `Document text is ready to search.` The behavior comes from `finalAnnouncement()` in `web/src/plugins/pdf/usePdfFind.ts`; keep the existing announcement sequence and `web/src/plugins/pdf/PdfTab.test.tsx` assertions unchanged.


* Correct plan fidelity by aligning the PDF guide's capped-results announcement with the implementation.

Existing Issue: The PDF user guide says the screen reader announces `10 or more matching lines`, while the live region emits `10 or more matching lines found.` Severity: 2/10

Existing Risk: 3/10 - Screen-reader users following the guide will hear a different phrase at the ten-row cap, leaving an avoidable documentation mismatch.

Proposal Risk: 1/10 - The guide will quote the implemented announcement exactly, leaving only routine risk from later behavior changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "correct the capped-results announcement in the PDF guide". Update `documentation/user-documentation/tab-types/pdf-viewer.md` to include `found.` in the quoted announcement. `finalAnnouncement()` in `web/src/plugins/pdf/usePdfFind.ts` and the cap assertion in `web/src/plugins/pdf/PdfTab.test.tsx` provide the exact wording; leave their behavior unchanged.


* Reduce technical debt by pinning the untested PDF find announcement edge cases.

Existing Issue: The asynchronous announcement flow has no test for the empty-query ready message or its one-result singular form, though both are newly implemented states. Severity: 3/10

Existing Risk: 3/10 - A later change can silently drop or misphrase either announcement without a test failing, leaving screen-reader users without a reliable completion cue.

Proposal Risk: 1/10 - Regression tests will pin both messages, leaving only ordinary risk in the rest of the announcement state machine.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "cover PDF find announcement edge cases". Add cases in `web/src/plugins/pdf/PdfTab.test.tsx` using the existing deferred-page helpers: keep the query empty through the final page resolution and assert the live region says `Document text is ready to search.`; then resolve a one-match search and assert `1 matching line found.`. Keep the existing reading, first-results, zero-match, and capped-result assertions.
