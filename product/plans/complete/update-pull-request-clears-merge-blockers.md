# Let update-pull-request clear merge blockers before it describes the code

**Complexity: 3/10** — the work is a new step in one markdown task plus a renumbered cross-reference, and both repairs reuse tasks that already exist: `ai/tasks/workspace/resolve-conflicts.md` and `ai/tasks/workspace/fix-build.md`. The care is in keeping the task's "this task describes, it never changes code" rule honest now that it hands code changes to subagents, and in ordering the step so the description is written against the code that will actually merge.

## Goal

`ai/tasks/feature/update-pull-request.md` runs at the end of a pull request's life and brings its description, plan, specs, and help in line with the code. It never checks whether the pull request can merge. A pull request that conflicts with `master` or has a failing CI build gets a careful description of code that still has to change, and the run reports success anyway.

Make the update clear those blockers first. When the pull request conflicts with `master`, execute `resolve-conflicts.md` in a fresh subagent. When its CI build is failing, execute `fix-build.md` in a fresh subagent. Only then read and describe the code.

## Design decisions

1. **The blockers are cleared before the read, as a new Step 2.** Every later step measures text against the code on the branch. A conflict resolution or a build repair changes that code, so describing first and repairing second would leave the description stale the moment the repair lands. Putting the step straight after checkout means the read in the next step sees the repaired branch, and any fix plan or plan adaptation note the repair adds is in place before the plan is folded.

2. **A failing build goes to `fix-build.md`, not to `work-pull-request-issue.md`.** `work-pull-request-issue.md` takes work only from an entry already recorded in the branch's backlog, so routing a CI failure through it would mean writing, committing, and pushing a backlog entry first. `fix-build.md` takes the pull request number directly, diagnoses the root cause, proves the local build, pushes, and refuses to claim success until GitHub's checks pass on the pushed head. That is exactly the blocker this step needs cleared.

3. **Conflicts are checked first, then the build.** A rebase pushes a new head and CI reruns on it, so a build verdict read before the conflicts are resolved would describe a head that no longer exists. After either repair the step goes back to the conflict check, because `master` can move while a repair runs. The loop runs at most three times so a pull request that keeps breaking cannot hold the run forever.

4. **Detection reuses the existing helpers.** `pr-resolve-remote`, `pr-check-mergeable`, and `pr-wait-checks` already exist, and `resolve-conflicts.md` uses the same `UNKNOWN`-twice-means-conflicting rule this step adopts. `pr-wait-checks` reads GitHub's checks and runs nothing locally, so it doesn't break the rule against running the project's tooling. It treats "no checks reported" as a pass, so the step re-runs it once when a subagent has just pushed and it reports none, in case the new head hasn't registered its checks yet.

5. **The subagents keep every rule of their own tasks.** No override is needed: both accept a pull request number, both leave the pull request open, both refuse to merge, and `resolve-conflicts.md`'s only history rewrite is `pr-rebase`'s `--force-with-lease`. Delegations run one at a time, because both share this checkout. The task's existing "Make delegation visible" rule already requires announcing each delegation and its result.

6. **An unresolved blocker stops the run before anything is described.** If `resolve-conflicts.md` cannot resolve the conflicts or `fix-build.md` reports `blocked`, the code is not settled, so describing it is premature. The run skips straight to the report, which names the blocker and leaves the pull request open.

7. **The task itself still edits no code.** The opening paragraph, the Allowed list, and Forbidden rules 3, 7, and 9 each gain a narrow carve-out for the delegated repairs rather than a general loosening. This task still runs no test suite of its own and makes no code edits of its own.

8. **Steps after the new one are renumbered, and the one external reference follows.** `build-a-complex-feature.md` overrides this task's "Step 2 plan discovery and Step 3 selection" by number, so it becomes Step 3 and Step 4. A new playbook test pins that pairing, so a later renumbering can't quietly point the override at the wrong step.

## Implementation steps

1. `ai/tasks/feature/update-pull-request.md`:
   - Opening paragraphs: state that the update first clears merge conflicts and a failing CI build through the two delegated tasks, and that those repairs are the only code changes a run makes.
   - Allowed list: reading mergeability and CI checks with the three helpers, and delegating the two tasks as Step 2 describes.
   - Forbidden 3, 7, and 9: carve-outs for the delegated repairs, `pr-wait-checks`, and `pr-rebase`'s `--force-with-lease`.
   - New `## Step 2 — Clear merge blockers`: start each delegation from a clean tree (reverting a lockfile the install rewrote, since a subagent's commit stages everything), resolve the remote, check mergeability and delegate `resolve-conflicts.md` on conflicts, wait on checks and delegate `fix-build.md` on failure, resync and confirm a clean tree after each subagent, loop at most three times, and stop to the report on an unresolved blocker.
   - Renumber Steps 2–10 to 3–11 and every internal step reference.
   - Report: add `Conflicts:` and `CI build:` lines, reword `Not checked:` so it covers delegated checks, and allow a blocked status.
2. `ai/tasks/feature/build-a-complex-feature.md`: change "Override its Step 2 plan discovery and Step 3 selection" to "Step 3" and "Step 4".
3. New `scripts/update-pull-request-playbook.test.mjs`.
4. `product/specs/pull-request-updating.md`: a new "Merge blockers come first" subsection, and corrections to the opening paragraph and "What an update never does".
5. `documentation/user-documentation/workflows/updating-a-pull-request.md`: a new section on merge blockers, and a correction to "What the agent never does", which currently says the run changes no code and runs no checks.

## Tests

`scripts/update-pull-request-playbook.test.mjs`, in the style of `scripts/test-pull-request-playbook.test.mjs`:

- Step 2 delegates `ai/tasks/workspace/resolve-conflicts.md` to a fresh subagent on `CONFLICTING`, and the task file exists.
- Step 2 delegates `ai/tasks/workspace/fix-build.md` to a fresh subagent when `pr-wait-checks` fails, and the task file exists.
- The conflict check comes before the build check within Step 2, and Step 2 comes after checkout and before the read step.
- An unresolved blocker skips to the report rather than describing the code.
- `build-a-complex-feature.md`'s override names the step numbers whose headings are plan discovery ("Read the pull request as it stands") and plan selection ("Update the plan").
- The update still forbids `gh pr merge`.

## Out of scope

- Any change to `resolve-conflicts.md`, `fix-build.md`, or `work-pull-request-issue.md`.
- Changing `pr-wait-checks`' treatment of "no checks reported".
- Changes to `build-a-feature.md`, which delegates this task with no override and needs none.
- Overriding the delegated tasks' own stop conditions.

## Verification

`./scripts/run.mjs check-diff` runs the new script test. Manually: run `execute ./ai/tasks/feature/update-pull-request.md <number>` against an open pull request that conflicts with `master` and confirm a `resolve-conflicts.md` subagent runs before the description is touched. Run it against one with a failing CI check and confirm a `fix-build.md` subagent runs. Run it against a clean, green pull request and confirm Step 2 delegates nothing and the report shows `Conflicts: none` and `CI build: passing`.
