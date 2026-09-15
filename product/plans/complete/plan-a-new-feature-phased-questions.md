**Complexity: 4/10** — a documentation-only change to one AI task playbook plus one spec paragraph. No source code, no tests, no new architecture.

## Goal

Restructure how `ai/tasks/plan-a-new-feature.md` asks questions: two ordered phases — product decisions first, implementation decisions second — each driven by the decision-tree questioning logic described in mattpocock's `grilling` SKILL.md (summarized in the task), with no cap on how many questions are asked. After the draft plan is complete, a further questioning phase resolves any open questions, and after the two improvement passes, a final phase resolves any questions the passes surfaced.

## Grilling summary (to embed in the task)

Phase questioning works a **decision tree** of decisions: every undecided point branches into the decisions that hang off it. Work the tree in **rounds** over what is *askable now* — every decision whose prerequisites are already settled, so asking it needs no guess at an answer not yet heard. Number each question and give the recommended answer; wait for answers before the next round. Each round's answers reshape the tree — settled decisions push the frontier outward and unblock dependent questions — so recompute the askable set and repeat. A question that depends on one still open belongs to a later round. Facts are found in the environment, never asked of the user; the decisions are the user's. A phase ends only when the frontier is empty, with nothing left silently assumed. There is no limit on the number of questions or rounds a phase may take.

## Approach

Edit only `ai/tasks/plan-a-new-feature.md` and `product/specs/task-picker.md`.

### plan-a-new-feature.md

1. Replace 2d ("Ask the first question round") with **"Phase 1 — resolve product decisions"**: the same four categories (primary flow, edge cases, scope boundary, naming/wording) frame the tree, worked in grilling rounds with recommended answers, unlimited rounds and unlimited questions, until every product decision is settled. Drop the "maximum 4 questions per call" cap. Draft updates after each round, as today.
2. Insert **"Phase 2 — resolve implementation decisions"**: runs the same decision-tree mechanics over implementation-only questions (where code lives, which existing mechanism extends or replaces, new protocol messages). Only entered when Step 2b's four checks made the feature high complexity; when all four were "no" the phase runs with no questions to ask and is skipped without ceremony.
3. Keep 2e (improvement passes) unchanged.
4. Rewrite 2f as the **"Final question phase"**: after the plan exists and after both improvement passes, re-open the decision tree over any remaining open questions and any new ones the passes surfaced, worked in unlimited rounds until the existing four-item checklist and the four-item completeness review both clear. Drop the "maximum 4 questions" cap here too.

### product/specs/task-picker.md

Update the `plan-a-new-feature.md` paragraph to describe the phased flow: an initial draft, a product-decision phase, an implementation-decision phase (when the feature is high complexity), the improvement passes, and a final phase resolving open and newly surfaced questions — decision-tree rounds with recommended answers, no limit on question count, draft updated after each round, complete only when every decision is resolved.

## Tests

None — the change touches instruction documents only, which have no test suite. Verification is `./scripts/run.mjs check-diff` reporting no regressions plus a manual read-through of both edited files.

## Out of scope

- Every other `ai/tasks/` playbook's question handling (e.g. `fix-a-bug.md`, `work-an-issue.md` — autonomous tasks, untouched).
- The improvement tasks `ai/tasks/planning/improve-plan.md` and `improve-plan-with-minimalism.md`.
- `help.md` and `documentation/user-documentation/` — they describe the workflow generically ("resolve anything ambiguous") and nothing there changes in behavior they document.
