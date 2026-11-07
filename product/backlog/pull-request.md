<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Reduce technical debt by pinning the untested PDF find announcement edge cases.

Existing Issue: The asynchronous announcement flow has no test for the empty-query ready message or its one-result singular form, though both are newly implemented states. Severity: 3/10

Existing Risk: 3/10 - A later change can silently drop or misphrase either announcement without a test failing, leaving screen-reader users without a reliable completion cue.

Proposal Risk: 1/10 - Regression tests will pin both messages, leaving only ordinary risk in the rest of the announcement state machine.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "cover PDF find announcement edge cases". Add cases in `web/src/plugins/pdf/PdfTab.test.tsx` using the existing deferred-page helpers: keep the query empty through the final page resolution and assert the live region says `Document text is ready to search.`; then resolve a one-match search and assert `1 matching line found.`. Keep the existing reading, first-results, zero-match, and capped-result assertions.
