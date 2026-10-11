# Create an ai/tasks/workspace/fix-build.md task modelled on ai/tasks/workspace/resolve-conflicts.md

**Complexity: 2/10** — one new task document and its behavior specification, reusing existing PR and validation tools.

**Minimalism:** reuse the existing branch preparation, validation, commit, push, and check-waiting tools. Add no scripts, dependencies, picker registration, or automated tests of task wording.

Create a workspace task that takes a failing build to a passing state locally and on GitHub. It must determine the root cause before making repairs, judge implementation and tests against the specification, and report the cause and verification evidence at completion.

## Design decisions

- The new task belongs at `ai/tasks/workspace/fix-build.md` and follows the structure and workflow conventions of `ai/tasks/workspace/resolve-conflicts.md`.
- Target selection and publication match `resolve-conflicts.md`: accept an explicit PR number, URL, or head branch; otherwise use the current branch's open PR, falling back only to the sole open PR. Stop on an ambiguous, missing, or non-open target. Push repairs to that PR's own head branch and leave it open; never merge it or open a replacement PR.
- Root-cause diagnosis precedes corrective changes. A failing assertion alone does not establish whether the code or the test is wrong.
- Revise code that does not implement the specification correctly.
- Revise tests whose expected behavior does not match the specification.
- Revise test mechanics that fail to exercise or observe the actual code correctly, including cases where both intended behavior and test expectations are correct.
- Never simply delete failing tests to make the build pass.
- Preserve the behavior each failing test is meant to cover. Skipping, quarantining, replacing assertions with tautologies, mocking away the implementation, narrowing test discovery, accepting snapshots blindly, or weakening lint and coverage checks cannot substitute for repairs.
- Completion requires both local and GitHub passes and a final report identifying the root cause.
- When specifications and approved PR requirements do not settle intended behavior, infer it from surrounding code and tests. Record the inference and its supporting evidence in the diagnosis and final report; do not present an inference as an explicit specification or override a clear specification with current code.
- Repairs are limited to implementation and tests. Build scripts, CI configuration, and dependency versions are not repair targets; if a diagnosed failure requires changing them, report the cause and blocker and leave the PR open. Routine branch dependency preparation still follows the existing audited preparation task.
- Use the task title “Fix a Failing Build on an Open Pull Request”. The final report uses the fields PR, Branch, Specification, Root cause, Repairs, Local build, GitHub checks (including run link and tested commit), and Status.
- Run autonomously, preserve unrelated user work, stay inside the project directory, and use the reference task's single-author Conventional Commits and no-attribution conventions. The task must never run `npm run check`.

## What already exists (reuse, don't rebuild)

| Existing artifact | Reuse |
| --- | --- |
| `ai/tasks/workspace/resolve-conflicts.md:32`, “Step 0 — Identify the pull request” | Open-PR selection; Steps 1, 2, 7, and 8 provide branch preparation, intent gathering, commit and push, and head verification. |
| `ai/tasks/workspace/prepare-workspace.md:10`, “Step 2 — Install dependencies” | Dependency audit, install, and Step 3 native dependency preparation; execute only Steps 2 and 3 to preserve the PR branch. |
| `scripts/pr-check-gate.sh:12`, `HARD=(typecheck lint test)` | Full local typecheck, lint, and test gate. It does not run a production build or a separate CSS command. |
| `package.json:9`, `build` | This checkout's production build runs the server compiler and web bundler through `npm run build`. |
| `scripts/pr-wait-checks.sh:7`, `gh pr checks --watch` | Wait for PR checks; its no-checks success behavior cannot alone prove that GitHub passed. |
| `.github/workflows/ci.yml:13`, `typescript` | Current PR CI runs typecheck, lint, and tests on Ubuntu and Node 24, without a production-build job. |
| `src/tasks.ts:11`, `walk`, and `product/specs/task-picker.md:62`, “Listing” | Tasks are discovered recursively; a new workspace markdown file needs no registration code. |

## Proposed changes

Add the single task markdown file during implementation. Model its permissions, ordered steps, and report on the conflict-resolution task, replacing mandatory conflict repair with failure evidence collection, specification comparison, root-cause determination, repairs, local validation, publication, and GitHub validation.

### 1. Identify and prepare the PR

Reuse the reference task's explicit or contextual selection and OPEN-state checks. Before checkout, inspect the working tree and stop if unrelated uncommitted work would be carried into the repair. Check out the recorded head branch, pull through its upstream, confirm the branch, and execute only dependency-preparation Steps 2 and 3. A checkout, pull, or preparation failure is reported without changing targets. Do not automatically rebase onto `master` or run the conflict-resolution task as part of initial build diagnosis.

### 2. Gather the intended behavior and failing evidence

Read the PR plan when present, relevant `product/specs/` files, and the PR title and body. With no plan, use the PR body and commit subjects as the reference task does. Explicit specifications govern code and tests; only unresolved behavior uses the user-approved inference rule.

Record the current commit, existing CI job names and run links, failing commands and logs, expected behavior, and observed results. Discover commands from the target project's package scripts and workflows. Read PR checks using `gh pr checks` and failed workflow logs using `gh run view <run-id> --log-failed`; use run metadata to associate logs with the targeted head or GitHub's tested PR merge commit. Old failures remain historical evidence, never proof that the current head fails.

Reproduce the failure locally using its focused command and, as appropriate, the production build and local gate. A CI-only failure still needs an evidence-backed diagnosis of the environment difference, such as worker isolation, filesystem assumptions, fake timers, or async cleanup. Capture each expensive command once; reuse its output rather than rerunning solely to filter logs. Do not alter code or tests to probe a speculative fix before identifying the cause.

### 3. Determine the root cause before repairs

