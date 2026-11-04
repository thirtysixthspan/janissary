<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's stale head count, paging text, and connections-tab spec link after the final resize fix.

Existing Issue: The body says the branch carries 89 commits from `139aaf43` while the head already carries 90, its record-history paragraph and verification step do not name the viewport-resize trigger the final commit adds, and its connections-tab spec link predates the resize wording. Severity: 4/10

Existing Risk: 3/10 - A reviewer or verifier follows the body and its pinned spec and misses the resize path, while the count mismatch undermines the body's "as of this head" claim.

Proposal Risk: 1/10 - The body and its spec link will match the final head, with only the ordinary risk that a later commit makes the re-measured counts stale again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "refresh the PR body's head count, resize-paging text, and connections-tab spec link". In the pull request body, re-measure `git rev-list --count 139aaf43..HEAD` and `git diff --shortstat 139aaf43...HEAD` after the fix's own bookkeeping commit is pushed and replace the "As of this head" counts; the head before this review's backlog commit already carries 90 commits and 288 changed files, and the fix commit will advance both again. Add to the record-tab paragraph and the "Record history and paging" verification step that resizing a shorter viewport taller so the loaded history fits triggers the same automatic older-block loading, while a record with enough blocks still requires the top-scroll check. Repoint the `product/specs/connections-tab.md` link in "Specs, docs, and tests" from `73bbc4c6` to `8a099153` so the linked spec includes the resize sentence, leaving the ACP-records spec, subplan pins, manual acceptance table, M7 blocked row, and every other paragraph unchanged. Re-read the body from GitHub and confirm the PR remains open at the pushed head. Do not change code, specs, plans, or other backlog entries.
