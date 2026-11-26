# fix(scripts): scope the merge rebase gate to the merged changes

**Complexity: 6/10** — 15 requirements, 19 test scenarios, ~100 added lines across 4 scripts (p=6.37)

## Goal

The merge workflow's conflict step runs the whole typecheck, lint, and test suite after every rebase, even for a PR that only touches a plan file. This change lets the diff-scoped checker scope itself to a branch's committed changes against a base ref, and has `merge-change-to-master.md` use that in place of the full gate. A PR whose changes reach no lintable file, project, or test then passes in seconds. Every other caller of `pr-rebase.sh` and `pr-check-gate.sh` keeps the full gate.

## Requirements

1. `changedFiles()` takes an optional base ref that "adds `git diff --name-only <base>...HEAD`" to the uncommitted and untracked files it already returns.
2. With a base ref, files the branch deleted since the base are left out, the same as deleted uncommitted files are today.
3. With a base ref that git cannot resolve, `changedFiles()` throws instead of returning an empty list, so a bad base can never pass a gate as "no changes".
4. `check-diff` accepts `--base <ref>` (and `--base=<ref>`) and selects its checks from `changedFiles(<ref>)`.
5. With a base ref, `check-diff` passes "the same ref to vitest as `--changed <base>`" for the server tests, shown as `npm run test:server -- --changed <ref>`.
6. With a base ref, `check-diff` passes the same ref to vitest as `--changed <base>` for the web tests, shown as `npm run test:client -- --changed <ref>`.
7. With a base ref, `check-diff` lints through `lint-files --base <ref>`, shown as `$janissary/scripts/run.mjs lint-files --base <ref>`.
8. With a base ref and nothing changed against it, `check-diff` prints `check:diff: no changes against <ref>` and exits 0.
9. With a base ref git cannot resolve, `check-diff` prints `check:diff: cannot diff against <ref>` with git's message and exits 1.
10. `check-diff --base` with no ref value prints a usage error and exits 1.
11. `lint-files` accepts `--base <ref>` and, when no paths are named, lints `changedFiles(<ref>)`.
12. `lint-files` never forwards `--base` or its ref to ESLint.
13. `pr-rebase.sh` accepts a `--check-diff` flag that, after a clean rebase, runs `check-diff --base <remote>/master` "in place of `pr-check-gate.sh`".
14. With `--check-diff`, a red `check-diff` stops `pr-rebase.sh` with exit 1 before it pushes.
15. `merge-change-to-master.md` Step 6 invokes `pr-rebase` with `--check-diff`, and its prose says the rebase is re-verified with the diff-scoped checks against `origin/master`.

## Design decisions

- The base ref is opt-in on every script. With no `--base`, `changedFiles()`, `check-diff`, and `lint-files` behave exactly as today, so the AI development loop is unchanged.
- `pr-rebase.sh` gets an opt-in `--check-diff` flag rather than a changed default, because the issue says "`pr-rebase.sh` is also used by `resolve-conflicts.md` and `update-pull-request.md` ... none of those should change silently." `pr-check-gate.sh` itself is not edited.
- The base is `<remote>/master` as `pr-rebase.sh` just fetched it, so `<remote>/master...HEAD` is exactly the branch's own commits after the rebase (Assumption 3).
- With a base, the test checks call `test:server` and `test:client` with `--changed <ref>` appended, not `test:diff:*`, because those scripts already end in a bare `--changed` and vitest would receive the flag twice (Assumption 2).
- The typecheck and help-test checks are unchanged with a base: `typecheck:diff` already typechecks whole projects incrementally, and the help check runs a fixed test file.
- Base-ref argument parsing lives in one small module, `scripts/base-ref.mjs`, shared by `check-diff` and `lint-files`.
- Check selection moves out of `check-diff.mjs` into a pure module, `scripts/diff-checks.mjs`, so the base-ref commands can be tested without spawning npm.
- A git failure on the base diff is not swallowed (Requirement 3). Today's catch-all stays for the no-base path, where "no git or no HEAD" really does mean nothing to check.
- The merge gate becomes narrower than CI on purpose. The issue notes that "this gate is the last check before master" and breakage the import graph can't see "would show up on master rather than on the branch"; that trade is accepted, and CI still runs the full suite after merge.

