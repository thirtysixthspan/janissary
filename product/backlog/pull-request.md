<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the completed plans' live verification commands to close the review-time security exposure.

Existing Issue: The completed plans `quote-aware-files-path-completion.md` and `quote-profile-file-navigator-labels.md` still directly instruct readers to run `check-diff` against the pull-request checkout. Severity: 6/10

Existing Risk: 5/10 - A reviewer or agent may follow the untrusted directives and execute tests or scripts from the pull-request branch.

Proposal Risk: 2/10 - Replacing the directives with historical verification records removes the direct execution prompts, though readers could still choose to run the named tools independently.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "remove active verification commands from completed plans". In `product/plans/complete/quote-aware-files-path-completion.md` and `product/plans/complete/quote-profile-file-navigator-labels.md`, replace the imperative `check-diff` directives with past-tense records of verification actually completed, preserving the plans' implementation and test history. Review both plans for any other active review-time command directives and confirm the remaining command references describe completed work rather than instructing readers to execute it.
