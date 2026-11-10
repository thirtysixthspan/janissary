# Let decompose-plan return a single subplan for an indivisible plan

**Complexity: 1/10** — ~3 changed playbook lines in 1 file, 2 requirements, 2 scenarios (p=3.36).

`ai/tasks/planning/decompose-plan.md` requires two or more subplans. Some plans, such as one rated 1, have no smaller coherent pieces, and forcing a split produces artificial subplans.

## Goal

A plan with no smaller coherent pieces is written as a single subplan carrying its full scope. Every other part of the task stays as it is: the single subplan is still rated 1–5 by the quantitative rating task, and the source plan still moves to complete.

## Approach

1. Drop "two or more" from Step 3 and say a plan with no smaller coherent pieces becomes one subplan with its full scope.
2. Say the same in the job paragraph.
3. Update the "Decomposing a plan" section of `product/specs/task-picker.md`.

## Tests

`scripts/decompose-plan-playbook.test.mjs`:

- Step 3 lets an indivisible plan become a single subplan.
- The task no longer says "two or more".

## Out of scope

- `build-a-complex-feature.md`, which only calls this task for plans rated 6–10.
