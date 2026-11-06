# Move a complex feature's source plan to complete in its first commit

**Complexity: 2/10** — three steps of one orchestration playbook, two spec paragraphs, and pin tests. No runtime surface.

## Goal

`ai/tasks/feature/build-a-complex-feature.md` publishes its subplans in the pull request's first commit but leaves the original source plan in `./product/plans/ready/` until every subplan is delivered (Step 7). `ai/tasks/feature/update-pull-request.md` finds a pull request's own plan as the one plan its first commit adds to or moves into `./product/plans/complete/`. The complex workflow's first commit adds none there, so the update cannot find the canonical plan, and Step 9 has to override the update task's plan discovery and selection.

Move the source plan from `ready/` to `complete/` in the same commit that publishes the subplans, so the update task identifies it the normal way.

## Decisions

- Step 2's publication commit stages the initial subplan plans and the move of the source plan from `./product/plans/ready/` to `./product/plans/complete/`, and nothing else. A `git mv` records the move. The first commit then adds exactly one plan under `complete/`: the subplans sit in `draft/`.
- Step 7 no longer moves the source plan. Once every requirement is delivered, the orchestrator confirms the source plan is still in `complete/` and continues; the canonical-record wording stays.
- Step 9 drops its plan discovery and selection override. The update task's own Step 3 discovery now finds the source plan from the first commit. The orchestrator confirms the plan the update identified is the source plan recorded in Step 0, and stops if it is not. Every completed subplan plan is an added plan under `complete/` other than the own plan, so the update task folds it in and removes it exactly as it does a fix plan; Step 9 says so explicitly.
- `update-pull-request.md` is unchanged. Its discovery and folding rules already handle this shape.

## Implementation steps

1. `ai/tasks/feature/build-a-complex-feature.md`:
   - Step 2 item 1: commit the initial subplans together with the move of the source plan into `complete/`; stage only those.
   - Step 7 final paragraph: replace the move-and-commit with a confirmation that the source plan is already in `complete/`.
   - Step 9: replace the discovery override with the confirmation and the subplan folding statement.
2. `product/specs/pull-request-review.md`, `### Staged reviews for complex features`: say the original feature plan moves to the completed plans in the same commit that publishes the subplans.
3. `product/specs/pull-request-updating.md`, `### One plan per pull request`: say a complex feature's subplan plans are folded in and removed the same way as fix plans.
4. Tests (see below).

## Tests

- `scripts/build-a-complex-feature-source-plan.test.mjs`, a new pin test in the style of `scripts/build-a-complex-feature-playbook.test.mjs`:
  - Step 2 moves the source plan into `./product/plans/complete/` in the same commit as the initial subplans.
  - Step 7 no longer moves the source plan from `ready/` to `complete/`.
  - Step 9 no longer overrides the update task's plan discovery, and confirms the identified plan is the recorded source plan.
- `scripts/update-pull-request-playbook.test.mjs`: replace the override assertion with one pinning that Step 9 names the update task's plan discovery and plan-update steps by their current numbers.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff`.

Manual: read Steps 2, 7, and 9 and confirm the first commit carries the subplans and the source plan move, and that `update-pull-request.md` Step 3 would identify the source plan as the own plan.

## Out of scope

- Changes to `update-pull-request.md`, `review-pull-request.md`, `build-a-feature.md`, or other child tasks.
- `help/` and `documentation/user-documentation/`. Neither describes the complex-feature workflow.
