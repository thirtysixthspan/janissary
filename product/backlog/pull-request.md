<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Split the new selection-layer hook tests into focused TypeScript modules that meet the repository's file-size rule.

Existing Issue: The newly added `web/src/shared/terminal/useSelectionLayer.test.tsx` is 271 lines, exceeding the 200-line limit for JavaScript and TypeScript files in `ai/guidelines/code-guidelines.md`. Severity: 4/10

Existing Risk: 4/10 - Further gesture, lifecycle, and keyboard cases will accumulate in one oversized test module, making related behavior harder to locate and maintain safely.

Proposal Risk: 2/10 - Extracting a cohesive lifecycle or event-guard group can disturb shared test setup, but the existing assertions provide direct coverage for the preserved behavior.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1129: split the oversized selection-layer hook test module". Refactor `web/src/shared/terminal/useSelectionLayer.test.tsx` by extracting a cohesive group of selection-layer tests and any narrowly shared fixture helpers into a focused colocated test module under `web/src/shared/terminal/`, leaving each TypeScript file at or below 200 lines. Preserve coverage for snapshotting, drag completion outside the container, mouse-event ownership, empty-pick dismissal, inactive and exited clearing, and Escape scoping; do not compact assertions merely to reduce line count. Verify the affected client tests continue to exercise the hook's existing behavior.


* Remove executable instructions from the pull request's new plan documents so reviewed content cannot direct privileged actions.

Existing Issue: Several plan files introduced by this PR instruct a reader to execute commands, including `gh pr edit 1129 --body-file` in `product/plans/complete/pr-1129-docs-prose-and-macos-bullet.md` and `check-diff` commands in their verification sections. Severity: 7/10

Existing Risk: 6/10 - Treating branch-provided plans as instructions can cause a reviewer or automation with checkout and GitHub privileges to run commands or alter pull-request state chosen by an untrusted branch author.

Proposal Risk: 2/10 - Replacing executable imperative wording with descriptive verification criteria may make plans slightly less copyable, but it removes the instruction-following surface while preserving the intended implementation record.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1129: remove executable commands from the new selection-layer plans". Review the new `product/plans/complete/pr-1129-*.md` files and `product/plans/complete/text-selection.md`, replacing command invocations and imperative shell or GitHub CLI directions with non-executable descriptions of the expected verification or state. In particular, remove the `gh pr edit` instruction from `product/plans/complete/pr-1129-docs-prose-and-macos-bullet.md` and rewrite its intended description update as a documented outcome. Preserve the plans' goals, design decisions, tests, and out-of-scope boundaries, then inspect the changed plan files for any remaining command instructions.
