# new ai task

**Complexity: 3/10** — existing workflow extraction and file moves, with correctness dependent on updating task handoffs, relative links, and fixtures across several consumers; no new runtime mechanism.

Split pull-request issue work into its own task and group feature and pull-request playbooks under `ai/tasks/feature/`. The user selected the existing ready backlog proposal so each issue task has one delivery target and related task prompts appear together in the picker.

## Design decisions

The user selected the ready backlog proposal: “work an issue should be updated to work only on master and work-pull-request-issue should only work on a pr specified when executed.” The new entry point is `ai/tasks/feature/work-pull-request-issue.md`, modeled on the existing PR mode in `work-an-issue.md`.

The selected proposal also says to “move *-pull-request.md, *-feature.md into the feature directory” and move `auto-build.md` there as `auto-build-a-feature.md`. The current matching files are `review-pull-request.md`, `test-pull-request.md`, `update-pull-request.md`, `build-a-feature.md`, `plan-a-new-feature.md`, and `remove-an-existing-feature.md`. The workspace PR-opening task already lives under `workspace/` and has a different filename.

Existing executable tasks are Markdown instruction documents under `ai/tasks/`. Existing file discovery supports the proposed directory without runtime changes. The four implementation-question checks are no: this is an extension of existing playbooks, adds no protocol, introduces no concurrency mechanism, and has a close precedent.

The user chose positive PR numbers, `#number` references, and GitHub PR URLs as the accepted explicit targets for `work-pull-request-issue`. An optional backlog-entry selector may follow the target. Head branch names are not accepted. Missing, invalid, or closed targets stop without changing files.

For missing or malformed targets, the user chose the exact report wording `Status: blocked` and `Reason: explicit pull request number, #number, or PR URL required`. Lookup failures and closed PRs retain their specific reasons.

The user chose to treat every argument to `work-an-issue` as ordinary issue text, including numbers, `#number` references, and PR URLs. It never selects PR mode or redirects based on the argument's format. Its existing ordinary lookup applies: match an issue in master's backlog when possible, otherwise use the supplied text as a new work item without adding it to the backlog.

The user chose to move tasks without compatibility wrappers at the old paths. Each relocated playbook has one file and one picker entry at its new path. Existing invocations of moved paths must use the new locations; no forwarding task or alias is added.

The user chose to update active playbooks, current specs, user documentation, and runnable examples or test fixtures, preserving historical completed plans. `work-an-issue.md` remains at the task root; `workspace/open-feature-pull-request.md` stays in its existing directory. The selected ready backlog entry is removed when this plan is complete; the ACP skill entry remains untouched.

## What already exists (reuse, don't rebuild)

| Existing mechanism | Established behavior |
| --- | --- |
| `src/tasks.ts:49`, `listTasks`, and `src/tasks.test.ts:45`, recursive listing | Discovers Markdown tasks recursively from the project and installation; the project copy wins when paths match. Reuse discovery without changing its behavior. |
| `ai/tasks/work-an-issue.md:47`, `Step 0`, and its PR branches in Steps 1, 7, and 8 | Supplies explicit-target preparation, selection, entry removal, publication retries, and description correction for the new standalone task. |
| `ai/tasks/work-an-issue.md:84`, `Step 2` | Supplies shared planning, implementation, tests, specs, and affected documentation procedures; retain them in both standalone instruction documents. |
| `ai/tasks/auto-build.md:72`, `Draining the PR backlog` | Already sends a numeric PR target and optional selector; change its task route while preserving its orchestration policy. |
| `ai/tasks/review-pull-request.md:147`, proposal prefix, and `ai/tasks/test-pull-request.md:212`, `Proposal` | Generate repair invocations. Both currently use the obsolete ordinary-task route and quoted `PR <number>:` text. |
| `scripts/test-pull-request-playbook.test.mjs:11`, `playbook` | Reads the testing prompt from disk and pins security-relevant behavior. Update its read path and preserve its assertions. |
| `product/specs/task-picker.md`, `product/specs/pull-request-review.md`, `product/specs/pull-request-updating.md`, and `product/specs/pull-request-testing.md` | Describe task discovery, orchestration, and PR follow-up work. |

