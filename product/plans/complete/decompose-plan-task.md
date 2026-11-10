# Extract plan decomposition into a standalone decompose-plan task

**Complexity: 5/10** — 11 requirements, 11 test scenarios, ~80 added playbook lines in 1 new and 1 edited task file (p=5.51).

Plan decomposition lives only inside Step 1 of `ai/tasks/feature/build-a-complex-feature.md`. Nobody can decompose a plan without running the whole complex-feature workflow, and the decomposition rules are mixed in with orchestration. This change moves them into a new task, `ai/tasks/planning/decompose-plan.md`, that runs on its own like `improve-plan.md` does, or is opened by another task. It writes ordered subplans to `./product/plans/draft/` and moves the original plan to `./product/plans/complete/`. The complex-feature workflow then delegates its Step 1 to that task.

## Goal

`ai/tasks/planning/decompose-plan.md` takes one plan, breaks it into ordered draft subplans each rated 1–5 by the quantitative rating task, and moves the original plan to `./product/plans/complete/`. `build-a-complex-feature.md` Step 1 delegates to it instead of carrying its own decomposition rules.

## Design decisions

- **Shape.** The new task follows `improve-plan.md` and `rate-plan-complexity-quantitative.md`: a title, a job paragraph, the project `./product/` note, a "Called by another task" paragraph, run-autonomously, Allowed/Forbidden lists, then numbered steps starting with `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`, ending in a fixed-shape report.
- **Called by another task.** A caller skips `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`, names the plan, and receives the report's contents in place of the standalone report. This is the same convention the quantitative rating task uses.
- **Which plan.** A plan named in the invocation, in `./product/plans/draft/` or `./product/plans/ready/`. With no plan named, the only plan in `./product/plans/ready/` is the target; several or none stop with a report. A plan in `complete/` or `deferred/` stops with a report.
- **Plans that don't need splitting.** If the source plan has no complexity line, the task rates it first with the quantitative rating task (skipping its Step 0 and Step 1). A source plan rated 1–5 is reported as needing no decomposition and the task stops with no changes beyond that rating line. The complex-feature workflow only calls it for plans rated 6–10, so this never fires there.
- **Subplan files.** Each subplan is written to `./product/plans/draft/<source-name>-<N>-<slug>.md`, with `N` its 1-based position in the order. Each states its goal, decisions and dependencies, existing code to reuse, proposed changes, tests, verification, and out-of-scope boundaries, and names the source plan's completed path. The rating wording moves over verbatim from complex-feature Step 1: rate every draft subplan through `ai/tasks/planning/rate-plan-complexity-quantitative.md`, never by judgment, and split and re-rate any subplan rated 6 or higher.
- **Source plan move.** After every subplan is rated 1–5, the task moves the source plan to `./product/plans/complete/` with `git mv` when git tracks it, otherwise with a plain `mv`. It never edits the source plan's text beyond a missing complexity line; the source plan stays the canonical record with its original rating.
- **Self-check.** Before reporting, the task confirms every source requirement maps to exactly one subplan or is explicitly shared across named subplans, dependencies point only at earlier subplans, every rating is 1–5 and was recorded by the rating task, and `git status` shows only the new drafts and the move.
- **Report.** Source plan's new path and rating, ordered subplan paths with dependencies and ratings, and a requirement-to-subplan coverage map.
- **Complex-feature Step 1.** The decomposition subagent opens `ai/tasks/planning/decompose-plan.md` and executes every step in order, except `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`, with the source plan as its target. The single-plan skip paragraph and the orchestrator's acceptance check stay in complex-feature unchanged.
- **Complex-feature Step 2.** The first commit still moves the source plan with `git mv`; one added sentence says a decomposed plan was already moved in Step 1, so the move is staged as made rather than repeated. The single-plan route still makes the move in Step 2.
- **Step 0 reading list.** Complex-feature Step 0 item 3 adds `decompose-plan.md` to the task files it reads.

## What already exists (reuse, don't rebuild)

| Need | Existing piece |
| --- | --- |
| Decomposition rules | `ai/tasks/feature/build-a-complex-feature.md` Step 1, items 1–4 |
| Called-by-another-task convention | `ai/tasks/planning/rate-plan-complexity-quantitative.md` "Called by another task" paragraph |
| Standalone task layout | `ai/tasks/planning/improve-plan.md` |
| Subplan rating | `ai/tasks/planning/rate-plan-complexity-quantitative.md` |
| Playbook test style | `scripts/build-a-complex-feature-subplan-rating.test.mjs`, `scripts/build-a-complex-feature-playbook.test.mjs` |

## Implementation steps

1. Write `ai/tasks/planning/decompose-plan.md` per the decisions above.
2. Replace items 1–4 of complex-feature Step 1 with the delegation; add the Step 2 sentence and the Step 0 reading-list entry.
3. Move the decomposition-internal assertions in `scripts/build-a-complex-feature-subplan-rating.test.mjs` (delegation wording, no judgment, split and re-rate, order of write/rate/return) to a new `scripts/decompose-plan-playbook.test.mjs` aimed at the new task, and make the complex-feature test pin the delegation instead.
4. Update `product/specs/task-picker.md` with a "Decomposing a plan" subsection and adjust the "Rating a plan's complexity by formula" sentence that says the complex-feature workflow rates subplans during decomposition. Update `product/specs/pull-request-review.md` "Staged reviews for complex features" to say the decomposition task does the split.

## Tests

`scripts/decompose-plan-playbook.test.mjs`:

- Prepares the workspace in its own `Step 0 — Prepare the workspace` and picks the plan in its own `Step 1 — Pick the plan`.
- Tells a calling task to skip those two steps.
- Writes subplans to `./product/plans/draft/` and moves the source plan to `./product/plans/complete/`.
- Rates every draft subplan through the quantitative rating task, skipping its Step 0 and Step 1, never by judgment, splitting and re-rating anything rated 6 or higher.
- Rates the drafts after writing them, moves the source plan after rating, and reports last.
- Stops on a source plan rated 1–5.
- Names only `ai/` files that exist.

`scripts/build-a-complex-feature-subplan-rating.test.mjs`:

- Step 1 delegates to `ai/tasks/planning/decompose-plan.md`, skipping its Step 0 and Step 1, and no longer carries the rating wording itself.
- Step 2 stages the move the decomposition task made.
- The acceptance check and Step 3 cap assertions stay.
- The skipped headings exist in `decompose-plan.md`.

## Verification

`$janissary/scripts/run.mjs check-diff` passes. Reading complex-feature Step 1 shows a single delegation, and reading `decompose-plan.md` on its own gives a complete runnable task.

## Out of scope

- Changing how complex-feature Step 3 splits a subplan that improvement pushes to 6 or higher.
- Any change to the rating tasks or `improve-plan.md`.
- User documentation, which does not describe planning tasks.
