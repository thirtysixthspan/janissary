<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Security: Remove the executable verification directive from the completed task-parameter plan.

Existing Issue: `product/plans/complete/preserve-agent-task-parameter-tail.md` still tells readers to run `./scripts/run.mjs check-diff` after each implementation step, leaving an operational instruction in completed pull-request content. Severity: 5/10

Existing Risk: 5/10 - A reader or automated reviewer may execute branch-supplied tooling instructions, causing untrusted scripts to run and violating the review's explicit no-tooling boundary.

Proposal Risk: 1/10 - Replacing the directive with a past-tense verification record leaves the completed plan descriptive and removes the prompt to execute code during review.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove the completed plan verification directive". In `product/plans/complete/preserve-agent-task-parameter-tail.md`, replace the imperative `Run ./scripts/run.mjs check-diff after each implementation step` in the Tests section with a past-tense record of verification only if supported by the plan's recorded history; otherwise describe the tests as expected coverage without a command. Review the completed plan for any other direct tool-execution instructions, preserving its goal, implementation scope, and out-of-scope statements. No application behavior changes, so no tests are needed.


* Security: Remove the executable verification command from the pull request description.

Existing Issue: The PR description's “How to verify” section directly tells readers to run `./scripts/run.mjs check-diff` against branch content. Severity: 5/10

Existing Risk: 5/10 - A reviewer treating the description as an instruction may execute untrusted branch tooling despite the review's no-tooling boundary.

Proposal Risk: 1/10 - Describing verification as completed results or expected checks without an imperative command removes this execution prompt while preserving the verification context.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove the PR description verification command". Revise the PR description's “How to verify” section to describe verification expectations without directing a reviewer to execute branch-supplied commands; retain the stated behavioral cases as descriptive coverage. Do not change application behavior. No tests apply to this wording-only change.