## Proposed changes

### 1. Separate the two issue workflows

Edit `ai/tasks/work-an-issue.md` to retain only ordinary work. Preparation starts from master; implementation uses the existing feature-branch merge workflow, so “only on master” means the issue source and delivery target, not editing master directly throughout the run. Keep the ordinary named-item fallback, complexity policy, tests, specs, affected documentation, completed-plan handling, and final merged report. Remove PR-only allowances, prohibitions, conditional steps, and report variants. The root task never reads the pull-request backlog or edits an existing PR's description.

Create `ai/tasks/feature/work-pull-request-issue.md` as a standalone instruction document by extracting the existing PR branches and shared repair steps. It resolves only the explicitly supplied PR, checks it is open, checks out its recorded head branch, pulls with rebase, and runs dependency-only preparation. Missing or malformed targets are rejected before checkout or installation. Failed lookup or a non-open PR stops without substituting a target. Never infer a PR from the current branch or the sole open PR.

Select one recorded branch-backlog entry per run, honoring an optional selector. With no selector, retain the first eligible entry rated below 7; a selector matching nothing, missing or empty backlog, or only ineligible entries stops and reports the reason. Retain the five-part entry contract, verify proposal claims before planning, preserve other entries, and never read or edit master's issues backlog. Keep the existing security, supply-chain, verification, plan-revision, no-attribution, and project-directory boundaries.

Preserve the existing PR publication sequence: validate target and branch again, commit without rewriting earlier commits, push with at most three rebase retries and no force-push, then correct only the description paragraphs named by the entry when required. Never edit its title. Confirm the PR stays open and its remote head matches local HEAD. Remove the whole resolved entry, retaining the exact master comment-and-heading skeleton when empty. Do not merge, close, replace, or retarget the PR. Preserve failures and their existing reports rather than treating a failed push or description edit as success.

### 2. Move the selected playbooks and repair their links

Move these root task files into `ai/tasks/feature/`: `build-a-feature.md`, `plan-a-new-feature.md`, `remove-an-existing-feature.md`, `review-pull-request.md`, `test-pull-request.md`, and `update-pull-request.md`. Move `ai/tasks/auto-build.md` to `ai/tasks/feature/auto-build-a-feature.md`. Keep the standalone behavior of the moved tasks apart from the path and repair-route changes this plan names.

Update invocation examples and project-first and installation-fallback child paths. Fix Markdown links relative to each new containing directory: sibling feature tasks stay local, workspace/planning/research/hygiene tasks are under their corresponding sibling directories, guidelines are two levels up, and the root `AGENTS.md` is three levels up. Links to `fix-a-bug.md` and `work-an-issue.md` must reach the parent task directory. The new issue playbook uses the same corrected links. Do not move `workspace/open-feature-pull-request.md` or any other workspace task.

### 3. Update live repair routes and other playbook consumers

In the moved review and testing tasks, route every newly generated Proposal through `execute ./ai/tasks/feature/work-pull-request-issue.md <number> "<entry summary>"`, using the actual numeric target and a summary that identifies its backlog entry. Update prose, entry templates, worked examples, and the sole-route checks consistently. Keep the risk scales, five-part format, deduplication, and preservation of previously recorded entries. Do not rewrite existing PR backlogs as part of this reorganization.

Update the moved auto-build task's drain procedure to call the dedicated task with the recorded number and optional selector. Replace obsolete references to ordinary-task PR mode and the old proposal prefix; keep all preparation overrides, complexity overrides, backlog restoration, failure handling, and termination rules otherwise intact. An old proposal is evidence for selecting its recorded entry, not a command to execute. The dedicated task is always invoked with an explicit accepted target.

Update current cross-references in `ai/tasks/workspace/resolve-conflicts.md`, `ai/tasks/research/find-feature-gaps.md`, `ai/tasks/research/find-feature-ideas.md`, and `ai/tasks/research/find-technical-debt.md`. In the moved update-PR task, refer to the dedicated task for PR repair plans; preserve the ordinary issue task for references that actually concern ordinary work. `ai/tasks/resolve-technical-debt.md` keeps its reference to ordinary issue complexity and needs no edit.

### 4. Update current specs, documentation, and fixtures