## Preserved behavior

1. `check-diff` with no arguments keeps selecting checks from uncommitted and untracked files and prints `check:diff: no changes` on a clean tree; it must not pick up committed branch changes. Pinned by the new `check-diff` spawn test "prints no changes on a clean tree without a base", since no existing test pins it (recorded as Requirement-level coverage in Tests).
2. `lint-files` with named paths keeps linting exactly those paths with the project's own ESLint, and must not fall back to the changed set. Pinned by `scripts/lint-files.test.mjs` "lints with the working directory's own ESLint, not the one beside the script".
3. `lint-files` keeps failing with a pointer to `npm install` when the project has no ESLint, and must not exit 0. Pinned by `scripts/lint-files.test.mjs` "fails with a pointer to npm install when the project has no ESLint".
4. `pr-rebase.sh` without `--check-diff` keeps running `pr-check-gate.sh` after a clean rebase, and must not run `check-diff` instead. No existing test pins it, so the new `pr-rebase` test "runs the full check gate without --check-diff" covers it.

## Assumptions

1. `check-diff`, `lint-files`, and `pr-rebase.sh` call `changedFiles()` and the gate from their own scripts directory: `scripts/check-diff.mjs:20` "`const files = changedFiles();`", `scripts/lint-files.mjs:25` "`paths = changedFiles();`", `scripts/pr-rebase.sh:50` "`\"$SCRIPT_DIR/pr-check-gate.sh\"`".
2. The diff test scripts already end in a bare `--changed`: `package.json:46` "`vitest run --project server --changed`", while `package.json:33` "`\"test:server\": \"vitest run --project server\"`" and `package.json:36` "`\"test:client\": \"vitest run --project client\"`" take one appended.
3. Vitest's `--changed <ref>` finds committed files with `<ref>...HEAD` plus staged and unstaged ones: `node_modules/vitest/dist/chunks/index.DpLw24bj.js:20204` "`` `${hash}...HEAD` ``".
4. `pr-rebase.sh` fetches the remote's master before rebasing onto it: `scripts/pr-rebase.sh:37` "`git fetch \"$GH_REMOTE\" master`".
5. `merge-change-to-master.md` reaches the rebase only from its conflict step: `ai/tasks/workspace/merge-change-to-master.md:109` "`$janissary/scripts/run.mjs pr-rebase origin my-branch-name`".
6. Script tests run in the server vitest project: `vitest.config.ts:14` "`'scripts/**/*.test.mjs'`".

## Existing functionality

1. The uncommitted and untracked file list: `scripts/changed-files.mjs:8` "`export function changedFiles()`".
2. Check construction with a rerun display string: `scripts/check-diff.mjs:38` "`function makeCheck(name, executable, args, display)`".
3. Help-change detection for the help check: `scripts/check-diff.mjs:33` "`hasHelpMarkdownChanges(files)`".
4. Resolving sibling scripts from the scripts directory: `scripts/check-diff.mjs:15` "`scriptPath('lint-files.mjs')`".
5. A fake project ESLint planted in a scratch project for `lint-files` tests: `scripts/lint-files.test.mjs:13` "`spawnSync(process.execPath, [lintFiles, 'a.ts']`".
6. A scratch git repository fixture with a GIT_-free environment: `scripts/release.test.mjs:15` "`!key.startsWith('GIT_')`".

## Implementation steps

