# Build a Complex Feature

Take one supplied plan and deliver the complete feature on one open pull request. Keep plans rated 1–5 intact; decompose plans rated 6–10 once with `decompose-plan.md` into ordered subplans. Publish the subplans before implementation. Then publish each implementation as a separate commit, review that commit, decline any finding that a later subplan delivers or that the plan places out of scope for the feature, work every other finding that review records, and run a resolution review of the repairs before proceeding. After all work units are complete, update the canonical plan and pull request, then review the full pull request and resolve findings until a full review adds none. A full-PR review whose findings are all pull request description or documentation corrections needs no follow-up review once those corrections are made. Then test the pull request, resolve every test finding, and retest until a test pass adds no findings and the backlog is empty. Finish with another pull request update.

Invocation: `execute ./ai/tasks/feature/build-a-complex-feature.md <plan name or path>`.

**Run autonomously.** Do not ask the user questions or wait for feedback. Resolve decisions from the supplied plan, repository instructions, specs, and existing behavior. Stop only for an explicit blocked condition in this task or a child task.

**Use fresh subagents for each work step.** Delegate plan decomposition, each plan-improvement pass, each subplan implementation, each PR review, each behavioral test pass, each review or test repair, and each PR update to fresh subagents. Give each subagent only the files, decisions, constraints, and recorded identifiers it needs for its step. The orchestrator retains the overall plan, subplan order, branch and PR identity, and completion state; pass those facts explicitly instead of relying on earlier subagent context. Do not run dependent steps concurrently.

**Project paths and task resolution.** `./product/` refers to the project in the current working directory. Resolve child tasks from this project's `ai/tasks/` first, then `$janissary/ai/tasks/` if absent. Read the resolved task before delegating it. If a required task or runner is unavailable, stop and report the blocker rather than inventing a replacement.

**No AI attribution.** Do not add AI authorship notes, generated-by lines, or co-author trailers to plans, code, commits, or pull request text.

## Orchestration rules

- The supplied plan is the authoritative feature scope. Do not reject it, weaken it, lower its rating.
- Plans rated 1–5 are not decomposed: use the original source plan as the sole work unit. For plans rated 6–10, decompose all planned behavior once with `decompose-plan.md` into ordered subplans. The decomposition task owns improvement, honest rerating, and ready promotion without resplitting. 
- In the single-plan route, every reference to a subplan means the sole source-plan work unit unless an explicit exception below applies. Run publication, improvement, implementation, focused review and repairs, full review, and PR updates on the same branch and PR. Never create a duplicate plan or fold the canonical plan into itself.
- Use one feature branch and one pull request for the entire feature. Publish all improved ready subplan plans and open the PR before implementing any subplan. Every plan update, implementation, and repair is committed and pushed to that same branch and PR. Never create another PR.
- Each subplan review covers only its newly published implementation commit, through the review task's `scope: commit` argument. Do not review the aggregate PR diff during the subplan cycles. The review reads no subplan, so first decline every resulting PR backlog item whose proposal delivers work a later subplan owns or work the plan's `Out of scope` list excludes from the feature, as Step 6 item 2 describes. Work every remaining item, one at a time in file order, before any further review runs. The review that follows is a resolution review: through `scope: range`, it reviews only the repair commits, for regressions and new defects. Repeat until a resolution review records nothing, then start the next subplan.
- A full-PR review in Step 8 whose findings are pull request description only or documentation only needs no follow-up review. Focused subplan cycles always run their resolution review. Classify every entry when you record or read the backlog, before any repair starts. When every entry is description-only, work them as usual, then confirm the repair range changed only fix plans under `./product/plans/complete/` and `./product/backlog/pull-request.md`, and that `gh pr view <number> --json body` shows each correction. If both checks pass, proceed as though the review had recorded nothing: no full re-review runs to check description corrections. If any entry calls for another change, or either check fails, the normal follow-up review runs.
- After every subplan and its focused review/repair cycle is complete, consolidate the canonical plan and update the PR description. Then review the full PR. Drain every finding one at a time and repeat the full review/repair cycle until a full review adds no findings and the backlog is empty. The PR remains open throughout; never merge or close it.
- Preserve the repository's dependency audit, diff-scoped checks, test requirements, security rules, and task-specific publication safeguards. Never run `npm run check`.
- If a child task's standalone behavior conflicts with this orchestration, apply only the explicit overrides below and retain every other child constraint.

## Step 0 — Validate and prepare

