# Build a Complex Feature

Take one supplied high-complexity plan, decompose it into ordered subplans each rated below 7/10, and deliver the complete feature on one open pull request. Publish all subplans before implementation. Immediately before each subplan is implemented, improve it and publish the improved plan; then publish its implementation as a separate commit, review that commit against the subplan, and clear its review backlog before proceeding. After all subplans are complete, update the canonical plan and pull request, then review the full pull request and resolve findings until a full review adds none.

Invocation: `execute ./ai/tasks/feature/build-a-complex-feature.md <plan name or path>`.

**Run autonomously.** Do not ask the user questions or wait for feedback. Resolve decisions from the supplied plan, repository instructions, specs, and existing behavior. Stop only for an explicit blocked condition in this task or a child task.

**Use fresh subagents for each work step.** Delegate plan decomposition, each plan-improvement pass, each subplan implementation, each PR review, each review-work item, and the final PR update to fresh subagents. Give each subagent only the files, decisions, constraints, and recorded identifiers it needs for its step. The orchestrator retains the overall plan, subplan order, branch and PR identity, and completion state; pass those facts explicitly instead of relying on earlier subagent context. Do not run dependent steps concurrently.

**Project paths and task resolution.** `./product/` refers to the project in the current working directory. Resolve child tasks from this project's `ai/tasks/` first, then `$janissary/ai/tasks/` if absent. Read the resolved task before delegating it. If a required task or runner is unavailable, stop and report the blocker rather than inventing a replacement.

**No AI attribution.** Do not add AI authorship notes, generated-by lines, or co-author trailers to plans, code, commits, or pull request text.

## Orchestration rules

- The supplied high-complexity plan is the authoritative feature scope. Do not reject it, weaken it, lower its rating, or apply a complexity cutoff to it.
- Decompose all planned behavior into ordered subplans, each with an honest `**Complexity: N/10**` rating where `N` is 1–6. A subplan rated 7 or higher is not ready to implement: split it again until every piece is below 7. Do not use the rating to hide work or evade a child's normal checks.
- Preserve dependencies and shared contracts explicitly. Order subplans so each can be implemented and verified against the preceding completed work. Include cross-cutting integration, migration, and end-to-end verification in the sequence; do not leave required work as an implied final cleanup.
- Use one feature branch and one pull request for the entire feature. Publish all initial subplan plans and open the PR before improving or implementing any subplan. Every plan update, implementation, and repair is committed and pushed to that same branch and PR. Never create another PR.
- Before starting a subplan, improve it with `improve-plan.md`, promote it to `ready/`, and commit and push the improved plan. After implementation, publish its own commit before review.
- Each subplan review covers only its newly published implementation commit against that subplan. Do not review the aggregate PR diff during the subplan cycles. Drain every resulting PR backlog item, one at a time in file order, before starting the next subplan.
- After every subplan and its focused review/repair cycle is complete, consolidate the canonical plan and update the PR description. Then review the full PR. Drain every finding one at a time and repeat the full review/repair cycle until a full review adds no findings and the backlog is empty. The PR remains open throughout; never merge or close it.
- Preserve the repository's dependency audit, diff-scoped checks, test requirements, security rules, and task-specific publication safeguards. Never run `npm run check`.
- If a child task's standalone behavior conflicts with this orchestration, apply only the explicit overrides below and retain every other child constraint.

## Step 0 — Validate and prepare

1. Require a plan name or path that resolves to a plan in `./product/plans/ready/`. If none is supplied or no plan matches, report the reason and stop. Do not choose an unrelated plan.
2. Read the selected plan in full and confirm it states the feature goal, implementation scope, tests, verification, and an honest complexity rating of 7/10 or higher. If any are missing, report the issue and stop; do not invent or improve the source plan here.
3. Read `AGENTS.md`, every file under `ai/guidelines/`, and the relevant project specs and implementation references. Read the task files used below, including `build-a-feature.md`, `improve-plan.md`, `review-pull-request.md`, `work-pull-request-issue.md`, `update-pull-request.md`, and `open-feature-pull-request.md`.
4. Confirm the working tree is clean before workspace preparation. Preserve unrelated work and stop if the tree is not clean.
5. Delegate `ai/tasks/workspace/prepare-workspace.md` to a fresh subagent and require it to complete the task in full. Stop if its required audit or preparation fails. Confirm the tree is clean afterward.

## Step 1 — Decompose the plan

