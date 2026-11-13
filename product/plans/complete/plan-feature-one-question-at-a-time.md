# Ask plan-a-new-feature questions one at a time

**Complexity: 3/10** — ~20 added playbook lines in 1 file, 6 requirements, 3 test scenarios (p=4.42)

## Goal

`ai/tasks/feature/plan-a-new-feature.md` asks its questions in rounds: every askable question at once, numbered, each with a recommended answer. The issue asks for a different shape. Questions go out one at a time. Each question offers at least three numbered answers plus an "other" answer where the user writes their own. Each question marks one answer as the recommendation and one as the lowest-cost option, the one least likely to increase scope, and one answer may carry both marks.

## Approach

The decision-tree mechanism stays: decisions still depend on each other, and the askable set is still everything whose prerequisites are settled. What changes is how the askable set is consumed. Instead of asking the whole set in one round, the agent asks one question from it, waits for the answer, writes it into the draft, recomputes the askable set, and asks the next. That also removes the "a question whose answer depends on another open question in the round belongs to a later round" rule, since only one question is ever open.

The answer format becomes its own short subsection under "Phased questioning — the decision tree", so every phase (2d, 2e, 2f, 2h) points at one definition instead of restating it:

- At least three concrete answers, numbered from 1, grounded in what Step 2a found.
- A final numbered "Other" answer that lets the user write their own.
- One answer labelled as the recommendation.
- One answer labelled as the lowest-cost option, the one least likely to increase scope.
- One answer may carry both labels when the recommendation is also the lowest-cost option.

Each phase's text that says "one call per round", "rounds of numbered questions", or "wait for the user's answers before the next round" is reworded to one question per call, using the answer format. 2d's "propose your best-guess default as one of the options" rule is folded into the format (the recommendation). The 2h phase's "later round" wording becomes "ask it after the question it depends on is answered".

Rejected alternative: keeping rounds but adding the answer format. The issue explicitly asks for one question at a time.

## Implementation steps

1. Rewrite the "Phased questioning — the decision tree" section of `ai/tasks/feature/plan-a-new-feature.md` to ask one askable question at a time, and add a "Question format" subsection defining the numbered answers, the "Other" answer, and the recommendation and lowest-cost labels.
2. Update 2d, 2e, 2f, and 2h to ask one question per `AskUserQuestion` call in that format, and to update the draft after each answer.
3. Extend `scripts/plan-a-new-feature-playbook.test.mjs` to pin the one-at-a-time rule and the answer-format requirements.

## Tests

- `scripts/plan-a-new-feature-playbook.test.mjs`:
  - the decision-tree section asks one question at a time and no longer asks the askable set in one round;
  - the question format requires at least three numbered answers, an "Other" answer, a recommendation, and a lowest-cost option, and allows one answer to be both;
  - no phase still says "one call per round".

## Spec and docs

- `product/specs/task-picker.md`, "Planning a new feature": replace "rounds of numbered questions, each with a recommended answer" with the one-at-a-time format, and "after each round" with "after each answer".
- `documentation/user-documentation/command-bar/tasks.md`: the paragraph that says each phase is a round of numbered questions is updated to describe one question at a time with numbered answers, an Other choice, and the recommended and lowest-cost marks.

## Out of scope

- `ai/tasks/feature/remove-an-existing-feature.md`, which borrows the decision-tree mechanism but restates its own round-based wording; the issue names only `plan-a-new-feature.md`.
- Other interactive playbooks and the improvement tasks the playbook runs.
- Any change to which decisions are asked or in which phase.
