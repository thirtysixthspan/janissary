# Fail strict task discovery on inaccessible roots

**Complexity: 3/10** — The fix is limited to strict task-root probing, focused discovery and resolution tests, and one behavior-spec clarification.

## Goal

Keep strict agent task lookup from treating an inaccessible project task root as absent and silently falling back to an installed task.

## Approach

Keep tolerant task-picker discovery unchanged. In strict discovery, distinguish an absent `ai/tasks` path from filesystem errors by probing it with `statSync`, returning an empty list only for `ENOENT` and propagating other errors. The resolver already searches project tasks before installed tasks and stops when strict discovery throws.

## Implementation steps

1. Update `src/tasks.ts` so strict root probing returns no rows only when the root is absent; keep tolerant `listTasks` behavior unchanged.
2. Add coverage in `src/tasks.test.ts` for a project task root made inaccessible by an invalid parent path, asserting strict discovery throws while tolerant discovery remains empty. Add a resolution test in `src/agent/task-resolution.test.ts` proving a matching installed task is not used after project-root discovery fails, while preserving the existing test that a valid project match avoids walking an invalid installed root.
3. Clarify `product/specs/agent-command.md` that an absent root has no matches, while errors reading a strict source fail resolution before fallback.

## Tests

- Strict discovery of an absent task root returns no rows.
- Strict discovery propagates a task-root access error, while tolerant picker discovery remains empty.
- A project-root access error prevents installed fallback even when installation contains the requested basename.
- A valid project match still resolves without walking an invalid installed root.

## Out of scope

Do not change task-picker ordering or display, task path validation, skill resolution, installed fallback behavior after a valid project miss, or PR description.
