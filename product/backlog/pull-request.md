<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Have the complex-feature workflow confirm each focused and resolution review ran in the scope it requested before working that review's findings, closing a functionality gap the new fallback opens.

Existing Issue: The complex-feature workflow's Step 6 passes `scope: commit` and `scope: range` to the review but never reads the review's `Scope:` report line, while the review now silently falls back to a full aggregate review whenever a SHA it was given cannot be used. Severity: 5/10

Existing Risk: 5/10 - One stale SHA, such as an implementation commit recorded before Step 5's rebase-and-retry rewrote it, turns a focused cycle into a full-PR review whose plan and description findings cover subplans not yet implemented, and Step 6 then works every one of them as a repair, breaking the per-subplan ordering the workflow exists to enforce.

Proposal Risk: 2/10 - A fallen-back cycle now stops with the PR and backlog preserved instead of proceeding, but the entries that review already committed stay in the backlog until someone decides what to do with them.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2207 "make build-a-complex-feature Step 6 stop when a focused or resolution review falls back to aggregate scope". In ai/tasks/feature/build-a-complex-feature.md Step 6 item 1 and item 4, require the orchestrator to read the review subagent's Step 7 report and confirm its `Scope:` line reads `commit <short-sha>` matching the implementation commit (item 1) or `range <base>..<head>` matching the recorded range (item 4); when it reads `aggregate — requested "<value>" ignored`, treat the review as blocked under Step 6's existing "If a review or repair is blocked" paragraph, preserving the PR and outstanding backlog and reporting the blocker, rather than working its entries. In Step 5 of the same file, state that the implementation commit SHA handed to Step 6 item 1 is read with `git rev-parse HEAD` after the push succeeds, so a rebase-and-retry cannot leave a stale SHA behind. Leave the review task's fallback behavior in ai/tasks/feature/review-pull-request.md unchanged, since the plan settled on falling back rather than stopping. Add an assertion to scripts/review-pull-request-scope.test.mjs that build-a-complex-feature.md names the `Scope:` check; its existing assertions and scripts/pr-description-statistics-guideline.test.mjs must keep passing. No test can exercise the orchestrator's actual reading of the report, so verify by reading Step 6 end to end after the edit.


* Validate the review's scope argument as plain commit identifiers before any git command receives it, closing a security gap in the new argument.

Existing Issue: Step 0 item 4 of the review task records the scope's raw value exactly as given, and Step 1 item 5 then places that value into `git rev-parse --verify <sha>^{commit}` and later into `git diff` with no format check, so any shell metacharacters in the argument reach the shell. Severity: 3/10

Existing Risk: 3/10 - A malformed or hostile scope value, for example one a caller copied out of branch content, becomes part of a shell command run by an agent that holds push access to the branch, although today's callers only pass SHAs they read from git.

Proposal Risk: 1/10 - Only values shaped like hexadecimal object names reach git; a caller that wanted a ref name such as a branch now falls back to aggregate, which the report's `Scope:` line makes visible.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2207 "validate scope SHAs as hexadecimal before running git on them". In ai/tasks/feature/review-pull-request.md Step 1 item 5 ("Validate the scope"), add a check ahead of the `git rev-parse --verify` check: the commit SHA, and each end of a range, must consist only of 4 to 40 hexadecimal characters, and any other value falls back to aggregate and is recorded for Step 7 without ever being placed in a command; renumber the checks that follow. In the same item, say that each SHA placed in a command is quoted. Add "a value that is not a commit identifier" to the fallback examples in the "Review and recording" section of product/specs/pull-request-review.md. Pin the new check's wording in scripts/review-pull-request-scope.test.mjs beside its existing assertions, which must keep passing along with scripts/pr-description-statistics-guideline.test.mjs. The PR target passed to `gh pr view` has the same unvalidated shape but predates this pull request and stays out of this change.


* Require a range scope's base to lie on the pull request, closing a functionality gap that lets a range review judge master's commits as the pull request's own.

Existing Issue: Step 1 item 5 of the review task checks that a range's head is in `origin/master..HEAD` and that its base is an ancestor of its head, but never checks where the base is, so a base on master older than the merge base passes and `git diff <base>..<head>` then includes master commits the pull request did not make. Severity: 3/10

