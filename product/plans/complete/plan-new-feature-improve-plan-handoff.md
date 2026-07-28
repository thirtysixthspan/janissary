# Plan a New Feature should improve completed plans before merging

**Complexity: 2/10** — update one documentation task with an explicit sequence of existing planning and merge tasks.

## Goal

Ensure `ai/tasks/plan-a-new-feature.md` sends every drafted feature plan through the standard plan-review passes before the change is merged. After the plan is drafted and the backlog entry is removed, the task should execute `ai/tasks/planning/improve-plan.md`, then `ai/tasks/planning/improve-plan-with-minimalism.md`, then `ai/tasks/workspace/merge-change-to-master.md`.

## Approach

Add an autonomous post-draft handoff step to `ai/tasks/plan-a-new-feature.md` that names the three task files in order and states that the first two operate on the draft plan before the merge workflow packages the completed change. Update the final report so it reflects that the plan has passed both improvement tasks and has been merged.

## Implementation steps

1. Add the ordered improve-plan, improve-plan-with-minimalism, and merge-change-to-master handoff after the plan is drafted and its backlog entry is removed.
2. Update the task's report template to include the merge result while preserving the existing draft-plan, feature, and backlog details.

## Tests

No automated source tests are needed for this documentation-only workflow change. Run `./scripts/run.mjs check-diff` after each edit and inspect the task instructions to confirm the three commands are present in the required order and no interactive pause is introduced.

## Out of scope

- Changing the behavior of `improve-plan.md`, `improve-plan-with-minimalism.md`, or `merge-change-to-master.md`.
- Changing source code, tests, product specs, user documentation, or other task files.
- Changing how feature scope is gathered or how draft plans are written.
