# Pin the admitted tick's no-exclusion-write behavior
**Complexity: 2/10.** One test case that reads the Git exclusion file across an admitted tick in a fresh repository, plus a two-sentence comment above `readRunscriptRows`. No production behavior changes.

## Goal

An admitted scripts-tab tick must not touch `.git/info/exclude`. The refresh runs on every scheduler tick while a scripts tab is open, so the rows module has to read names through `listRunscriptNames`, which writes nothing, and not through `catalogRunscripts`. Nothing in the suite checks that path, and the rows module does not say why it avoids the catalog call. This plan adds the check and the reason, and changes no behavior.

## What the code does

Checked against the branch before planning:

- `readRunscriptRows` in `src/schedule/system/runscript-rows.ts` calls `listRunscriptNames` inside its `try`. The module never imports `catalogRunscripts`. Its count and open-flag lookups use `managers.systemSchedule.list()` and `runscriptFilePath`, and neither runs Git.
- `catalogRunscripts` calls `excludeScriptsFromGit`, which calls `ensureSystemScheduleExcluded` in `src/schedule/system/local-exclude.ts`. Inside a repository, that function runs `git rev-parse`, two `git ls-files` calls, and two `git check-ignore` calls on every call.
- It writes the exclusion file only when `/.janissary/system-schedules.json` or `/.janissary/scripts/` is not already ignored. Once both rules are present, a catalog call writes nothing. The backlog entry said the call rewrites the exclusion on every call, which overstates the write. The comment says what the code does: Git runs on every call, and the exclusion is written whenever a rule is missing.

## Approach

Use a fresh repository whose `.git/info/exclude` has neither rule. Run one admitted tick through `createRunscriptRefresh`. The rows module reads names with `listRunscriptNames`, so the file stays byte-for-byte the same and the runscript is published. If the rows module called `catalogRunscripts` instead, `ensureSystemScheduleExcluded` would append both rules on that tick, and the text assertion would fail.

The case first asserts that the file lacks the `/.janissary/scripts` rule. Without that precondition, a repository that already carried the rules would let the test pass whether or not the catalog were called, so the precondition keeps the test honest.

## Implementation steps

1. In `src/schedule/system/runscript-refresh.test.ts`, import `execFileSync` from `node:child_process` and `readFileSync` from `node:fs`. The existing imports stay as they are.
2. Add one case to the `runscript refresh changes` block, directly after `publishes on the first admitted tick when a runscript exists`:
   - Run `execFileSync('git', ['init', '-q'], { cwd: root })` in the temporary project, the same call pattern `runscript-files.test.ts` uses.
   - Write `deploy.rs` into the scripts directory.
   - Read `.git/info/exclude` into `before`, and assert that it does not contain `/.janissary/scripts`.
   - Run one tick through `createRunscriptRefresh` with `fakeManagers(root, [pluginTab('scripts')])`, `listens`, and a `vi.fn()` publish spy.
   - Assert that the exclusion text still equals `before`, and that publish was called once.
3. In `src/schedule/system/runscript-rows.ts`, add a two-sentence comment above `readRunscriptRows`. It names `listRunscriptNames` and `catalogRunscripts`, says the catalog call runs Git and writes the exclusion when its rules are missing, and says the refresh calls this on every tick while a scripts tab is open. The comment is the only change to that file.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- One new case, as described in step 2. The existing cases in `runscript-refresh.test.ts` and in the other modules stay unchanged.
- Mutation sensitivity is confirmed by reading, not by editing production code. Reading the path: with `catalogRunscripts` in place of `listRunscriptNames`, `readRunscriptRows` would reach `ensureSystemScheduleExcluded`. In a fresh repository that function finds neither rule ignored, reads the exclusion file, and writes both rules with `atomicWriteFile`. The case's text assertion then fails. The existing case "excludes the scripts directory from Git when it is ensured in a repository" in `runscript-files.test.ts` runs that same write in a fresh repository, and it passes on this branch.

## Verification

`./scripts/run.mjs check-diff` reports no lint, typecheck, or test failure. The new case passes, and every existing case in the touched module passes unchanged.

## Spec and docs

No spec change. The fix adds a test and a comment, and no user-visible behavior changes. No help or user documentation describes the exclusion rules on the tick path.

## Out of scope

- Changing `catalogRunscripts`, `ensureSystemScheduleExcluded`, or any refresh gate.
- Making the catalog call write-free. Its exclusion write is intentional on the create, read, and list paths that use it.