1. Require a plan name or path that resolves to a plan in `./product/plans/ready/`. If none is supplied or no plan matches, report the reason and stop. Do not choose an unrelated plan.
2. Read the selected plan in full and confirm it states the feature goal, implementation scope, tests, verification, and a complexity rating. If any are missing, report the issue and stop; do not invent or improve the source plan here. Record whether its rating selects the single-plan route (1–5) or decomposition (6–10).
3. Read `AGENTS.md`, every file under `ai/guidelines/`, and the relevant project specs and implementation references. Read the task files used below, including `build-a-feature.md`, `decompose-plan.md`, `improve-plan.md`, `review-pull-request.md`, `work-pull-request-issue.md`, `update-pull-request.md`, `test-pull-request.md`, `open-plan-pull-request.md`, `ai/tasks/workspace/fix-build.md`, and `ai/tasks/workspace/resolve-conflicts.md`.
4. Confirm the working tree is clean before workspace preparation. Preserve unrelated work and stop if the tree is not clean.
5. Delegate `ai/tasks/workspace/prepare-workspace.md` to a fresh subagent and require it to complete the task in full. Stop if its required audit or preparation fails. Confirm the tree is clean afterward.

## Step 1 — Decompose the plan

For a source plan rated 1–5, skip decomposition. Record the original plan as the sole work unit, with all source requirements mapped to it and no subplan files. Continue to Step 2 and all subsequent stages.

Delegate this step to a fresh subagent. Provide the source plan's path and the relevant repository constraints. The subagent opens `ai/tasks/planning/decompose-plan.md` and executes every step in order, except `Step 0 — Prepare the workspace` and `Step 1 — Pick the plan`, with the source plan as the target. That task places subplans in `./product/plans/ready/`, moves the source plan unchanged to `./product/plans/complete/`.

## Step 2 — Publish all subplans and open the PR

After decomposition, and before implementing any work unit:

1. Create one descriptive feature branch. In one commit with a Conventional Commit subject, add all improved subplan plan files from `./product/plans/ready/` and move the original source plan from `./product/plans/ready/` to `./product/plans/complete/` with `git mv`, then push it to the remote. For a decomposed plan, the decomposition task already made that move in Step 1; stage it as made rather than moving the plan again. Stage only the subplan plans and the source plan move; do not include unrelated changes. This first commit then adds exactly one plan under `./product/plans/complete/`, so `update-pull-request.md` identifies the source plan as the pull request's own plan.
   For the single-plan route, there are no subplan files: publish only the source plan move in this first commit. Record its completed path as the sole work unit's path for the remaining stages.
2. Delegate `ai/tasks/workspace/open-plan-pull-request.md` to a fresh subagent to open the PR against `master`. That task writes the short plan summary and owns the plan-first PR workflow; it is the dedicated plan counterpart of `open-feature-pull-request.md`, which writes the full body for PRs opened from working code. Override the plan task's branch/commit steps because the plan commit is already pushed; it must not create a second branch or duplicate the commit. Preserve its check gate and no-merge rule.
3. Record the PR number, URL, and head branch. Confirm it is `OPEN`, points to that branch, and its remote head matches the published commit. If publication fails, preserve local work and stop with the concrete blocker.

## Step 3 — Prepare one work unit for implementation

For the single-plan route, confirm the plan is in ready and has a rating of 1–5.

For decomposed subplans, confirm the plans are in ready. Process the recorded ready paths strictly in sequence. 

## Step 4 — Implement one subplan

For each promoted subplan, delegate `ai/tasks/feature/build-a-feature.md` to a fresh subagent with the exact ready-plan path. It must implement only that subplan, run its required diff-scoped checks after each implementation change, write/update the functional specs, and promote that plan to `complete/`.

Implementation is not complete until that subplan's diff-scoped checks (`$janissary/scripts/run.mjs check-diff`) are green. A step that fails to compile until a later subplan lands is not acceptable: each subplan must build on its own at its own commit. If a subplan cannot be made green without editing files outside its plan, that is a scope mismatch rather than a tolerance to record; preserve the work and report the blocker instead of proceeding.

Apply these overrides to `build-a-feature.md`:

1. Select the supplied plan even if the original feature plan is rated 6 or higher. 
2. Reuse the prepared workspace; override Step 0 and do not run workspace preparation again.
3. Do not run the build task's PR-opening handoff, its review-and-repair cycle, or its pull request update. The orchestrator commits and pushes each implementation to the existing feature PR branch after implementation, as specified in Step 5, reviews that commit in Step 6, and reviews and updates the full PR in Steps 8 and 9.
4. Keep the original high-complexity plan and the improved subplan plans with the delivered work. Do not expand a subplan's planned file scope or resplit it. If its plan no longer covers the required implementation, preserve the work and report the scope mismatch as a blocker.