Delegate this step to a fresh subagent. Provide the entire source plan, relevant repository constraints, and the requirement that each subplan rate 1–6.

1. Break the plan into the smallest coherent, ordered subplans that deliver the original goal without dropping scope. Write a complete draft plan for every subplan, each stating its goal, decisions and dependencies, existing code to reuse, proposed changes, tests, verification, and out-of-scope boundaries.
2. Ensure the subplans collectively cover every requirement and edge case in the source plan. Include explicit integration work where pieces meet. A subplan may depend on earlier subplans, but never on future work.
3. Return the ordered subplan paths, dependencies, ratings, and a requirement-to-subplan coverage map to the orchestrator. Do not write source code or implementation changes in this step.

The orchestrator checks that the source plan's full scope is represented exactly once or explicitly shared across named subplans, dependencies form a workable order, and every rating is below 7. If not, send the decomposition back for correction before proceeding.

## Step 2 — Publish all subplans and open the PR

After decomposition and before improving or implementing any subplan:

1. Create one descriptive feature branch, commit all initial subplan plan files using a Conventional Commit subject, and push them to the remote. Stage only the subplan plans; do not include unrelated changes.
2. Delegate `ai/tasks/workspace/open-feature-pull-request.md` to a fresh subagent to open the PR against `master`. Override its branch/commit steps because the plan commit is already pushed; it must not create a second branch or duplicate the commit. Preserve its check gate, complete PR description requirements, and no-merge rule.
3. Record the PR number, URL, and head branch. Confirm it is `OPEN`, points to that branch, and its remote head matches the published commit. If publication fails, preserve local work and stop with the concrete blocker.

## Step 3 — Improve and promote each subplan

Process subplans strictly in sequence, immediately before each implementation. Use a fresh subagent to execute `ai/tasks/planning/improve-plan.md` with that subplan's exact draft path. Override its Step 0 to reuse the already prepared workspace and skip workspace preparation; preserve its one-plan-only edit restriction and all other improvement and verification steps. The subagent may edit only that plan. Preserve its assigned 1–6 rating; improve-plan may correct the rating only if it remains below 7 and its rationale stays honest. If the improvement finds the plan cannot remain below 7, split it into smaller subplans, publish the additional plan files to the existing PR, and improve each new plan before implementation.

After improvement, the orchestrator verifies the plan remains within the source scope and has a complexity rating below 7. Promote the plan from `draft/` to `ready/` with a normal file move, commit and push that plan change to the open PR, and record its exact path. Do not start implementation until publication succeeds.

## Step 4 — Implement one subplan

For each promoted subplan, delegate `ai/tasks/feature/build-a-feature.md` to a fresh subagent with the exact ready-plan path. It must implement only that subplan, run its required diff-scoped checks after each implementation change, write/update the functional specs, and promote that plan to `complete/`.

Apply these overrides to `build-a-feature.md`:

1. Select the supplied plan even if the original feature plan is rated 7 or higher. The selected subplan must still be rated 1–6.
2. Reuse the prepared workspace; override Step 0 and do not run workspace preparation again.
3. Do not run the build task's PR-opening handoff. The orchestrator commits and pushes each implementation to the existing feature PR branch after implementation, as specified in Step 5.
4. Keep the original high-complexity plan and the improved subplan plans with the delivered work. Do not expand the subplan's file scope without first updating and re-improving its plan.

The subagent reports the completed plan path, implementation summary, checks, tests, specs, and any blocker. The orchestrator verifies the subplan is complete and its working tree changes are limited to the planned work before publication.

## Step 5 — Commit and push each implementation

After each subplan passes implementation verification, commit only that subplan's implementation and plan promotion with a Conventional Commit subject, then push to the existing PR head. This must be a separate commit from the plan-publication commit. Never amend or force-push. If the remote advanced, use the repository's bounded rebase-and-retry policy, preserve both sides of conflicts, and rerun the required diff-scoped checks before retrying. Confirm the PR remains open on the recorded branch before reviewing it.

## Step 6 — Review and resolve each subplan

After every subplan implementation commit is published, complete this cycle before advancing:

