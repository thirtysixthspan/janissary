# PR 1729: scope repair-plan workflow instructions to authorized implementation runs

**Complexity: 1/10** — replace unconditional workflow commands in the completed plan with task-scoped implementation guidance.

## Goal

Keep the cleared-runscript behavior plan useful while making clear that checks, backlog cleanup, and publication happen only when authorized by the active task.

## Approach

Rewrite the workflow step in the completed PR 1729 plan so its imperative instructions are conditional on the active task's constraints. Preserve the existing behavior acceptance criteria. Confirm the scheduling spec and dialog test still cover the intended behavior.

## Implementation steps

1. Update only the workflow wording in `product/plans/complete/pr-1729-persist-cleared-runscript-selection.md`.
2. Remove the selected PR backlog entry and restore its comment-and-heading skeleton because no entries remain.
3. Verify the updated plan no longer instructs a reviewer to run checks, alter the backlog, or publish unconditionally.

## Tests

- Confirm `product/specs/scheduling.md` still specifies that a removed runscript remains unselected after refresh and dialog reopen.
- Confirm `web/src/ScheduleLaunchDialog/ScheduleDialog.test.tsx` still covers clearing, reappearance, disabled submission, and reopening.
- Run the docs-only `./scripts/run.mjs check-diff` required by the active work task.

## Out of scope

- Changes to scheduling behavior, implementation, tests, or specs.
- Changes to the pull request description or any other backlog entry.
- Any check, backlog operation, or publication not authorized by the active task.
