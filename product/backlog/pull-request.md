<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's false backlog-alignment claim, which the recorded fix plan still has not removed from GitHub.

Existing Issue: The description still asserts the feature aligns with the first ready item in the features backlog, which actually asks for an unrelated plan-template Lifecycle matrix, despite a promoted fix plan whose only repair was to delete that sentence. Severity: 5/10

Existing Risk: 5/10 - A reader trusts the stated provenance and cannot verify it, and the promoted fix plan gives the false impression the correction was already applied.

Proposal Risk: 2/10 - Once the sentence is removed the description agrees with the repository, and the surviving provenance sentence already states the feature was supplied at invocation with its goal settled by the user.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2178 "correct the description's false backlog-alignment claim". Read the current body with `gh pr view 2178 --json body` and the completed fix plan at product/plans/complete/correct-pr-2178-description-backlog-alignment-claim.md, then use `gh pr edit --body-file` on a scratch body that deletes only "It aligns with the first `## ready` item in `product/backlog/features.md`, whose text is the feature description." and keeps the preceding provenance sentence and every other paragraph byte-for-byte unchanged. Confirm first in product/backlog/features.md that its first ready item requests a Lifecycle matrix in ai/guidelines/plan-template.md rather than user documentation, so the claim is demonstrably false. Apply the edit only after the branch is pushed, leave the title and all other paragraphs alone, and do not merge or close the pull request. Verify with `gh pr view 2178 --json body` that the sentence is gone, the surrounding paragraphs are unchanged, and the pull request is still OPEN with headRefOid matching HEAD. The work item need not be re-added to the branch backlog; it was already drained when the fix plan was promoted.


* Correct the promoted plan's false backlog-alignment claim, which the description-repair fix plan left in the plan's Goal.

Existing Issue: The promoted plan's Goal still asserts alignment with the first ready item in the features backlog, whose text actually requests an unrelated plan-template Lifecycle matrix, so a completed plan in this change set carries a false provenance claim. Severity: 4/10

Existing Risk: 3/10 - A reader of the completed plan relies on its stated provenance to judge why the feature exists, and the false alignment cannot be verified against the backlog.

Proposal Risk: 2/10 - Removing the single sentence leaves the accurate provenance sentence intact and changes no requirement, design decision, assumption, implementation step, or verification line in the plan.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2178 "remove the promoted plan's false backlog-alignment claim". Open product/plans/complete/user-documentation.md and delete only the sentence "It aligns with the first `## ready` item in `product/backlog/features.md`, whose text is the feature description." from the Goal paragraph, keeping the preceding sentence that the feature was supplied at invocation without a matching backlog entry and that the user settled its goal, and leave every requirement, design decision, assumption, implementation step, and verification line byte-for-byte unchanged. Confirm against product/backlog/features.md that the first ready item requests a Lifecycle matrix in ai/guidelines/plan-template.md rather than user documentation, so the deleted claim is demonstrably false. Run `$janissary/scripts/run.mjs check-diff` for the prose-only change, commit, and push to the existing head branch, leaving the pull request open. Verify by re-reading the Goal that no backlog-alignment claim remains and that the rest of the plan is byte-for-byte unchanged.
