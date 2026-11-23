# Keep documentation out of plan-a-new-feature plans and questions

**Complexity: 2/10** — ~6 added playbook lines in 1 file, 8 requirements, no code or test scenarios (p=3.85)

## Goal

`ai/tasks/feature/plan-a-new-feature.md` asks the user how to record documentation work whenever a feature changes something they see. Its final checklist then checks that a documentation follow-up was written into the plan. So every user-visible feature costs the user an extra question, and every plan carries a documentation note, though documentation is owned by a separate task. The playbook should stop asking about user and developer documentation. It should keep documentation work out of a plan unless documentation is what the feature is about.

## Requirements

1. The issue says "Do not ask the user related to user and developer documentation documentation." Phase 1's question categories no longer include a documentation category.
2. The issue says "Do not ask the user related to user and developer documentation documentation." The playbook states that no phase asks the user about user or developer documentation.
3. The issue says "user and developer documentation should not be part of a plan unless it is the primary focus of the plan." The playbook states that a plan names no user or developer documentation work.
4. The issue says "unless it is the primary focus of the plan." The playbook states that when documentation is the feature's primary focus, the plan names its documentation pages as ordinary scope.
5. The issue says "should not be part of a plan." The final 2h checklist no longer requires a documentation follow-up candidate in the plan. It checks instead that the plan names no documentation work unless documentation is the feature's primary focus.
6. The issue says "Do not ask the user related to user and developer documentation documentation." A documentation follow-up candidate that `improve-plan.md` reports under `Open` is not carried into the 2h question phase.
7. The issue says "unless it is the primary focus of the plan." For a feature whose primary focus is documentation, `improve-plan.md`'s rule against naming documentation pages does not strip those pages from this plan.
8. Architecture principle 10 says a behavior change updates its spec. `product/specs/task-picker.md` describes the new rule in its planning paragraph.

## Design decisions

- The rule lives in one "Documentation scope" paragraph near the top of `plan-a-new-feature.md`, the shape `build-a-feature.md` and `work-pull-request-issue.md` already use. Each step that touched documentation points at the rule rather than restating it (assumption 4).
- The primary-focus exception is judged from the feature text: a feature whose title and description are about adding or updating user or developer documentation. This mirrors how `review-pull-request.md` decides a pull request is a documentation pull request (assumption 5).
- `improve-plan.md` is not edited. The exception for documentation-focused features is stated in `plan-a-new-feature.md`'s 2g instructions, so the change stays inside the playbook the issue names (assumption 3).
- Specs and `help/` pages are not documentation in this rule. A plan may still name the spec and help pages it touches, as `improve-plan.md` rule 5 already allows (assumption 3).

## Preserved behavior

None found

## Assumptions

1. `ai/tasks/feature/plan-a-new-feature.md:108` holds the documentation question category: "**Scope boundary for user-visible changes** — when the feature changes something the user sees or operates, ask how to record its documentation work."
2. `ai/tasks/feature/plan-a-new-feature.md:168` holds the 2h checklist item: "Any user-visible change has its documentation boundary recorded".
3. `ai/tasks/planning/improve-plan.md:25` forbids "Naming a user or developer documentation page as a plan requirement" and carries the gap "into the report's `Open` items as a follow-up feature candidate"; it allows "the specs and help pages it touches".
4. `ai/tasks/feature/build-a-feature.md:5` opens with a "**Documentation scope.**" paragraph stating "User and developer documentation is owned by `update-documentation.md`, not by a feature PR or plan."
5. `ai/tasks/feature/review-pull-request.md:19` makes documentation the primary scope only "when the pull request's own plan and title are about adding or updating user or developer documentation".
6. `product/specs/task-picker.md:38` describes the planning task's phases, starting "`feature/plan-a-new-feature.md` first writes an initial draft".
7. `documentation/user-documentation/command-bar/tasks.md:73` lists the first phase as "product decisions first: user flow, edge cases, scope, wording" and never mentions a documentation question, so it needs no change.
8. No test under `scripts/`, `src/`, or `web/src/` reads `plan-a-new-feature.md`; a grep for `plan-a-new-feature` finds none.

## Existing functionality

1. The "Documentation scope" paragraph pattern, `ai/tasks/feature/build-a-feature.md:5` "**Documentation scope.**".
2. The documentation-pull-request exception wording, `ai/tasks/feature/review-pull-request.md:19` "Only when the pull request's own plan and title are about adding or updating user or developer documentation".

## Implementation steps

1. Edit `ai/tasks/feature/plan-a-new-feature.md`. Add a "**Documentation scope.**" paragraph after the formatting note near the top. It says user and developer documentation is owned by `update-documentation.md`. It says a plan names no work under `documentation/user-documentation/` or `documentation/developer-documentation/` and no phase asks the user about documentation. It says the exception is a feature whose own title and description are about adding or updating documentation, where those pages are ordinary scope. Delete the "Scope boundary for user-visible changes" bullet from 2d. In 2g, add that a documentation follow-up candidate in `improve-plan.md`'s `Open` items is left out of 2h, and that for a documentation-focused feature its rule 5 does not remove the plan's documentation pages. In 2h, replace the documentation checklist item with one checking that the plan names no documentation work unless documentation is the feature's primary focus. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Edit `product/specs/task-picker.md` line 38. Add a sentence saying the task never asks the user about user or developer documentation and keeps documentation work out of the plan unless documentation is the feature's primary focus. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change touches a task playbook and a spec, not the app's interface.

## Tests

The plan changes no application behavior and introduces no code, so it adds no tests. No existing test reads the playbook (assumption 8).

## Out of scope

- `ai/tasks/planning/improve-plan.md` and the other tasks that carry the documentation-scope rule stay unchanged.
- `documentation/user-documentation/command-bar/tasks.md` stays unchanged, because it never described the documentation question (assumption 7).
- Recording documentation follow-up work anywhere else, such as `product/backlog/documentation.md`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; it should pass with nothing to lint or test.

Then read `ai/tasks/feature/plan-a-new-feature.md`. Confirm that 2d's category list has no documentation bullet. Confirm a "Documentation scope" paragraph near the top states the no-questions rule, the no-documentation-in-plan rule, and the primary-focus exception. Confirm 2g says documentation follow-ups from `improve-plan.md` don't reach 2h. Confirm the 2h checklist item checks for no documentation work except for a documentation-focused feature. A search of the file for "follow-up feature candidate" should find nothing. If any of these is missing, or 2d still asks about documentation, the change was not made correctly. Finally read `product/specs/task-picker.md` line 38 and confirm it states the same rule.
