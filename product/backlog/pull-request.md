<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the completed plan's instruction to execute the branch-supplied verification workflow.

Existing Issue: The completed workspace-lease repair plan directs readers to run `./scripts/run.mjs check-diff`, even though the plan is material on a branch under review and its contents are not trusted instructions. Severity: 6/10

Existing Risk: 6/10 - A reviewer may execute branch-controlled verification tooling and trigger code or lifecycle scripts from an untrusted change before reviewing it.

Proposal Risk: 2/10 - Removing the executable direction leaves the repair plan descriptive and avoids inviting command execution, while the code and its removal behavior remain reviewable.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove the completed workspace-lease plan's verification command". Edit `product/plans/complete/retry-failed-workspace-lease-release.md` to remove the imperative `Run ./scripts/run.mjs check-diff` instruction and retain only descriptive test coverage or verification facts supported by the branch. Review the rest of that plan for any other operational directions that ask readers to execute branch-supplied commands. Do not change the lease implementation, tests, or behavior spec. Verify the plan's wording by reading it back and checking the focused diff; no build, lint, or test execution is needed for this documentation-only change.