1. Add `scripts/base-ref.mjs` exporting `parseBaseRef(args)`, which pulls `--base <ref>` or `--base=<ref>` out of an argument list and returns the ref (or none), the remaining arguments, and an error when `--base` has no value. Extend `changedFiles(base)` in `scripts/changed-files.mjs` so a given base adds `git diff --name-only --diff-filter=d <base>...HEAD` outside the existing catch, deduplicated with the current lists. Build: `$janissary/scripts/run.mjs check-diff`.
2. Update `scripts/lint-files.mjs` to run `parseBaseRef` on its arguments first, exit 1 on its error, and pass the ref to `changedFiles` when no paths are named. Build: `$janissary/scripts/run.mjs check-diff`.
3. Add `scripts/diff-checks.mjs` exporting `selectChecks(files, base)`, holding the classification and `makeCheck` calls now in `check-diff.mjs`, with the base-ref variants for lint and the two test checks. Update `scripts/check-diff.mjs` to parse `--base` with `parseBaseRef`, call `changedFiles(base)` inside a try that reports `check:diff: cannot diff against <ref>` and exits 1, print `check:diff: no changes against <ref>` when empty with a base, and take its checks from `selectChecks`. Build: `$janissary/scripts/run.mjs check-diff`.
4. Update `scripts/pr-rebase.sh` to accept `--check-diff` anywhere in its arguments, keep the two positional arguments, and after a clean rebase run `node "$SCRIPT_DIR/check-diff.mjs" --base "$GH_REMOTE/master"` when the flag is set, or `pr-check-gate.sh` otherwise. Update its usage and exit-code header. Build: `$janissary/scripts/run.mjs check-diff`.
5. Update `ai/tasks/workspace/merge-change-to-master.md` Step 6 to pass `--check-diff` and describe the scoped re-verification, including that CI runs the full suite only after merge. Update `product/specs/testing.md`. Build: `$janissary/scripts/run.mjs check-diff`.

Observable output with a base and a plan-only change:

```
$ $janissary/scripts/run.mjs check-diff --base origin/master
check:diff: no checks apply to the changed files
```

## UI design

None. The change is to developer scripts and a task playbook; no application surface changes.

## Tests

The scratch-repository tests share one helper, `scripts/git-fixture.mjs`, which builds repositories with a GIT_-free environment, a fixed identity, and unsigned commits, following `scripts/release.test.mjs`.

1. `scripts/base-ref.test.mjs`: `--base <ref>`, `--base=<ref>`, absent flag, and `--base` with no value (Requirements 4, 10, 11).
2. `scripts/changed-files.test.mjs`, spawning node in a scratch git repo: without a base only uncommitted and untracked files return; with a base the branch's committed files are added; branch deletions are dropped; an unknown base throws (Requirements 1–3).
3. `scripts/diff-checks.test.mjs`: with no base the commands match today's; with a base the lint, server-test, and web-test commands and displays carry the ref; typecheck and help commands are the same either way (Requirements 5–7).
4. `scripts/check-diff.test.mjs`, spawning the script in a scratch git repo: a clean tree without a base prints `check:diff: no changes` even with committed branch changes (Preserved behavior 1); a base with no diff prints `no changes against <ref>`; an unknown base exits 1 with `cannot diff against`; `--base` with no value exits 1 (Requirements 8–10).
5. `scripts/lint-files.test.mjs`: with `--base` and a fake project ESLint, ESLint receives the branch's committed file and never the `--base` flag or ref (Requirements 11–12).
6. `scripts/pr-rebase.test.mjs`, with a scratch bare remote, a clone, and a fake `npm` on `PATH`: with `--check-diff` and a Markdown-only branch the rebase pushes and exits 0 without calling npm; with `--check-diff` and a failing check it exits 1 without pushing; without the flag it runs the full gate (Requirements 13–14, Preserved behavior 4).

## Out of scope

- `pr-check-gate.sh`, `resolve-conflicts.md`, `update-pull-request.md`, and every other task that calls the full gate stay unchanged.
- `typecheck:diff` stays a whole-project incremental typecheck; no per-file typecheck.
- No change to CI in `.github/workflows/ci.yml`.
- No detection of breakage the import graph can't see (config or fixtures read from disk).

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then, on a branch with one committed Markdown-only change and a clean tree, run `$janissary/scripts/run.mjs check-diff --base origin/master`. It should print `check:diff: no checks apply to the changed files` and exit 0 in about a second; without `--base` it prints `check:diff: no changes`. Run `$janissary/scripts/run.mjs check-diff --base origin/nope`: it should print `check:diff: cannot diff against origin/nope` and exit 1. A failure looks like the full suite starting, or a bad base passing.
