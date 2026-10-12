<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Preserve strict project-first task discovery when the project task root cannot be accessed.

Existing Issue: `listOne` returns an empty list when `existsSync` cannot access `ai/tasks`, even in strict mode, so a bare task lookup can continue to the installed source instead of failing on an unreadable project tree. Severity: 5/10

Existing Risk: 5/10 - A project task hidden by an access failure can be silently replaced by an installed task with the same basename, causing the agent to execute instructions other than the caller's project task.

Proposal Risk: 2/10 - Distinguishing a genuinely absent task root from an inaccessible one preserves legitimate installed fallback while making an uncertain project lookup fail closed.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "fail strict task discovery on inaccessible roots". In `src/tasks.ts`, change strict root handling so an absent `ai/tasks` directory still yields no rows but filesystem access errors propagate instead of being collapsed by `existsSync`; keep tolerant `listTasks` behavior unchanged. Add coverage in `src/tasks.test.ts` for strict discovery of an inaccessible root, and in `src/agent/task-resolution.test.ts` verify that a project-root access error prevents installed fallback even when the installed tree contains a matching task. Preserve the existing test that a valid project match does not walk an invalid, unneeded installed root.
