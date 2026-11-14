<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's list of updated documentation so it also names the two user-documentation pages the branch changes. (Description-only: this proposal changes only the PR description.)

Existing Issue: The description's closing inventory names the updated specs and help pages but not `documentation/user-documentation/tab-types/roles.md` and `documentation/user-documentation/advanced-agents/acp-agent.md`, which the diff also edits to describe the new ask capability, the thirteen-command vocabulary, and where a granted `file glob` runs. Severity: 2/10

Existing Risk: 2/10 - A reviewer who uses the inventory as the list of docs to check skips the two user-facing pages, so a wording error there ships unreviewed.

Proposal Risk: 1/10 - Only the description changes; the remaining risk is the inventory drifting again if a later repair touches another page, which comparing it with `git diff origin/master...HEAD --name-status` would show.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "name the two updated user-documentation pages in the PR description". Change only the pull request description: read it with `gh pr view 2001 --json body`, and in the paragraph that begins `The plan is product/plans/complete/file-glob.md.`, after the `Help updated:` sentence, add `User documentation updated: tab-types/roles.md and advanced-agents/acp-agent.md.` Leave every other paragraph byte-for-byte unchanged, add no change-set statistics, and apply the body with `gh pr edit --body-file` after the push. No code, test, spec, help, or documentation file changes, so no test run is needed.
