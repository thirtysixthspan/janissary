<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Make the review report's closing note keep the no-plan Promise: form available to aggregate reviews instead of telling every aggregate review to take the first form.

Existing Issue: The note after Step 7's report template says that in `aggregate` scope the `Promise:`, `Coverage:`, and `Findings:` lines "take their first forms", but the `Promise:` line's second form, "none in the PR — used the PR body and commit subjects", is also an aggregate form, so read literally the note rules out the form an aggregate review of a pull request with no own plan must use, against Step 2 item 6 and the plan's requirement that aggregate report lines read as they did before. Severity: 2/10

Existing Risk: 3/10 - An aggregate review of a hygiene or documentation pull request with no own plan may report a plan path and fix-plan count it doesn't have, giving a reader a false account of what the review judged against.

Proposal Risk: 1/10 - The note and the template agree, leaving only the ordinary chance that a reviewer misreads a template line.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2207 "make Step 7's closing note keep the no-plan Promise: form available to aggregate reviews". In `ai/tasks/feature/review-pull-request.md`, in the paragraph after the Step 7 report code block that begins "In `aggregate` scope, including a fallback", replace "take their first forms" with wording that says those lines take the forms that count promise items, with the `Promise:` line naming the own plan and its fix plans or, when Step 2 item 6 found no own plan, reading "none in the PR — used the PR body and commit subjects". Keep the following sentences on commit and range scopes and on an empty scope unchanged, and keep the paragraph on its one line so the description's anchors into the file, including lines 312 and 314, still land. No test asserts this sentence, so `scripts/review-pull-request-scope.test.mjs` and `scripts/pr-description-statistics-guideline.test.mjs` must keep passing untouched. Verify by reading Step 2 item 6, the Step 7 template, and the note together as an aggregate reviewer of a pull request with no own plan, and confirm they agree on the `Promise:` line you would write.