For the single-plan route, explicitly override the build task's ready-plan selection and promotion steps: implement the canonical source plan at its recorded `complete/` path and leave it there. Apply overrides 2 and 3 above unchanged, preserve the plan's 1–5 rating and scope, and run all implementation, test, spec, publication, and focused-review stages. Do not create a second completed plan.

The subagent reports the completed plan path, implementation summary, checks, tests, specs, and any blocker. The orchestrator verifies the subplan is complete and its working tree changes are limited to the planned work before publication.

## Step 5 — Commit and push each implementation

After each subplan passes implementation verification, commit only that subplan's implementation and plan promotion with a Conventional Commit subject, then push to the existing PR head. This must be a separate commit from the plan-publication commit. Never amend or force-push. If the remote advanced, use the repository's bounded rebase-and-retry policy, preserve both sides of conflicts, and rerun the required diff-scoped checks before retrying. Once the push succeeds, read the implementation commit SHA with `git rev-parse HEAD` and hand that value to Step 6 item 1, so a rebase-and-retry cannot leave a stale SHA behind. Confirm the PR remains open on the recorded branch before reviewing it.

Before publishing a subplan, confirm its diff-scoped checks are green. Do not commit or publish a red subplan; if its checks are red, keep the work on the branch, report the blocker, and do not advance to review.

## Step 6 — Review and resolve each subplan

After every subplan implementation commit is published, complete this cycle before advancing:

1. Delegate `ai/tasks/feature/review-pull-request.md` to a fresh subagent with the recorded PR number and `scope: commit <implementation commit SHA>`, for example `execute ./ai/tasks/feature/review-pull-request.md 232 scope: commit 1a2b3c4`. Preserve the review task's clean-tree requirement, deduplication, no-fix, no-tooling, backlog-only commit, and open-PR rules. When the review finishes, read its Step 7 report before reading the backlog and confirm its `Scope:` line reads `commit <short-sha>`, with that short SHA a prefix of the implementation commit SHA. Any other value, including `aggregate — requested "<value>" ignored`, means the review did not run in the scope it was given: treat it as blocked under the paragraph after this list, and work none of its entries.
2. Read the PR's `./product/backlog/pull-request.md`. If it holds no entries (or only the required empty-file skeleton), skip to item 6. Otherwise decline every entry that belongs to a later subplan or that the plan placed out of scope for the whole feature, before any repair starts. The review read no subplan, so it can't tell a gap in this subplan from work the decomposition deliberately deferred, such as the old symbol an additive three-step transition keeps until its third subplan, or from work the plan deliberately excluded from the feature. Compare each entry's proposal with the current subplan's `Out of scope` list, the `Requirements` of every subplan after it in the recorded order, and the requirement-to-subplan coverage map. In the single-plan route, the `Out of scope` list is the source plan's own. Remove each entry whose proposal delivers behavior a later subplan owns, and each entry whose proposal delivers behavior the current subplan's `Out of scope` list excludes and no later subplan owns, whole, from its lead `*` bullet through its `Proposal` paragraph, and leave every other entry byte-for-byte unchanged, restoring the empty-file skeleton when none remain. Record each declined entry's summary bullet with the subplan that owns it, or with "out of scope" when the plan excludes it from the feature, for the Step 10 report. If you removed any, commit only `./product/backlog/pull-request.md` with a Conventional Commit subject and push it to the PR head under Step 5's push rules. When the final subplan or the single-plan route's sole work unit is under review, no later subplan exists, so no entry is declined for a later subplan, but the out-of-scope decline still applies. If no entries remain after declining, skip to item 6. Otherwise record the PR head SHA before any repair starts. It is the base of the resolution review's range.
3. Work every remaining entry before any further review runs. Resolve them in file order by delegating one at a time to a fresh subagent running `ai/tasks/feature/work-pull-request-issue.md` with the explicit PR number and an entry selector. Finish and verify publication of each item before selecting the next. Do not review a repair commit as it lands. Preserve that task's tests, scope, and branch safeguards; override only its complexity-7 cutoff so recorded review work is not abandoned for its rating.
4. Once the backlog is empty, read the current PR head SHA and record it as the range head SHA before delegating. Then delegate `ai/tasks/feature/review-pull-request.md` to a fresh subagent as a resolution review, with the PR number and `scope: range <recorded head SHA>..<current PR head SHA>`, where the current PR head SHA is that recorded range head SHA. Preserve the same review-task rules as item 1. When the review finishes, read its Step 7 report before reading the backlog and confirm its `Scope:` line reads `range <base>..<head>`, with that `<base>` a prefix of the recorded head SHA and that `<head>` a prefix of the recorded range head SHA. Never compare `<head>` with a PR head read after the review, which has moved whenever the review pushed findings. Handle any other value as item 1 does.
5. If the resolution review records findings, repeat items 2 through 4 with the new entries and a new recorded head SHA. Continue until a resolution review records no new findings and the backlog is empty.
6. Finish only when the reviewed implementation and all its repairs are published and the backlog is empty (or contains only the required empty-file skeleton). Confirm all commits are pushed, the PR is still open on the recorded branch, and the working tree is clean before proceeding to the next subplan.

