# Number and quote plan requirements

**Complexity: 1/10** — 0 added lines, 0 files, 3 requirements (p=2.56).

## Goal

Make a plan's `Requirements` section countable and checkable: number each requirement, keep one behavior per item, and quote the source text it comes from instead of paraphrasing it.

## Design decisions

- The plan template is the single owner of plan shape, so only its `Requirements` section changes. No task prompt gets a second copy of the format rule.
- Numbering uses the explicit `1.`, `2.` form so a reader can count requirements and tie tests and ratings back to a stable index.
- "One behavior per requirement" is enforced by splitting any sentence that joins two behaviors with "and", rather than by a general instruction to keep items small.
- Sourcing is by near-verbatim quotation of the feature text or settled user answer, so a reader can match each requirement back to what was actually asked for.
- The existing content requirement — observable behavior including empty, duplicate, error, and boundary cases — stays; only the list format and sourcing change.
- No functional spec restates plan-section formats, so no spec change is made.

## What already exists (reuse, don't rebuild)

| Concern | Where it already lives |
| --- | --- |
| The `Requirements` section's current bulleted, paraphrase-friendly wording | `ai/guidelines/plan-template.md`, "Requirements" |
| The `Tests` rule tying each test back to a requirement | `ai/guidelines/plan-template.md`, "Tests" |
| The counting task's "behavioral requirements" question, which numbering makes reproducible | `ai/tasks/planning/rate-plan-complexity.md`, Step 3 |
| The backlog entry that records this issue | `product/backlog/issues.md`, `## ready` (sole entry) |

## Implementation steps

1. In `ai/guidelines/plan-template.md`, rewrite the `Requirements` section so requirements form a numbered list (`1.`, `2.`, …), each item carries exactly one behavior (split any "and" joining two), and each item quotes the feature text or resolved user answer rather than restating it. Keep the existing guidance on observable behavior and the empty, duplicate, error, and boundary cases.
2. Remove the fixed issue's line from `product/backlog/issues.md`.

## Tests

No application source, tests, or configuration change, so no new unit tests are introduced. Conformance is checked by reading the revised section and by the reading check in Verification, following the precedent of other docs-only plans.

## Out of scope

- No change to any other section of `ai/guidelines/plan-template.md`.
- No change to `ai/tasks/planning/improve-plan.md`, the rating task, other task prompts, completed plans, or any functional spec or user documentation.
- No change to the set of cases a plan must cover — only how requirements are listed and sourced.
- No retrofit of existing plans; the rule applies to plans written after this change.

## Verification

- `$janissary/scripts/run.mjs check-diff` after each edit.
- Read the revised `Requirements` section and confirm it requires numbering, one behavior per item with "and" split, and near-verbatim quotation of the feature text or settled answer, while retaining the observable-behavior and edge-case guidance.
- `git status --short` shows only the revised template, the issues file, and this plan as changed.
