<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Qualify the description's no-text and mark claims to non-whitespace queries, so they match the whitespace-only state the overlay actually shows.

Existing Issue: The description's no-text paragraph says a document with no text answers every query with `No matching lines`, and its marks paragraph says every occurrence is marked while the query is non-empty, but `LineFind` and `usePdfFindMarks` trim the query, so an empty or whitespace-only query shows `type to search` and paints no marks on every document, including a no-text one. Severity: 2/10

Existing Risk: 2/10 - A reader or future test can expect `No matching lines` for an empty or spaces-only query on a scanned PDF, contradicting the description's own Step 14 and the spec's non-whitespace wording.

Proposal Risk: 1/10 - The corrected wording matches the existing `LineFind` trim branch and `usePdfFindMarks`' trimmed-query guard, and no behavior or test changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "qualify the description's no-text and mark claims to non-whitespace queries". In the pull request body's no-text sentence, change "answers every query" to "answers every non-whitespace query"; in the marks paragraph, change "while the query is non-empty" to "while the query has non-whitespace text". The spec's `product/specs/pdf-tab.md` § Find and `product/plans/complete/pdf-tab-find.md` already say non-whitespace, `web/src/shared/line-find/LineFind.tsx` shows `type to search` when `!query.trim()`, and `web/src/plugins/pdf/usePdfFindMarks.ts` returns before painting for a trimmed-empty query. The existing `LineFind` and `usePdfFindMarks` tests pin both states; no code change.
