# Use the plan template in AI tasks that write plans

**Complexity: 2/10** — ~10 added lines across 5 task files, 6 requirements, 0 test scenarios (p=4.24)

## Goal

Several AI task playbooks tell the agent to write a plan "following the format of existing plans" in `./product/plans/complete/`, or "in the house shape of" one specific completed plan. That points the agent at a moving, historical example set instead of the canonical template that already owns plan structure. The goal is to make every task that develops a plan use `ai/guidelines/plan-template.md` as the single source of plan shape, so plans stay consistent with the one definition and don't inherit drift or omissions from older plans.

## Requirements

1. `ai/tasks/work-an-issue.md` Step 2 directs the plan author to `ai/guidelines/plan-template.md` instead of "the format of existing plans".
2. `ai/tasks/feature/work-pull-request-issue.md` Step 2 directs the plan author to `ai/guidelines/plan-template.md` instead of "the format of existing plans".
3. `ai/tasks/resolve-technical-debt.md` Step 2 directs the plan author to `ai/guidelines/plan-template.md` instead of "the format of existing plans".
4. `ai/tasks/fix-a-bug.md` Step 3 directs the plan author to `ai/guidelines/plan-template.md` instead of "the format of existing plans", while keeping its bug-specific content guidance (root cause, correct behavior, reproduction, regression test, Verification section).
5. `ai/tasks/feature/remove-an-existing-feature.md` Step 6 directs the plan author to `ai/guidelines/plan-template.md` instead of the "house shape" of a named completed plan, while keeping its removal-specific content guidance.
6. No task file that develops a plan still instructs the agent to copy the format or shape of an existing plan from `./product/plans/complete/`.

## Design decisions

- Reuse `ai/guidelines/plan-template.md` as the single owner of plan sections and their format and content, matching `ai/tasks/feature/plan-a-new-feature.md` and the planning tasks that already reference it. No new template or section list is introduced.
- Keep each task's domain-specific content guidance. The template owns structure; the task owns what its particular plan must say. Where a task's extra guidance names a section (the Verification section in `fix-a-bug.md` and `remove-an-existing-feature.md`), phrase it as content inside the template's section rather than as a competing section list.
- Change only the plan-shaping instruction text. The surrounding steps, file paths, complexity-rating steps, and report formats stay as they are.

## Assumptions

1. `ai/guidelines/plan-template.md` is the canonical owner of plan shape — `ai/guidelines/plan-template.md:3` states "This is the canonical statement of what a plan must contain. Every plan follows it."
2. Four tasks point at existing plans as the shape authority — `ai/tasks/work-an-issue.md:56`, `ai/tasks/feature/work-pull-request-issue.md:68`, `ai/tasks/resolve-technical-debt.md:96`, `ai/tasks/fix-a-bug.md:74`.
3. The removal task points at a single existing plan as the shape authority — `ai/tasks/feature/remove-an-existing-feature.md:146` ("in the house shape of `product/plans/complete/remove-gruvbox-dark-theme.md`").
4. A correct precedent for the new wording already exists — `ai/tasks/feature/plan-a-new-feature.md:77` ("Follow `ai/guidelines/plan-template.md` for the plan's sections and each section's format and content; that template is the single owner of plan shape, so do not work from a section list copied out of an older plan.").
5. These task files record agent instructions and are not covered by application unit tests; verification is by reading, per the template's manual-check form for changes that add no code.

## Existing functionality

1. The canonical plan template — `ai/guidelines/plan-template.md:3` owns every section and its format.
2. The plan-a-new-feature wording — `ai/tasks/feature/plan-a-new-feature.md:77` already directs agents to the template.
3. The planning tasks — `ai/tasks/planning/improve-plan.md:48`, `ai/tasks/planning/decompose-plan.md:57`, `ai/tasks/planning/improve-plan-with-minimalism.md:69` already treat the template as the single owner of plan shape.
4. The complexity-rating task — `ai/tasks/planning/rate-plan-complexity.md` records the `**Complexity: N/10**` line the template expects.

## Implementation steps

1. In `ai/tasks/work-an-issue.md` Step 2 item 3, replace the "following the format of existing plans in `./product/plans/complete/` — include a complexity rating, goal, approach, implementation steps, tests, and out-of-scope items" clause with an instruction to follow `ai/guidelines/plan-template.md` as the single owner of plan shape, using the wording pattern from `ai/tasks/feature/plan-a-new-feature.md:77`. Keep the `./product/plans/draft/<fix-name>.md` destination.
2. Make the same replacement in `ai/tasks/feature/work-pull-request-issue.md` Step 2 item 3 (`<fix-name>`), and in `ai/tasks/resolve-technical-debt.md` Step 2 item 3 (`<item-name>`).
3. In `ai/tasks/fix-a-bug.md` Step 3 item 4, replace the "following the format of existing plans in `./product/plans/complete/`" framing with the template reference. Keep the bug-specific content list (root cause, correct behavior from Step 2, reproduction from Step 1, approach, implementation steps, regression test, Verification section, out of scope) and the sentence about what the Verification section names. Phrase those as content the template's sections must carry, not as a competing section list.
4. In `ai/tasks/feature/remove-an-existing-feature.md` Step 6, replace "in the house shape of `product/plans/complete/remove-gruvbox-dark-theme.md`: ..." with the template reference. Keep the removal-specific content (scope decisions from Step 5, the dead-code baseline in Verification, and the live checks Step 9 will make) as content requirements.
5. Re-read all five edited paragraphs and confirm none still asks the agent to copy the format or shape of a plan in `./product/plans/complete/`. Leave all other text in each file unchanged.

## UI design

None. This change edits AI task instruction files only; it adds or changes no user interface.

## Tests

No application tests are introduced. These files are agent instructions, and the plan template states that tests of documentation should not be introduced. Verification is the reading-based check in Verification below.

## Out of scope

- Changing `ai/guidelines/plan-template.md` itself, including its section names or any inconsistency within it.
- Updating tasks that already reference the template (`plan-a-new-feature.md`, `decompose-plan.md`, `improve-plan.md`, `improve-plan-with-minimalism.md`, `rate-plan-complexity.md`).
- Editing completed plans or changing the format of any plan already written.
- Changing any application source code, tests, specs, help, or user documentation.

## Verification

`$janissary/scripts/run.mjs check-diff` first. Then read the five edited paragraphs in `ai/tasks/work-an-issue.md:56`, `ai/tasks/feature/work-pull-request-issue.md:68`, `ai/tasks/resolve-technical-debt.md:96`, `ai/tasks/fix-a-bug.md:74`, and `ai/tasks/feature/remove-an-existing-feature.md:146`: each must name `ai/guidelines/plan-template.md` as the authority for plan sections and format, and none may tell the agent to follow the format, shape, or example of a plan in `./product/plans/complete/`. A miss is any surviving "format of existing plans" or "house shape of" instruction, or loss of a task's domain-specific content guidance.