If a review or repair is blocked, preserve the PR and outstanding backlog, report the blocker, and stop rather than starting the next subplan.

## Step 7 — Continue through all subplans

Repeat Steps 3 through 6 in order for every remaining subplan. Before starting each, verify all earlier subplans are complete, published, focused-reviewed, repaired, resolution-reviewed, and have no unresolved backlog entries. Keep the same branch and PR for the entire sequence.

After the final subplan's focused review cycle is complete, verify the requirement-to-subplan coverage map against the delivered code, specs, tests, and plan files. If source-plan requirements are missing, write items in the pull request backlog and work them one by one until they are resolved.

Once every requirement is delivered and all focused review backlogs are empty, confirm the original source plan is still in `./product/plans/complete/`, where Step 2 moved it. This original plan is the canonical record of the full feature; keep its original complexity rating and incorporate the completed subplans' final outcomes during the update step.

## Step 8 — Review and resolve the full pull request

After the canonical plan and PR description match the completed feature:

1. Delegate `ai/tasks/feature/review-pull-request.md` to a fresh subagent with only the recorded PR number, so it runs in its default `aggregate` scope. This is the first review of the aggregate PR diff.
2. Read `./product/backlog/pull-request.md`. Before the first repair, record the PR head SHA and classify each entry as description-only or not, as defined in the orchestration rules. Then resolve every entry in file order, one at a time, using `work-pull-request-issue.md` as described in Step 6. Do not start another review while any entry remains.
3. After the backlog drains, decide whether another full review runs. If every entry the review recorded was description-only, confirm the repair range from the recorded head SHA to the current PR head changed only fix plans under `./product/plans/complete/` and `./product/backlog/pull-request.md`, and that `gh pr view <number> --json body` shows each correction. If both checks pass, go to item 4 without another full review. Otherwise repeat the full-PR review and handle its findings as in item 2 and this item. Continue until a full review records no new findings and the backlog remains empty, or until every entry it recorded was description-only and this item's checks pass. If deduplication means every finding was already present, drain the existing entries and review again.
4. Confirm all commits are pushed, the PR is still open on the recorded branch, and the working tree is clean.

If a review or repair is blocked, preserve the PR and outstanding backlog, report the blocker, and do not claim completion.

## Step 9 — Update the pull request

Delegate `ai/tasks/feature/update-pull-request.md` to a fresh subagent with the recorded PR number before the full-PR review. Its Step 3 plan discovery finds the canonical plan from the branch's first commit, which moved the original source plan into `complete/` in Step 2. Confirm the plan it identifies is the source plan recorded in Step 0; if it identifies another plan or none, stop and report the blocker. Its Step 4 treats every completed subplan plan the way it treats a fix plan: it folds the subplan into the canonical plan and removes the subplan file from `product/plans/complete/`. The source plan's original complexity rating remains unchanged. The subagent updates the PR description, canonical plan, specs, and applicable help pages under `help/` to match the final code, then commits and pushes on the same branch. Preserve the update task's prohibition on source changes, its clean-tree and target checks, and its no-merge rule. If this update surfaces work requiring a code repair, resolve it before beginning the full-PR review.

If the update cannot publish its changes or the PR description edit fails, preserve the work, report the blocker, and do not claim completion.

### Test, repair, and update again

After the initial update above and the full-PR review in Step 8 complete, run this cycle before final verification:

