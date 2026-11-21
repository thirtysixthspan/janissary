# Consolidate the plan-complexity rating into one task

**Complexity: 1/10** — 0 added lines, 0 files, 4 requirements (p=2.71).

## Goal

Leave a single plan-complexity rating task, `ai/tasks/planning/rate-plan-complexity.md`, that rates by the fixed counting formula. Delete the judgment-based task, move the formula-based task onto the canonical file name, and update every reference so callers, the functional spec, and the public docs describe one rating task.

## Design decisions

- The judgment task is removed outright; its calibration-by-judgment band table does not move with the formula task. The formula task's thresholds already encode the same spread, so the scale stays continuous and callers keep reading the same `**Complexity: N/10** — <rationale>` line.
- The formula task keeps its method, five questions, formula, thresholds, report shape, and both skip steps (`Step 0 — Prepare the workspace`, `Step 1 — Pick the plan`). Only its path and the prose that names the deleted sibling change.
- Every caller already points at the formula task; they need only the path string replaced in place. No caller's surrounding wording changes.
- `product/specs/task-picker.md` and `documentation/user-documentation/command-bar/tasks.md` currently describe two rating tasks. They become descriptions of the single task.
- Historical completed plans and `ai/guidelines/plan-template.md` are records of past work, not references to the task file, and stay untouched.

## What already exists (reuse, don't rebuild)

| Concern | Where it already lives |
| --- | --- |
| The judgment task to delete | `ai/tasks/planning/rate-plan-complexity.md` |
| The formula task to rename | `ai/tasks/planning/rate-plan-complexity-quantitative.md` |
| Eight caller references to the old filename | `ai/tasks/work-an-issue.md`, `ai/tasks/fix-a-bug.md`, `ai/tasks/resolve-technical-debt.md`, `ai/tasks/feature/work-pull-request-issue.md`, `ai/tasks/feature/remove-an-existing-feature.md`, `ai/tasks/planning/improve-plan.md`, `ai/tasks/planning/improve-plan-with-minimalism.md`, `ai/tasks/planning/decompose-plan.md` |
| The functional spec describing both tasks | `product/specs/task-picker.md`, "Rating a plan's complexity" and "Rating a plan's complexity by formula" |
| The public docs describing both tasks | `documentation/user-documentation/command-bar/tasks.md`, lines 67 and 82 |
| The backlog entry that records this issue | `product/backlog/issues.md`, `## ready` |

## Implementation steps

1. Delete `ai/tasks/planning/rate-plan-complexity.md`.
2. Move `ai/tasks/planning/rate-plan-complexity-quantitative.md` to `ai/tasks/planning/rate-plan-complexity.md` with `git mv` (the file is tracked), then rewrite the paragraph that calls it "the quantitative sibling" of the now-deleted task and the sentence reserving a 10 for that task, so the file describes itself as the single rating task.
3. In each of the eight caller task files, replace `ai/tasks/planning/rate-plan-complexity-quantitative.md` with `ai/tasks/planning/rate-plan-complexity.md`, leaving all other wording as it is.
4. Replace the two spec sections in `product/specs/task-picker.md` with one "Rating a plan's complexity" section describing the single formula task, its name, its caller behavior, and that it owns the rating scale.
5. Update `documentation/user-documentation/command-bar/tasks.md` lines 67 and 82 so only `rate-plan-complexity` is offered as the rating task and its formula behavior is described.
6. Remove the fixed issue's line from `product/backlog/issues.md`.

## Tests

No application source, tests, or configuration change, so no new unit tests are introduced. Conformance is checked by a repository-wide search for the old filename and by the reading checks in Verification, following the precedent of other docs-only plans.

## Out of scope

- No change to the formula, its five questions, its thresholds, its report shape, or the `**Complexity: N/10**` line format.
- No change to caller wording other than the filename path.
- No change to completed plans, `ai/guidelines/plan-template.md`, `product/backlog/technical-debt.md`, or any help page.
- No code, spec, or documentation added for behavior that was not already documented.

## Verification

- `$janissary/scripts/run.mjs check-diff` after each step.
- A repository-wide search for `rate-plan-complexity-quantitative` returns no hits outside historical completed plans and the issue line before it is removed.
- A repository-wide search for `rate-plan-complexity.md` resolves only to the single moved task file and to caller/spec/doc references that now point at it.
- Read the moved task file end to end and confirm it no longer names a sibling or a judgment task.
- Read the revised spec section and both doc lines and confirm they describe one rating task whose name is `rate-plan-complexity`.
- `git status --short` shows only the deleted task, the renamed task, the eight caller tasks, the spec, the doc page, the issues file, and this plan.
