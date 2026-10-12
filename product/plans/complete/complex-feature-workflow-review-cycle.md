# Review complex-feature pull requests in ordered stages

**Complexity: 4/10** — one orchestration task and its existing pull-request review spec change the order and scope of plan publication, implementation reviews, and final pull-request reviews.

## Goal

Update `ai/tasks/feature/build-a-complex-feature.md` so every decomposed subplan is published in one open pull request before implementation, each subplan is improved immediately before work begins, and its implementation commit receives a focused review against that subplan before the next subplan starts. After all subplans and their repair cycles are complete, review the whole pull request and repeat repair/review cycles until the backlog is empty and a full review finds no new work.

## Decisions

- Decomposition writes all subplan drafts before implementation. Commit and push those plans on one feature branch, then open the single pull request.
- Improve one subplan immediately before implementing it; publish the improved plan before its implementation commit.
- Publish each implementation as its own commit. Review only that implementation commit against its improved subplan; do not review the aggregate pull-request diff until all subplans and focused repair cycles are complete.
- Drain pull-request backlog entries one at a time in file order after every focused review and after every full review. Re-review after repairs before advancing to another subplan or declaring the full review complete.
- Consolidate subplans into the canonical source plan and update the pull-request description before the final full-pull-request review, so that review judges the final intended deliverable.
- Explicitly override the update task's first-commit plan discovery: the canonical source plan may be promoted after the initial plan-only commit, and all completed subplan plans must still be folded and removed.
- Do not change the standalone review or repair task contracts. `build-a-complex-feature.md` states the explicit review-task override needed for focused commit reviews and the later full review.
- The feature workflow is developer orchestration, not user-facing product behavior. Extend `product/specs/pull-request-review.md` only to state the observable review sequence and backlog-draining behavior it owns.

## Implementation steps

1. Reorder `ai/tasks/feature/build-a-complex-feature.md` so decomposition writes all subplan plans, then one feature branch and PR are created from those plans before any subplan is improved or implemented.
2. Require each subplan's improve-plan pass and resulting plan changes to be committed and pushed immediately before that subplan is implemented.
3. Require every implementation to be a separate commit pushed to the same PR before review. Override `review-pull-request.md` so the review is limited to the new implementation commit and its corresponding subplan, and explicitly excludes the aggregate PR diff.
4. Require review findings to be appended to the PR backlog and drained one at a time in file order before the next subplan begins.
5. After all subplans are implemented, focused-reviewed, repaired, and their backlogs drained, consolidate the canonical source plan and update the PR description before reviewing the full PR.
6. Review the full PR, drain its backlog one item at a time, and repeat the full review/repair cycle until a review adds no findings. Do not merge or close the PR.
7. Update `product/specs/pull-request-review.md` with the focused-review-then-full-review sequence and the requirement to drain recorded findings before each subsequent review.

## Tests and verification

No executable behavior changes. Manually compare the updated task against every requested backlog constraint, verify that no full-PR review occurs during per-subplan cycles, and check that repairs are drained before any subsequent review. Run `./scripts/run.mjs check-diff` after each change.

## Out of scope

- Changes to standalone review, repair, plan-improvement, or feature-build task behavior outside the explicit overrides in the complex-feature task.
- Changes to source code, tests, `help.md`, public user documentation, or pull-request tooling.
- Merging or closing the feature PR managed by the complex-feature workflow.
