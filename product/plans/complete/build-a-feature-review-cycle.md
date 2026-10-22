# End the build-a-feature task with a review/repair cycle and a pull request update

**Complexity: 3/10** — two task prompts change and one spec gains a section, with a pin test. No runtime surface.

## Goal

`ai/tasks/feature/build-a-feature.md` stops as soon as `open-feature-pull-request.md` has opened its pull request. Nobody reviews it, and the plan, specs, and description are never brought back in line with what the repairs changed. `ai/tasks/feature/build-a-complex-feature.md` already ends better. It reviews the full pull request with `review-pull-request.md`, drains the backlog one entry at a time with `work-pull-request-issue.md`, repeats until a review adds nothing, and runs `update-pull-request.md`. The ordinary build task should end the same way.

## Approach

Add the same two closing stages to `build-a-feature.md`, after its PR-opening step and before its report, with the same rules the complex task uses:

- Each review, each repair, and the update run in a fresh subagent, given the recorded PR number and the completed plan path. The reviewer then judges the code without the context that wrote it.
- The review covers the full pull request. Its findings are resolved one at a time, in file order, through `work-pull-request-issue.md` with the explicit PR number and an entry selector. Its complexity-7 cutoff is overridden, as in the complex task, so recorded review work is not abandoned for its rating.
- After the backlog drains, the full pull request is reviewed again. The cycle stops when a review records nothing new and the backlog is empty.
- `update-pull-request.md` then runs with no override. The plan this task promotes is in the PR's first commit, which is how the update task finds the PR's own plan and folds the fix plans into it.
- The PR stays open throughout. A blocked review, repair, or update stops the run and is reported. The PR and its outstanding backlog are kept.

`build-a-complex-feature.md` delegates `build-a-feature.md` once per subplan, and already overrides its PR-opening handoff. It reviews each implementation commit and updates the PR itself. So its Step 4 override has to skip the two new stages as well. Without that change, every subplan would review the aggregate PR and update it early, which is the opposite of what the complex task's focused-review cycle requires.

The issue's subject is a task playbook, so the playbook stands in for "source" here, as it did in `product/plans/complete/plan-a-new-feature-reuses-prepared-workspace.md`.

## Implementation steps

1. `ai/tasks/feature/build-a-feature.md`:
   - Opening paragraph: name the review/repair cycle and the closing update as part of the job. Say the delegated review, repair, and update tasks keep their own edit scopes.
   - `Run autonomously`: add a blocked review, repair, or update to the stop conditions.
   - Allowed: delegate `review-pull-request.md`, `work-pull-request-issue.md`, and `update-pull-request.md` against the PR this task opened.
   - Forbidden 1: the plan's scope binds this task's own implementation. Repairs follow `work-pull-request-issue.md`'s scope rules under their own fix plans.
   - Forbidden 5: never merge or close the PR. Opening, reviewing, repairing, and updating all leave it open.
   - Step 7: record the PR number, URL, and head branch for the steps that follow.
   - New `## Step 8 — Review and resolve the pull request` and `## Step 9 — Update the pull request`, as described in the approach.
   - The report becomes `## Step 10 — Report` and gains `Reviews:` and `Updated:` lines. `Status:` reads `open | blocked — <reason>`.
2. `ai/tasks/feature/build-a-complex-feature.md`, Step 4 override 3: also skip the build task's review-and-repair cycle and its pull request update. Say where the orchestrator does each instead (Steps 5, 6, 8, and 9).
3. `scripts/build-a-feature-playbook.test.mjs`: a new pin test (see Tests).
4. `product/specs/pull-request-review.md`: a new `### Review cycle after building a feature` section. It describes the full review, the one-at-a-time drain, the repeat until a review adds nothing, the closing update ([[pull-request-updating]]), and the PR staying open. It also notes that a subplan built inside the complex-feature workflow leaves those stages to that workflow.

## Tests

`scripts/build-a-feature-playbook.test.mjs`, a new file in the style of `scripts/build-a-complex-feature-playbook.test.mjs`. It reads the task files with `readFileSync` and pins only the wording the new cycle depends on:

- Step 7 opens the PR with `open-feature-pull-request.md`, before Step 8.
- The Step 8 section delegates `ai/tasks/feature/review-pull-request.md` and `ai/tasks/feature/work-pull-request-issue.md`, drains entries one at a time in file order, overrides only the complexity-7 cutoff, and repeats until a review records no new findings.
- The Step 9 section delegates `ai/tasks/feature/update-pull-request.md`, after Step 8 and before the report.
- `build-a-complex-feature.md` Step 4 tells the build subagent to skip the review-and-repair cycle and the pull request update along with the PR-opening handoff.
- The child tasks still carry the headings the overrides lean on: `work-pull-request-issue.md` still has its complexity-7 forbidden rule, and `update-pull-request.md` still finds the own plan from the branch's first commit. If either is renamed or removed, the override in `build-a-feature.md` would point at nothing.

## Out of scope

- Changing `review-pull-request.md`, `work-pull-request-issue.md`, `update-pull-request.md`, or `open-feature-pull-request.md` themselves.
- Adding the PR test cycle (`test-pull-request.md`) to the build task. The issue asks only for the review/repair cycle and the update, which is what the complex task ends with.
- Bounding the number of review rounds. The complex task does not bound them, and this change mirrors it.
- The stale `auto-build-a-feature` references in `product/specs/task-picker.md` and `documentation/user-documentation/command-bar/tasks.md`. That is a separate defect.
- `help.md` and `documentation/user-documentation/`. Neither one describes how the build task ends. The product-development workflow page describes the build step only as implementing a plan, updating its spec, and promoting it, which stays true.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff`.

Manual: read `build-a-feature.md` from Step 7 to the report. Confirm the PR is reviewed, every finding is drained one at a time, the review repeats until clean, the update runs last, and nothing merges the PR. Then read `build-a-complex-feature.md` Step 4. Confirm a subplan build skips all three closing stages.
