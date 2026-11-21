# Require anchors and identifiers in plan assumptions

**Complexity: 1/10** — docs-only change: 0 added lines, 0 files, 4 requirements (p=2.71).

## Goal

Make every `Assumptions` bullet in a plan verifiable: one factual claim about the code, anchored to a `path:line` and a quoted identifier. Make the improvement pass responsible for checking that rule, so a plan cannot carry an unanchored or wrong premise through to implementation.

## Design decisions

- The plan template stays the single owner of plan shape. Only its `Assumptions` section changes; no second copy of the rule is added to a task prompt.
- The anchor format is the existing one from `ai/tasks/planning/improve-plan.md` Step 4: `path:line` plus the quoted identifier or code fragment. The template states it as a requirement; the improvement task states how to check it against the code.
- "One assumption per bullet" is enforced in the template, so a bullet cannot hide several premises behind one pointer.
- The improvement task's new duty sits in Step 3, the pass that finds ways an implementer could go wrong, so it feeds Step 4's edit pass like every other finding. Step 2's existing "open the real thing" instruction already covers the mechanics.
- No functional spec restates plan-section formats or the improvement pass's checklist — the template owns them — so no spec change is made.

## What already exists (reuse, don't rebuild)

| Concern | Where it already lives |
| --- | --- |
| The `Assumptions` section's current, anchor-free wording | `ai/guidelines/plan-template.md`, "Assumptions" |
| The `path:line` plus quoted-identifier anchor rule | `ai/tasks/planning/improve-plan.md`, Step 4 |
| The improvement pass's list of ways an implementer can go wrong | `ai/tasks/planning/improve-plan.md`, Step 3 |
| The instruction to check every plan claim against the real code | `ai/tasks/planning/improve-plan.md`, Step 2 item 2 |
| The backlog entry that records this issue | `product/backlog/issues.md`, `## ready` (first entry) |

## Implementation steps

1. In `ai/guidelines/plan-template.md`, rewrite the `Assumptions` section so each bullet states one factual claim about the code and carries a `path:line` anchor plus the quoted identifier or code fragment it rests on; state that a file name, spec, or answer alone is not enough.
2. In `ai/tasks/planning/improve-plan.md`, add a Step 3 finding for unanchored assumptions: check that every `Assumptions` bullet holds a single code claim, that its `path:line` resolves, that the quoted identifier is present at that location, and that the claim and identifier agree with the code; direct the pass to fix missing, split, or wrong bullets in Step 4.
3. Remove the fixed issue's line from `product/backlog/issues.md`.

## Tests

No application source, tests, or configuration change, so no new unit tests are introduced. Conformance is checked by reading the two revised documents and by the reading checks in Verification, following the precedent of other docs-only plans.

## Out of scope

- No change to any other section of `ai/guidelines/plan-template.md`, including the complexity-line paragraph.
- No change to `ai/tasks/planning/improve-plan.md` beyond the new Step 3 finding.
- No change to `plan-a-new-feature.md`, `decompose-plan.md`, the other improvement pass, completed plans, or any functional spec or user documentation.
- No change to the `path:line` plus identifier anchor format itself — it is reused verbatim.

## Verification

- `$janissary/scripts/run.mjs check-diff` after each edit.
- Read the revised `Assumptions` section and confirm it requires one code claim per bullet and a `path:line` anchor with a quoted identifier, and explicitly rejects a bare source name.
- Read the revised Step 3 and confirm it makes the improvement task verify the claim, the pointer, and the identifier against the code and feed any defect into Step 4's edit pass.
- `git status --short` shows only the two revised documents, the issues file, and this plan as changed.
