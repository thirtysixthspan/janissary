# Let fix-build repair master by default and a pull request only when given its number

**Complexity: 3/10** — one markdown task gains a second mode, plus the matching spec, user documentation, and a new playbook test. Both modes reuse what already exists: `prepare-workspace.md` and `merge-change-to-master.md` for master, and the current pull request flow unchanged. The care is in the master mode's merge, because `merge-change-to-master.md` merges without waiting on checks while this task must never claim a pass without GitHub proof.

## Goal

`ai/tasks/workspace/fix-build.md` only repairs an open pull request today. Without an argument it guesses one from the current branch or the sole open pull request. A broken `master` has no task of its own.

Make `master` the default target. With no argument, the task diagnoses and repairs a failing build on `master` and ships the repair through a new pull request that merges once its checks pass. With a pull request number, `#number`, or PR URL, it keeps today's behavior on that pull request and leaves it open.

## Design decisions

1. **No argument means master.** The task no longer infers a pull request from the current branch or the list of open pull requests. Guessing made sense when a pull request was the only possible target; with a master mode, an empty invocation has an obvious meaning.
2. **Pull request mode needs a number, `#number`, or PR URL.** A head branch name is no longer accepted. The user asked for the pull request number as the switch, and `work-pull-request-issue.md` already uses the same explicit-reference rule. Any other argument stops before checkout with `Status: blocked` and `Reason: pull request number, #number, or PR URL required`. The only caller, `update-pull-request.md`, already passes the recorded pull request number.
3. **Master mode prepares the workspace in full.** `master` is the trusted branch, so the whole `prepare-workspace.md` runs, including its checkout and pull. The working tree is inspected first, so unrelated changes are never carried along.
4. **Master mode evidence is mostly local.** This repository's CI runs only on pull requests, so `master`'s head usually has no run of its own. The checks of the pull request that merged it are historical evidence at most. A current failure is established by reproducing it on `master`'s head. When nothing fails locally and no current run for that commit failed, the task reports `complete; no failure on master` and changes nothing.
5. **Master mode ships through `merge-change-to-master.md`, but merges only after GitHub proof.** It runs that task's Steps 0 to 6 (branch, commit, push, open, resolve conflicts), then this task's GitHub proof on the repair pull request, then that task's Step 7 merge. Further repairs after a CI failure go to the repair branch. It never pushes to `master` directly.
6. **Diagnosis, repair scope, and local proof are shared.** Steps 2 to 5 stay the same for both modes, generalized where they named "the PR".
7. **The report gains a `Target` field and new statuses.** `PR` names the target pull request, or the repair pull request in master mode. Statuses are `complete; PR open`, `complete; merged to master`, `complete; no failure on master`, and `blocked — <reason>`. `update-pull-request.md` still keys on `complete; PR open`, which pull request mode keeps.

## Implementation steps

1. Rewrite `ai/tasks/workspace/fix-build.md`: retitle it "Fix a Failing Build", describe both modes up front, generalize the untrusted-evidence and scope rules, and split Steps 0, 1, 6, and 7 by mode. Keep Steps 3 to 5 as they are apart from mode-neutral wording. Update the report template.
2. Add `scripts/fix-build-playbook.test.mjs` pinning the target contract.
3. Update `product/specs/task-picker.md` under "Fixing a failing pull request build", renamed "Fixing a failing build".
4. Update the `fix-build` sentence in `documentation/user-documentation/command-bar/tasks.md`.

## Tests

`scripts/fix-build-playbook.test.mjs`, in the style of `scripts/work-pull-request-issue-playbook.test.mjs`:

- With no argument, Step 0 selects master mode and does not infer a pull request.
- A supplied value must be a PR number, `#number`, or PR URL, and anything else stops with the blocked reason.
- Master mode executes `prepare-workspace.md` in full; pull request mode runs only its Steps 2 and 3.
- Master mode ships through `merge-change-to-master.md` Steps 0 to 6 and runs its Step 7 merge only after the GitHub proof step.
- Pull request mode still never merges or closes the pull request.
- The report lists every status, including `complete; PR open`, which `update-pull-request.md` relies on, and that caller still passes the pull request number.

## Spec and documentation

- `product/specs/task-picker.md`: the fix-build section describes both modes, the explicit pull request reference, master mode's delivery and merge rule, and the new statuses.
- `documentation/user-documentation/command-bar/tasks.md`: the fix-build sentence says it repairs `master` by default, or a pull request when given its number or URL.

## Out of scope

- Adding a push-to-master CI workflow, or a production-build job.
- Changing `merge-change-to-master.md`, `update-pull-request.md`, or `resolve-conflicts.md`.
- Repairing any build that is failing now.
