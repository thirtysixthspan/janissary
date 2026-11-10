# Rate complex-feature subplans with the quantitative rating task during decomposition

**Complexity: 2/10** — ~4 added playbook lines, 1 production file, 4 requirements, 6 scenarios (p=4.08).

`ai/tasks/feature/build-a-complex-feature.md` asks its decomposition subagent for subplans "each with an honest `**Complexity: N/10**` rating where `N` is 1–5", but never says how that rating is produced. The decomposing agent assigns it by judgment, so a subplan can be rated low enough to pass the below-6 check without being measured. Every other task that writes a plan rates it by delegating to `ai/tasks/planning/rate-plan-complexity-quantitative.md`; decomposition should do the same.

## Goal

During Step 1 (decomposition), every draft subplan is rated by executing `ai/tasks/planning/rate-plan-complexity-quantitative.md` against it, skipping that task's `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`. The recorded complexity line is the subplan's rating, never a judgment call. A subplan the task rates 6 or higher is split again and each new piece is rated the same way, until every subplan is rated 1–5. The orchestrator's acceptance check confirms each rating came from that task.

## Approach

1. In Step 1 of `build-a-complex-feature.md`, insert a new item after "Write a complete draft plan for every subplan" that delegates each subplan's rating to the quantitative task with the same skip wording the other callers use, states the rating is not assigned by judgment, and requires splitting and re-rating any subplan rated 6 or higher. Renumber the following items.
2. Extend the orchestrator's acceptance check at the end of Step 1 so it also requires each subplan's rating to have been recorded by the quantitative rating task.
3. Align the stale assertion in `scripts/build-a-complex-feature-source-plan.test.mjs` with the orchestration rule as synced to master in `f3c17ae9` ("Plans rated 1–5 are not decomposed", "For plans rated 6–10, decompose"). That sync changed the playbook but not its test, so the test fails on master and would block this change's checks. Only that one rule's assertions change; the playbook text from the sync is kept as is.

## Implementation steps

1. Edit Step 1 of `ai/tasks/feature/build-a-complex-feature.md` (new rating item, renumbering, acceptance check).
2. Update the two routing-threshold assertions in `scripts/build-a-complex-feature-source-plan.test.mjs`.
3. Add `scripts/build-a-complex-feature-subplan-rating.test.mjs`.
4. Update `product/specs/pull-request-review.md` ("Staged reviews for complex features") to say subplan ratings come from the formula-based rating task during decomposition, and correct `product/specs/task-picker.md` ("Rating a plan's complexity by formula"), which still says nothing calls the quantitative task.

## Tests

`scripts/build-a-complex-feature-subplan-rating.test.mjs`, in the style of the other playbook tests (string assertions on a sliced section):

- Step 1 delegates each subplan's rating to `ai/tasks/planning/rate-plan-complexity-quantitative.md`, skipping `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`.
- Step 1 says the rating is not assigned by judgment.
- Step 1 requires a subplan rated 6 or higher to be split again and each new piece rated the same way.
- The rating item comes after the draft-writing item and before the return-to-orchestrator item.
- The orchestrator's check requires the ratings to have been recorded by the quantitative rating task.
- The quantitative rating task still has the two headings the delegation skips.

## Out of scope

- Changing how Step 3 improves subplans (improve-plan already rates through the quantitative task).
- Reconciling the playbook's other 1–3 / 4–10 routing references with the synced 1–5 / 6–10 rule; that is a separate decision for the playbook's owner.
- Any change to the quantitative rating task itself.
