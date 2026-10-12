# Preserve project-first agent task lookup

**Complexity: 3/10** — The change is limited to task-source discovery, its resolver tests, and one behavior-spec clarification.

## Goal

Keep a project task resolvable when the installed task tree cannot be walked, while still surfacing an error when the installed tree must be searched as fallback.

## Approach

Expose strict discovery for one task root while retaining `listTasks` as the tolerant two-root task-picker API. Resolve bare agent task names against the project source first. Only after a project miss, walk the installed source strictly. Preserve recursive matching, ambiguity errors within the chosen source, path validation, and the task picker's existing tolerant behavior.

## Implementation steps

1. `src/tasks.ts` provides source-specific task listing, and `src/agent/task-resolution.ts` performs each strict walk only when that source is selected.
2. Behavior tests cover project matches despite an invalid installed task root and invalid-root reporting during installed fallback, alongside recursive, ambiguity, and fallback cases.
3. `product/specs/agent-command.md` specifies project-first discovery and strict installed discovery only when fallback is needed.

## Tests

- Project task resolves when the installed `ai/tasks` path is not a directory.
- An installed fallback reports a strict discovery error when its task root is not a directory.
- Existing recursive project-first lookup, source-local ambiguity, installed fallback, and task-picker tolerance tests continue to pass.

## Out of scope

Do not change the separate skill-confinement finding, explicit task-path behavior, task-picker ordering or display, or PR description.
