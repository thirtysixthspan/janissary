# Decompose every plan regardless of rating, without rating the source plan

**Complexity: 2/10** — ~6 changed playbook lines in 1 file, 3 requirements, 4 scenarios (p=3.87).

`ai/tasks/planning/decompose-plan.md` currently rates an unrated source plan with the quantitative rating task, then stops without splitting any plan rated 1–5. Decomposition should apply to every plan it is given, and the source plan should never be rated by this task.

## Goal

The task decomposes every plan into two or more subplans whatever its rating, and never adds or changes the source plan's complexity line.

## Approach

1. Say in the job paragraph that every plan is decomposed, rated or not.
2. Remove Step 2's source-plan rating item and its 1–5 stop. Retitle Step 2 to reading the plan and the code it touches, and renumber its items.
3. Change Forbidden item 3 to forbid editing or rating the source plan, including adding a missing complexity line, and item 4 to forbid skipping decomposition because of the rating.
4. Require two or more subplans in Step 3.
5. Drop the mention of an added complexity line from the Step 5 `git status` check, limit early stops to Step 1, and let the report show an unrated source plan.
6. Update the "Decomposing a plan" section of `product/specs/task-picker.md`.

## Tests

`scripts/decompose-plan-playbook.test.mjs`:

- The task decomposes every plan whatever its rating, has no "needs no decomposition" exit, and requires two or more subplans.
- The task forbids rating the source plan, and Step 2 does not open the rating task.

The existing subplan-rating assertions stay.

## Out of scope

- `build-a-complex-feature.md`, which still keeps plans rated 1–5 intact and only calls this task for plans rated 6–10.
- How subplans are rated.
