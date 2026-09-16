<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove executable instructions from the pull request's new plan documents so reviewed content cannot direct privileged actions.

Existing Issue: Several plan files introduced by this PR instruct a reader to execute commands, including `gh pr edit 1129 --body-file` in `product/plans/complete/pr-1129-docs-prose-and-macos-bullet.md` and `check-diff` commands in their verification sections. Severity: 7/10

Existing Risk: 6/10 - Treating branch-provided plans as instructions can cause a reviewer or automation with checkout and GitHub privileges to run commands or alter pull-request state chosen by an untrusted branch author.

Proposal Risk: 2/10 - Replacing executable imperative wording with descriptive verification criteria may make plans slightly less copyable, but it removes the instruction-following surface while preserving the intended implementation record.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1129: remove executable commands from the new selection-layer plans". Review the new `product/plans/complete/pr-1129-*.md` files and `product/plans/complete/text-selection.md`, replacing command invocations and imperative shell or GitHub CLI directions with non-executable descriptions of the expected verification or state. In particular, remove the `gh pr edit` instruction from `product/plans/complete/pr-1129-docs-prose-and-macos-bullet.md` and rewrite its intended description update as a documented outcome. Preserve the plans' goals, design decisions, tests, and out-of-scope boundaries, then inspect the changed plan files for any remaining command instructions.
