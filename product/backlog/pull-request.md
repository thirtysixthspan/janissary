<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the PR description's claim that aggregate schedule rows and owner actions remain future work.

Existing Issue: The PR body says the aggregate schedules plugin's owner-aware rows and actions remain future work, but commit `555d79a1` adds system rows, keyed deletion, system-shell focus, and cross-owner clear to that plugin. Severity: 3/10

Existing Risk: 3/10 - Readers may incorrectly treat delivered aggregate integration as an outstanding scope item or miss that the PR has implemented more than its description currently claims.

Proposal Risk: 1/10 - The body will accurately distinguish the delivered aggregate integration from the still-pending dialog and broader browser verification work.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "correct the PR description's aggregate schedules delivery status". Update only the paragraph in the PR body that says aggregate schedules plugin integration remains future work, stating that commit `555d79a1` delivers owner-aware aggregate rows, keyed system deletion, managed-shell focus, and cross-owner clear. Preserve the remaining planned dialog and browser E2E scope and all unrelated body text. Verify with `gh pr view 1729 --json body,headRefOid,state` that the revised description retains unrelated paragraphs, the head remains on `feature/system-schedules`, and the PR stays open.