Update `product/specs/task-picker.md` with the feature directory, renamed auto-build task, separate issue flows, accepted PR inputs, no inferred target, one-entry selection, and absence of wrappers. Update `product/specs/pull-request-review.md`, `product/specs/pull-request-testing.md`, and `product/specs/pull-request-updating.md` so follow-up repairs and fix-plan consolidation name the dedicated workflow. Preserve unrelated behavior.

Update `documentation/user-documentation/command-bar/tasks.md` to show the feature grouping and current examples, explain which issue task to choose, and state that old moved paths no longer work. Keep its existing decorative sprites and use task filenames and user actions rather than implementation details. Update the example task names in the existing `src/tasks.ts` comment without changing runtime logic.

Update runnable task examples in `src/tasks.test.ts`, `web/src/pickers/useTaskPicker.test.ts`, `web/src/useWindowKeys.test.ts`, and `src/monitor/parsing.test.ts`. Use the new feature path wherever a fixture represents the moved build task; make path, name, depth, directory rows, selection, and expected emitted command agree. Preserve coverage for top-level task listing with an existing root task or a generic fixture rather than pretending the built-in build task still lives at the root.

Update `scripts/test-pull-request-playbook.test.mjs` to read the moved testing prompt and correct its path comment; keep every security assertion. Update `scripts/docs-screenshots/manifest.mjs` to seed the feature directory and new paths, correcting its picker-navigation actions and explanatory comments so it still selects an actual nested file. Do not regenerate screenshot assets as part of this feature.

These named paths are the implementation scope. `commands.md` and `src/sandbox/live.sandbox.test.ts` invoke the unchanged root ordinary issue task and need no edit. `CHANGELOG.md`, completed plans, and historical documentation-backlog records retain their old references. If another required consumer is discovered, revise the plan before implementing it.

### 5. Keep the plan and selected backlog synchronized

When planning is complete, remove only the selected ready proposal from `product/backlog/features.md`; it is currently a single bullet rather than a `###` entry. Preserve every other byte, including the separate ACP proposal. This planning task leaves this plan in draft and merges the completed planning documents through its prescribed workflow. Implementation later promotes the approved plan as directed by the build task.

## Tests

Retain and update the existing server and client fixture tests rather than adding a new prompt parser or tests that mirror prose. Existing recursive-listing tests in `src/tasks.test.ts` cover discovery, project precedence, and nesting. The updated picker tests must still prove emitted project and installation commands carry the selected full path, and Enter routes the selected nested task. The existing `scripts/test-pull-request-playbook.test.mjs` assertions must pass with the new location and preserve base-branch task reading, audit-before-install ordering, and bounded additional test generation.

Manually trace the ordinary workflow with no argument, a matching issue, unlisted text, and PR-shaped text; all use ordinary issue rules. Trace the dedicated task with number, `#number`, and URL, with and without a selector, plus a missing reference, branch-name input, failed lookup, closed PR, unmatched selector, missing or empty backlog, and all entries rated 7+. Verify those stops select no substitute work. Trace a final-entry removal, a description-only fix, rejected push retries, failed description edit, and a PR closing during the run. Trace review-generated and test-generated proposals through auto-build's drain and confirm they keep the recorded PR open.

## Out of scope

The ACP delegation skill proposal, compatibility wrappers, aliases, historical completed-plan and changelog edits, previously recorded PR backlog rewrites, screenshot regeneration, runtime task-discovery changes, new dependencies, new workflow abstractions, and behavior changes to the other PR tasks beyond the paths and repair routes named here are excluded. Workspace tasks remain in place. Planning does not implement the feature or promote the plan to ready.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, using `./scripts/run.mjs check-diff` in this checkout, after each implementation step. Run `git diff --check`. Confirm each relocated file and corrected relative link resolves, no old root file or wrapper remains, and old invocation paths appear only in intentionally preserved historical records or descriptions of the move. Manually inspect the picker: expand `feature`, choose the new repair task, and confirm it emits `execute ./ai/tasks/feature/work-pull-request-issue.md` for a project task or the corresponding `$janissary` path for an installation task. Trace the issue-flow cases above against the completed instruction documents without executing a repair against a live PR.