1. Delegate `ai/tasks/feature/test-pull-request.md` to a fresh subagent with the recorded PR number. Preserve all of its attached-browser, base-branch instruction, dependency, scratch-instance, teardown, backlog-only publication, and no-merge safeguards. Do not substitute reading the testing steps for executing them.
2. Require the test task to complete and publish its findings. If testing is blocked, including a missing attached browser, failed startup, browser loss, incomplete teardown, or failed publication, preserve the PR and outstanding backlog, report the blocker, and stop. Do not treat an incomplete run as a clean test pass.
3. Read the PR backlog after testing. If entries remain, drain every entry in file order before another test pass: delegate `ai/tasks/feature/work-pull-request-issue.md` to a fresh subagent for each entry with the recorded PR number and an explicit selector. Preserve its tests, scope, and branch safeguards and apply Step 6's complexity-cutoff override. Verify each repair is published to the same branch and PR before selecting the next entry. Stop and report any blocked repair.
4. After any repairs, repeat items 1 through 3. Retest even when every repaired finding was description-only; the review exception does not waive behavioral testing. Exit this cycle only when a completed test pass adds no new backlog entries and the backlog is empty (or contains only its required empty-file skeleton).
5. Delegate `ai/tasks/feature/update-pull-request.md` again to a fresh subagent with the recorded PR number. Apply the same canonical-plan discovery and update safeguards described above, then confirm the final update is published and the PR remains open. If this update surfaces a code repair, resolve it and repeat the test/repair cycle and final update before proceeding. A blocked update stops completion.

## Step 10 — Final verification and report

### Repair conflicts and failing checks

After the final update, verify the published feature head before claiming completion. Run this recovery sequence at most three times; each recovery task retains its own scope, diagnosis, test, dependency, publication, and retry safeguards.

1. Confirm the recorded PR is still `OPEN` on the recorded head branch, its remote head matches local `HEAD`, and the working tree is clean. Record its base branch and published head SHA. Inspect mergeability against that primary branch with `gh pr view <number> --json state,headRefName,headRefOid,baseRefName,mergeable`. Poll an `UNKNOWN` result until known; if it cannot be determined, stop and report the blocker rather than assuming there are no conflicts.
2. If the result is `CONFLICTING`, delegate `ai/tasks/workspace/resolve-conflicts.md` to a fresh subagent with the recorded PR number. Require it to preserve both sides' intent, verify the canonical plan, pass its hard gate, publish to the same head branch, and leave the PR open. The current workflow targets `master`; if the recorded base differs from the recovery task's supported primary branch, stop and report the mismatch rather than rebasing onto another target. A blocked or unsuccessful conflict resolution stops completion.
3. Run `$janissary/scripts/run.mjs pr-check-gate` for the current head to verify local typecheck, lint, and tests; never run `npm run check`. Inspect `gh pr checks <number>` and the configured GitHub jobs for the published head or its current PR merge commit. Wait for queued or running checks to finish. If the local gate fails or current-head CI checks fail, delegate `ai/tasks/workspace/fix-build.md` to a fresh subagent with the recorded PR number, explicitly selecting pull request mode. Never invoke it without that number, which would select master mode. Preserve its root-cause diagnosis, implementation-and-tests-only repair scope, production-build and hard-gate proof, and published-head GitHub proof. A blocked build repair stops completion.
4. Require local success and successful configured GitHub jobs for the current published head or its current PR merge commit. Absent, stale, skipped, cancelled, inaccessible, queued, or pending checks do not establish success; report unavailable proof as blocked. Do not claim CI ran a production build when no such job exists. After either recovery changes the branch, return to Step 9's test/repair cycle and final update, then restart this final verification on the new published head. Never reuse proof from a previous head.
5. Finish only when mergeability is `MERGEABLE`, the required local and current-head CI proof passes, the test cycle and final update are published, and the same PR is still open with a clean, synchronized checkout and no backlog entries. If recovery still requires another pass after three sequences, stop and report the unresolved failures or conflicts with the PR left open. Never merge, close, or replace the feature PR during recovery.

Confirm the PR is still `OPEN`, its remote head matches local `HEAD`, the working tree is clean, every source-plan requirement is covered, all subplans have completed and improved plans, all required checks passed, the behavioral test cycle completed without new findings, the final PR update is published, and no PR backlog work remains. Do not merge the PR.

Report in this shape:

```text
Plan:       <source plan path and original complexity>
Work units: <count> completed; source plan intact at 1–5/10 | decomposed subplans initially rated 1–4/10, final ratings <list>
Commits:    <count> implementation commits pushed to <branch>
Reviews:    <count> focused subplan reviews, <count> resolution reviews, and <count> full PR reviews; <count> work items resolved
Declined:   <each focused or resolution finding declined in Step 6, with the later subplan that owns it, or "out of scope" when the plan excludes it from the feature> | none
Tests:      <behavioral test passes and findings resolved; blockers if any>
Checks:     <diff-scoped verification results>
PR:         <url> (#<number>), open
Updated:    <what update-pull-request changed> | already in sync
Status:     complete | blocked — <reason>
```
