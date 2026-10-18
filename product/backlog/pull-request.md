<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the plan's statement that the execute chain needs no catch, and list the rejection feed line that the chain now posts.

Existing Issue: Subplan 04 says the execute chain needs no catch of its own because ensure() never rejects, and its feed-text list names no text for a rejected run, yet the catch this commit extends now posts a new line for a rejection that can come from the enqueue step after ensure() succeeds, and the repair plan leaves the subplan's statement uncorrected. Severity: 3/10

Existing Risk: 3/10 - The scripts-tab spec that subplan 09 writes from this subplan would omit the rejection line and its open owner confirmation, so the shipped wording stays undocumented and its confirmation is lost.

Proposal Risk: 1/10 - Once the subplan records the line and its decision, the code carries no new risk, and the only residual is the wording the owner still has to confirm.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "record the rejection feed line in subplan 04's design decisions and feed-text list". In product/plans/complete/04-runscripts-topic-and-actions.md, rewrite only the Design decisions clause that says ensure() does not reject so the chain needs no catch of its own. It should say the chain can still reject after ensure() succeeds, when the enqueue inside runRunscriptNow in src/commands/execute.ts throws, and that the catch in src/plugins/runscript-topic-actions.ts writes the cause to stderr and then posts "Could not run runscript "<name>"." through postRunFailure, with that wording flagged for owner confirmation alongside the directory wording. Add that same line to the feed-text list in Proposed changes, after the execute entry. Leave every other sentence of subplan 04 unchanged, and do not edit the repair plan at product/plans/complete/runscripts-execute-rejection-feed.md, which stays the record of the wording decision. Verification: diff the edited plan so only those two places change, confirm the quoted wording matches the failed('run', name) helper in src/plugins/runscript-topic-actions.ts, and confirm the existing rejection case in src/plugins/runscript-topic-actions.test.ts still asserts the same text. No test covers plan prose, so the diff read is the check.