1. Delegate `ai/tasks/feature/review-pull-request.md` to a fresh subagent with the recorded PR number, the implementation commit SHA, and the corresponding subplan path. Override its Step 2 and Step 3 review scope: read the improved subplan as the promise and review only the implementation commit's diff against its parent. For description fidelity, compare the commit with the subplan, not the overall PR description; assess functionality gaps, technical debt, and security only in that commit. Do not inspect or assess the aggregate PR diff, earlier subplans, or the full feature plan during this cycle. Preserve the review task's clean-tree requirement, deduplication, no-fix, no-tooling, backlog-only commit, and open-PR rules.
2. Read the PR's `./product/backlog/pull-request.md`. Resolve every entry in file order by delegating one at a time to a fresh subagent running `ai/tasks/feature/work-pull-request-issue.md` with the explicit PR number and an entry selector. Finish and verify publication of each item before selecting the next. Preserve that task's tests, scope, and branch safeguards; override only its complexity-7 cutoff so recorded review work is not abandoned for its rating.
3. If a repair changes the implementation, review that repair commit against the same subplan and drain any new backlog items before continuing. Finish only when the reviewed implementation and all its repairs are published and the backlog is empty (or contains only the required empty-file skeleton).
4. Confirm all commits are pushed, the PR is still open on the recorded branch, and the working tree is clean before proceeding to the next subplan.

If a review or repair is blocked, preserve the PR and outstanding backlog, report the blocker, and stop rather than starting the next subplan.

## Step 7 — Continue through all subplans

Repeat Steps 3 through 6 in order for every remaining subplan. Before starting each, verify all earlier subplans are complete, published, focused-reviewed, repaired, and have no unresolved backlog entries. Keep the same branch and PR for the entire sequence.

After the final subplan's focused review cycle is complete, verify the requirement-to-subplan coverage map against the delivered code, specs, tests, and plan files. If a source-plan requirement is missing, add the necessary subplan plan to the existing PR, improve it immediately before implementation, and carry it through the same implementation and focused-review cycle.

Once every requirement is delivered and all focused review backlogs are empty, move the original source plan from `ready/` to `complete/` and commit and push that plan move to the existing PR branch. This original plan is the canonical record of the full feature; keep its original complexity rating and incorporate the completed subplans' final outcomes during the update step.

## Step 8 — Update the pull request

Delegate `ai/tasks/feature/update-pull-request.md` to a fresh subagent with the recorded PR number before the full-PR review. Override its Step 2 plan discovery and Step 3 selection: do not identify the canonical plan from the first commit. Use the original source plan recorded in Step 0, now moved from `ready/` to `complete/`, as the canonical plan; fold every completed subplan plan into it and remove those subplan files from `product/plans/complete/`. The source plan's original complexity rating remains unchanged. The subagent updates the PR description, canonical plan, specs, and `help.md` to match the final code, then commits and pushes on the same branch. Preserve the update task's prohibition on source changes, its clean-tree and target checks, and its no-merge rule. If this update surfaces work requiring a code repair, resolve it before beginning the full-PR review.

If the update cannot publish its changes or the PR description edit fails, preserve the work, report the blocker, and do not claim completion.

## Step 9 — Review and resolve the full pull request

After the canonical plan and PR description match the completed feature:

1. Delegate `ai/tasks/feature/review-pull-request.md` to a fresh subagent with the recorded PR number and the canonical source plan. Do not apply the focused-commit override; this is the first review of the aggregate PR diff.
2. Read `./product/backlog/pull-request.md` and resolve every entry in file order, one at a time, using `work-pull-request-issue.md` as described in Step 6. Do not start another review while any entry remains.
3. After the backlog drains, repeat the full-PR review. If it records findings, drain them one at a time before the next review. Continue until a full review records no new findings and the backlog remains empty. If deduplication means every finding was already present, drain the existing entries and review again.
4. Confirm all commits are pushed, the PR is still open on the recorded branch, and the working tree is clean.

If a review or repair is blocked, preserve the PR and outstanding backlog, report the blocker, and do not claim completion.

## Step 10 — Final verification and report

Confirm the PR is still `OPEN`, its remote head matches local `HEAD`, the working tree is clean, every source-plan requirement is covered, all subplans have completed and improved plans, all required checks passed, and no PR backlog work remains. Do not merge the PR.

Report in this shape:

```text
Plan:       <source plan path and original complexity>
Subplans:   <count> completed, all rated below 7/10
Commits:    <count> implementation commits pushed to <branch>
Reviews:    <count> focused subplan reviews and <count> full PR reviews; <count> work items resolved
Checks:     <diff-scoped verification results>
PR:         <url> (#<number>), open
Updated:    <what update-pull-request changed> | already in sync
Status:     complete | blocked — <reason>
```