For each independent failure, state the failing command or job, specification path and requirement (or recorded inference), expected and observed behavior, causal explanation with code/test evidence, and why the proposed repair addresses it. Classify it as an implementation defect, incorrect test expectation, defective test mechanics, or a cause outside the allowed repair scope. Multiple classes can coexist; diagnose each rather than declaring all failures downstream of one without evidence.

Inspect whether tests invoke the real implementation, await the work under assertion, set up realistic inputs and mocks, control timers correctly, observe the right output, isolate shared state, and release resources. An assertion failure alone proves neither that production code is wrong nor that expected results should change. If no cause can be established, report the investigation and stop instead of making speculative repairs. An infrastructure defect is reported as blocked because the user limited repairs to implementation and tests.

### 4. Repair the diagnosed defects

Change only implementation and tests needed to correct the established causes. Correct implementation to satisfy the specification; correct expectations that misstate the specification; correct test mechanics when intended behavior and expectations are already right. Each corrected test must still exercise the implementation and assert the intended behavior. Add or refine a focused regression test where it can expose the diagnosed defect; for a test-mechanics repair, demonstrate that the repaired test reaches and observes the production code rather than adding a test of the test itself.

Do not edit specifications or PR requirements to make a failing implementation acceptable. Build-script, workflow, dependency, rule, and unrelated documentation edits are outside this repair task. Run the diff-scoped check after each repair. Newly exposed failures return to diagnosis before further corrective edits.

### 5. Prove the local build

Require the focused failing commands, actual production build, and full `pr-check-gate` to pass before publishing. In this checkout the build command is `npm run build`; other projects use their discovered equivalent. Run other failing workflow commands locally when available. Missing tools or inaccessible environment checks are reported as unverified, never passed.

Explain that `check-diff` checks only uncommitted work and may do nothing after a commit or clean rebase. The full local gate and production build provide the local completion evidence. Do not rerun broad gates unless subsequent edits, a changed commit, or a new failure invalidates their results.

### 6. Commit and push to the same PR

Reuse `pr-commit` for a Conventional Commit explaining the root cause and repairs, then `pr-push-branch` for publication to the recorded head branch. Inspect the working-tree diff before staging everything to ensure only permitted repairs ship. If there are no uncommitted repairs, do not rely on `pr-check-changes` to detect that: it also reports pre-existing PR commits ahead of `master`. Skip the repair commit and proceed to verifying the existing remote head.

For a rejected push caused by concurrent branch changes, follow the reference task's bounded three-attempt pull/rebase and retry procedure, preserving both contributors' intent. Re-diagnose any new failures and rerun local build proof before pushing the changed commit. Stop on conflicts requiring edits outside the repair scope. Never use a bare force-push, merge or close the PR, or open a replacement.

### 7. Require GitHub proof for the published head

Record the published SHA and confirm the PR remains OPEN with `headRefOid` matching local HEAD. Wait through the existing `pr-wait-checks` helper and inspect check details afterward; do not trust its zero exit code when checks are absent. Confirm that every applicable build/validation job ran and succeeded for this head, or a PR merge commit whose head parent is this published SHA. Link the runs and name both the published and tested commit when different.

Absent, queued, pending, cancelled, skipped, inaccessible, or stale results cannot establish a GitHub pass. Conditional jobs that do not apply are identified separately; all applicable jobs must succeed. If CI fails after a local pass, read the new logs, return to root-cause diagnosis, make only permitted repairs, prove locally, and push another repair commit. A rerun alone cannot establish that a flaky test was repaired. Stop with a blocker when CI cannot run or a diagnosed cause lies outside scope; preserve work and report failed or unverified evidence. If the PR closes externally or its head changes, report that state or validate the new head before claiming success.

The current CI has no production-build job. The task proves the production build locally and all configured CI validation jobs on GitHub, stating this limit rather than claiming GitHub ran a production build or modifying CI to add one.

### 8. Report the cause and both validation outcomes

Use exactly the agreed field labels: PR, Branch, Specification, Root cause, Repairs, Local build, GitHub checks, and Status. Specification identifies paths and requirements, including any inference. Root cause includes the category, causal explanation, and evidence, not merely a failing test name. Local build lists commands and results. GitHub checks lists run links, job outcomes, and the published and tested commits. Status is `complete; PR open` only when local and GitHub proof both hold, otherwise `blocked` with the concrete reason. Provide the same fields on early stops, marking unavailable evidence as unverified and the root cause as undetermined if necessary.

Update the matching task behavior documentation in `product/specs/task-picker.md` during implementation. No task-picker source change is required.

## Tests

This change is an instruction document. Validate its decision paths manually rather than adding tests that repeat its wording. Review examples of implementation defects, incorrect test expectations, and faulty async, mock, timer, or cleanup mechanics. Check that each requires diagnosis before repair and retains meaningful tests.

Review local-pass/CI-fail, multiple causes, missing/ambiguous specs, infrastructure defects, already-green heads, and missing/stale/skipped CI cases. Confirm the task cannot report an unverified GitHub pass, alter requirements, discard test coverage, or ship unrelated work. Confirm the final report contains the diagnosis and evidence for both environments, including blocked outcomes.

## Out of scope

Deleting failing tests merely to obtain green checks, unrelated cleanup, changing build scripts, CI configuration, or dependency versions, and changing product requirements to justify incorrect behavior are outside the goal. This planning run produces only the draft plan; implementation creates the task and its matching specification documentation later.

## Verification

Run `$janissary/scripts/run.mjs check-diff` while editing (use `./scripts/run.mjs check-diff` in this checkout). Manually walk the proposed task against `resolve-conflicts.md`, the actual local gate, and the GitHub workflow. Verify that root-cause diagnosis is mandatory before repair, code and tests are judged against the specification, failing coverage cannot be discarded, and success requires local and GitHub evidence.
