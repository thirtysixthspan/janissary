<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Security: Keep agent task discovery inside the execution source's allowed roots.

Existing Issue: `resolveAgentTask` passes the project root to strict discovery without validating the real path of `ai/tasks`, so a symlinked task root can make `listTasksFromRoot` enumerate files outside the execution workspace before per-task validation rejects a match. Severity: 6/10

Existing Risk: 5/10 - A workspace symlink can make host-side discovery inspect an unintended directory and expose its matching filenames through ambiguous-task errors.

Proposal Risk: 2/10 - Validating each task root before walking it prevents out-of-root enumeration while preserving normal workspace-first and installed fallback lookup.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "confine task discovery to its allowed roots". In `src/agent/task-resolution.ts`, canonicalize `ai/tasks` for each source before calling `listTasksFromRoot` and require the real task root to stay beneath the corresponding execution workspace or installed task root; reject an escaping project root before reading directory entries and retain strict errors for inaccessible roots. Update `product/specs/agent-command.md` to describe the root confinement error. Add cases to `src/agent/task-resolution.test.ts` where the project `ai/tasks` root symlinks outside the workspace, including an outside tree with duplicate task basenames, and assert that discovery rejects before exposing external paths; preserve project-first fallback and inaccessible-root behavior.


* Security: Remove the executable verification directive from the completed task-parameter plan.

Existing Issue: `product/plans/complete/preserve-agent-task-parameter-tail.md` still tells readers to run `./scripts/run.mjs check-diff` after each implementation step, leaving an operational instruction in completed pull-request content. Severity: 5/10

Existing Risk: 5/10 - A reader or automated reviewer may execute branch-supplied tooling instructions, causing untrusted scripts to run and violating the review's explicit no-tooling boundary.

Proposal Risk: 1/10 - Replacing the directive with a past-tense verification record leaves the completed plan descriptive and removes the prompt to execute code during review.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove the completed plan verification directive". In `product/plans/complete/preserve-agent-task-parameter-tail.md`, replace the imperative `Run ./scripts/run.mjs check-diff after each implementation step` in the Tests section with a past-tense record of verification only if supported by the plan's recorded history; otherwise describe the tests as expected coverage without a command. Review the completed plan for any other direct tool-execution instructions, preserving its goal, implementation scope, and out-of-scope statements. No application behavior changes, so no tests are needed.