Existing Risk: 3/10 - A mistyped or stale base makes the review record findings against code master already carries, and the repair task then edits code outside the pull request's change to address them.

Proposal Risk: 1/10 - A base equal to the merge base stays allowed, so reviewing the branch from its start still works; a deliberately older base now falls back to aggregate, which the report's `Scope:` line names.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2207 "require a range scope's base to be on the pull request branch". In ai/tasks/feature/review-pull-request.md Step 1 item 5, add a range check after the existing range-head check: the base must either be in `origin/master..HEAD`, checked with `git merge-base --is-ancestor` the same way as the head, or equal `git merge-base origin/master HEAD`; otherwise fall back to aggregate and record the raw value for Step 7. Keep the existing checks and their order, renumbering only those after the new one. Add a range that starts outside the pull request to the fallback examples in the "Review and recording" section of product/specs/pull-request-review.md. The callers in ai/tasks/feature/build-a-complex-feature.md Step 6 already pass a recorded PR head SHA as the base and need no change. Pin the new check's wording in scripts/review-pull-request-scope.test.mjs; its existing assertions must keep passing.


* Make the review task's scope validation cover its own unknown-keyword check, closing a functionality gap where the step's opening sentence excludes the case its first check handles.

Existing Issue: Step 1 item 5 of the review task applies its fallback checks only "for a `commit` or `range` request", yet its first check is for a keyword that is neither, so read literally an unknown keyword such as `scope: subplan 1a2b3c4` falls outside every rule and is assigned no effective scope. Severity: 2/10

Existing Risk: 3/10 - A reviewing agent that reads the gate literally stops or improvises a scope for an unknown keyword instead of falling back to aggregate as the plan, the spec, and the description all promise.

Proposal Risk: 1/10 - The wording becomes self-consistent; an agent that still mishandled an unknown keyword would show it in the report's `Scope:` line, which is where a reader would catch it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2207 "make Step 1 item 5's opening sentence cover unknown scope keywords". In ai/tasks/feature/review-pull-request.md Step 1 item 5 ("Validate the scope"), reword the opening so the ordered checks run for every request other than `aggregate`, for example "An `aggregate` request needs no check. For any other request, apply these checks in order and stop at the first that applies.", leaving the seven checks, their order, and the fall-back-to-aggregate rule unchanged. Do not change Step 0 item 4. scripts/review-pull-request-scope.test.mjs does not pin this sentence today; add an assertion for the new opening so it cannot drift back to a commit-or-range-only gate, and keep its existing assertions and scripts/pr-description-statistics-guideline.test.mjs passing.


* Anchor the pull request description's unanchored behavior examples and its empty-scope verification step to the task text that proves them, correcting a description fidelity gap.

Existing Issue: The description's Before/After transcript and its fallback sentence under Behavior examples, and How to verify edge case 6 ("An empty scope is a clean review"), name no line or test assertion, while every other Do/Expect step does. Severity: 2/10

Existing Risk: 3/10 - A reader checking those claims has to search the playbooks to find what proves them, and a later edit that moves or drops the empty-scope or fallback wording would leave the description asserting behavior nothing ties back to the code.

Proposal Risk: 1/10 - Line anchors in a description go stale as files change, so the next pull request update still has to re-check that each one points at the quoted text.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2207 "anchor the description's unanchored behavior examples and How to verify step 6". In the PR body, under Behavior examples, anchor the After invocation to the `Invocation:` paragraph near the top of ai/tasks/feature/review-pull-request.md and to Step 6 item 1 of ai/tasks/feature/build-a-complex-feature.md, and anchor the fallback sentence ("A scope that can't be used, such as `scope: subplan 1a2b3c4`...") to Step 1 item 5 and the Step 7 `Scope:` template line of ai/tasks/feature/review-pull-request.md. The Before block quotes text that no longer exists on the branch, so anchor it to master's version of Step 6 item 1 in ai/tasks/feature/build-a-complex-feature.md rather than to a branch line. In How to verify step 6, replace "read \"Confirm coverage\" in Step 3" with the line of that paragraph's "A scope whose diff holds no changes has nothing to review" sentence at the branch head. Change only the description through `gh pr edit --body-file`, edit no playbook, spec, script, or test, and confirm with `gh pr view 2207 --json body` that each anchor lands on the text it cites. No test covers the description.
