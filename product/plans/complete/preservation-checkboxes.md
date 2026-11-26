# Use checkboxes to select the behaviors a feature plan protects
**Complexity: 2/10** — One task file, four requirements, and four selection scenarios (p=4.10).

## Goal

Let the user review and adjust which existing behaviors a feature plan explicitly protects. The checklist makes the recommendations visible and explains what a selection adds to the plan.

## Requirements

1. Show each relevant behavior as an independent checkbox, as requested in “each feature is listed as a checkbox.”
2. Check recommended behaviors by default, as requested in “features recommended for preservation are checked by default.”
3. Explain that selecting a behavior adds a safeguard to the plan, as requested in “included in the plan to protect them.”
4. Allow the user to confirm the defaults, adjust the selection, or select none. These are outcomes of the requested checkbox list.

## Design decisions

- The preservation checklist is one question in the existing decision tree, with one checkbox per behavior.
- A text checklist carries the same defaults when the question interface lacks preselected checkboxes, based on assumption 2.
- Confirmed selections feed the plan template's existing rules for preservation claims and tests.

## Preserved behavior

None found

## Assumptions

1. The issue's `plan-a-feature.md` refers to `ai/tasks/feature/plan-a-new-feature.md:120`, which names the `Preserved behavior` question.
2. Question tools can differ in checkbox support. The current workflow names `AskUserQuestion` at `ai/tasks/feature/plan-a-new-feature.md:116` without establishing support for initial checked states.

## Existing functionality

1. `ai/tasks/feature/plan-a-new-feature.md:99` directs the agent to ask `one question at a time` and wait for the answer.
2. `ai/guidelines/plan-template.md:31` defines how `Preserved behavior` records the behavior, its negative assertion, and test coverage.
3. `scripts/re-review-production-code.test.mjs:14` uses Vitest to pin execution rules in task files.

## Implementation steps

1. Update the question format and Phase 1 in `ai/tasks/feature/plan-a-new-feature.md` to present the preservation checklist, its defaults, and how to submit the selection. Run `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The product phase asks which existing behaviors the plan should explicitly protect. Each recommended behavior starts checked. The user can change the selection before submitting.
2. In a text-only question, show the initial check states in Markdown and let the user confirm the defaults, reply with the behaviors to protect, or explicitly select none.

## Tests

- Add playbook contract tests in `scripts/plan-a-new-feature.test.mjs` for the checkbox exception and initial checked states (requirements 1–2), the prompt and how confirmed selections reach the plan (requirement 3), and the text-only reply path (requirements 2 and 4).

## Out of scope

- Changes to question tools or the application's question panel.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Review the task's question format and Phase 1 alongside the planning sections in `product/specs/task-picker.md` and `documentation/user-documentation/command-bar/tasks.md`. Walk through a feature with two candidate behaviors, one recommended. Verify that the recommended behavior starts checked, a user can select the other behavior or clear the list, and the confirmed selection determines which safeguards enter the plan. A numbered single-choice question, omitted defaults, or recording a behavior after it is deselected fails the check.
