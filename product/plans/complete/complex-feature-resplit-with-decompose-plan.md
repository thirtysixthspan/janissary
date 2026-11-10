# Split oversized complex-feature subplans with decompose-plan

**Complexity: 2/10** — ~5 changed playbook lines in 1 file, 4 requirements, 3 scenarios (p=3.91).

`ai/tasks/feature/build-a-complex-feature.md` Step 1 hands the initial decomposition to `ai/tasks/planning/decompose-plan.md`, but Step 3 still splits a subplan by hand when improvement finds it cannot stay below 6. That split has no rules of its own: it doesn't rate the pieces with the quantitative rating task, doesn't say where they go, and doesn't check coverage. The orchestration rules and the job paragraph also describe decomposition without naming the task that does it.

## Goal

Every decomposition in the complex-feature workflow runs through `decompose-plan.md`: the initial split of a source plan rated 6–10, and the re-split of a subplan that improvement pushes to 6 or higher. The single-plan route for plans rated 1–5 still skips decomposition.

## Approach

- **Job paragraph.** Say plans rated 6–10 are decomposed with `decompose-plan.md`.
- **Orchestration rules.** The 6–10 rule names `decompose-plan.md` for the initial decomposition and for splitting a subplan rated 6 or higher again.
- **Step 3 re-split.** When improvement finds a subplan cannot stay below 6, delegate the split to a fresh subagent that opens `decompose-plan.md` and executes every step in order, except `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`, with that subplan's draft path as the target. The task writes the pieces to `./product/plans/draft/`, rates each 1–5, and moves the oversized subplan to `./product/plans/complete/`, where Step 9's update later folds it into the canonical plan like any other completed subplan. The orchestrator applies Step 1's acceptance check to the pieces, puts them in the subplan order in place of the oversized subplan, publishes the pieces and the move to the existing PR, and improves each new plan the same way before implementation, with its exact draft path and the same Step 0 skip.

## Implementation steps

1. Edit the job paragraph, the 6–10 orchestration rule, and the Step 3 re-split sentence in `ai/tasks/feature/build-a-complex-feature.md`.
2. Add assertions to `scripts/build-a-complex-feature-subplan-rating.test.mjs`.
3. Update `product/specs/pull-request-review.md` ("Staged reviews for complex features") and the "Decomposing a plan" paragraph in `product/specs/task-picker.md` to say the workflow also uses the decomposition task to split a subplan that improvement rates 6 or higher.

## Tests

`scripts/build-a-complex-feature-subplan-rating.test.mjs`:

- Step 3 delegates a re-split to `decompose-plan.md`, skipping its Step 0 and Step 1, with the oversized subplan as the target.
- Step 3 applies Step 1's acceptance check to the pieces.
- The orchestration rules name `decompose-plan.md` for splitting a subplan rated 6 or higher.
- The existing Step 3 cap assertions and the split-off improvement wording in `scripts/build-a-complex-feature-playbook.test.mjs` still pass.

## Verification

`$janissary/scripts/run.mjs check-diff` passes. Reading Step 3 shows a re-split that runs through `decompose-plan.md`, with no hand-written split rules left.

## Out of scope

- Any change to `decompose-plan.md`, `improve-plan.md`, or the rating tasks.
- The single-plan route, which still does not decompose a plan rated 1–5.
- Step 7's coverage-gap subplans, which add missing work rather than split a plan.
- User documentation, which does not describe planning tasks.
