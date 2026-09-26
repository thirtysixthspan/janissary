# Hand the spec-testing task's workspace setup to the workspace preparation task

**Complexity: 4/10** — one task prompt rewritten around a delegation, one gate moved into the task that owns the install, and the spec, plan, and pin test brought into line. Prose only, but it touches every cross-reference between them.

`ai/tasks/research/find-bugs.md` currently sets the workspace up itself: eight numbered steps that confirm the repository is in a state it can safely rearrange, resolve the primary branch from `origin/HEAD`, stop on unpushed local commits, stash the working tree including untracked files, check the primary branch out, pull it, install dependencies, and revert a lockfile rewrite — followed by five recovery rules about finding and popping that stash by object ID and a `Stash:` line in the report. It does all of this rather than call [`prepare-workspace.md`](../workspace/prepare-workspace.md), and says why: that task hardcodes `master`. That reasoning is now reversed. The run should execute the workspace preparation task and take the workspace it leaves, inspecting and rearranging nothing itself.

Delegating has consequences beyond moving text, and each one is part of this change:

- **The install moves with it.** The task no longer installs, so the supply-chain gate that guards the install has no home here. It moves into `prepare-workspace.md`, which is the task that runs `npm install`, and where it belongs: every task that prepares a workspace now gets the gate, not just this one.
- **The stash disappears, and so does the baseline it provided.** The recovery rules lose their stash clauses. Step 9 keeps the rule that unattributed work is neither discarded nor staged, which is what now stands between a run and someone's uncommitted changes — with the difference that a stash is no longer how that work is set aside, and a run that finds unrelated work stops shipping rather than moving it.
- **The tested branch is whatever the preparation task left checked out.** The report's `App:` line and Step 4's pre-test check both stop naming a resolved primary branch: the run records the branch and commit it was handed and confirms only that `HEAD` has not moved since.
- **The run lock stays.** It is not repository state; it stops two runs sharing one working tree and one scratch directory, and with the stash gone nothing else excludes them.

## Approach

**One paragraph says how to pick the preparation task.** The project's own `ai/tasks/workspace/prepare-workspace.md` when it has one, the installation's otherwise, for the same reason the task picker prefers a project copy at the same path. The run follows whichever it picked in full and re-implements none of it, and it does not second-guess the branch or the tree state that task leaves — that is the workspace it was given.

**The preparation task owns the gate.** `prepare-workspace.md` gains a step before its install: run the gate the project's own instructions require, and on a Janissary checkout run this repository's, against this repository's own lockfile. Only `0` permits the install; `2` and `3` stop the run; `1` is a failed check, never permission. The wording moves across unchanged, because the hazard it guards is the same one and the reason it was written that way has not changed.

**The recovery rules lose the stash and keep the guarantees.** What replaces them: release the lock on every stop, leave the working tree as the preparation task left it, finish Steps 6–9 once Step 4 has begun, and never discard, reset, or clean a tree to tidy up after itself.

**The report loses one line.** Nothing stashes, so there is no stash outcome to report, and the shape is nine lines. The plan's copy of the shape is the one the pin test reads, so it changes with the playbook.

## Implementation steps

1. `ai/tasks/workspace/prepare-workspace.md` — a gate step before the install, carrying the audit command, both runner spellings, and the exit-code meanings.
2. `ai/tasks/research/find-bugs.md` — the job statement, the allowed list, and forbidden items 5 and 6.
3. `ai/tasks/research/find-bugs.md` — "Recovery on every stop", rewritten without the stash.
4. `ai/tasks/research/find-bugs.md` — Step 0, reduced to the `product/` check, the run lock, the delegation, and recording the branch and commit it was handed.
5. `ai/tasks/research/find-bugs.md` — the stop wording in Steps 1, 2, and 3; the pre-test check in Step 4; Steps 8 and 9; the report shape.
6. `product/specs/task-picker.md` — the branch, stash, and unpushed-commit sentences, replaced by the delegation.
7. `product/plans/complete/find-bugs-task.md` — the report-shape list loses its `Stash:` line, and the verification status records the reversal and what the run gives up.
8. `scripts/find-bugs-playbook.test.mjs` — the report-shape count, and the runner and audit pins re-pointed at the preparation task.

## Tests

`scripts/find-bugs-playbook.test.mjs` is the affected test:

- the report-shape assertion drops from ten lines to nine, which is what catches a shape edited on one side only;
- the audit command and both script-runner spellings are asserted against `ai/tasks/workspace/prepare-workspace.md`, where they now live, and the masking assertion runs over that file too;
- the stop message, the two browser variables, and everything else are untouched.

No new test. A delegation between two prose files has no code to cover, and the pins that exist already assert the strings both sides of it depend on.

## Out of scope

- **The launch and build instructions.** They are the next change: a workspace task of their own, which this task will call in the same way. They stay here until then, so this change leaves a task that delegates its setup and still builds and starts the app itself.
- **The run lock.** Two runs sharing one working tree is a worse collision without the stash than with it, so the lock stays exactly as it is.
- **Changing what `prepare-workspace.md` does about `master`.** It checks out `master`; the run now takes that branch rather than resolving its own. Making the preparation task resolve the remote's default branch is a change to every task that calls it, and a separate decision.
- **Any preflight of the repository.** The run no longer checks for an unfinished merge, a conflicted index, unpushed commits, or a dirty tree, and does not stop for any of them. What it does instead is in Step 9, where unrelated work is preserved rather than shipped.
- **The `Janissary` recognition of a checkout in the launch step.** That moves with the launch instructions; this change removes the copy in the install step because the install moves.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: read Steps 0 and 9 against `prepare-workspace.md` and confirm the run's only instruction is to execute it, and search the task for `stash` and confirm no mention is left.
