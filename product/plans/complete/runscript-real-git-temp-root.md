# Resolve the real-Git temp root before comparing exclude files
**Complexity: 1/10** — a `realpathSync` wrap on four temp roots across two test files, plus one import line each. No production code and no existing assertion changes.

## Goal

The exclusion-pin case in `src/schedule/system/runscript-refresh.test.ts` and the real-Git cases in `src/schedule/system/runscript-files.test.ts` create their project roots with `mkdtempSync(path.join(tmpdir(), ...))`, which returns the unresolved temp path. On macOS that path sits behind the `/var` to `/private/var` symlink. Resolve each root once with `realpathSync`, so the root the test uses is the spelling git reports and the exclusion-pin assertion can detect a regression. No production behavior changes.

## Reading

- `readRunscriptRows` reads names through `listRunscriptNames`, which runs no Git and writes nothing. The only write the pin guards against is the one `ensureSystemScheduleExcluded` makes, reached through `catalogRunscripts`.
- `ensureSystemScheduleExcluded` in `src/schedule/system/local-exclude.ts` takes its worktree from `git rev-parse --show-toplevel`. Git derives that from the working directory the child inherits. `execFileSync` with a `cwd` option does not rewrite the inherited `PWD`, so on macOS git reports the physical `/private/var/...` path, not the unresolved `/var/...` root.
- `relativeTarget` then runs `path.relative(worktree, path.join(projectRoot, target))`. That comparison is lexical. With the project root at `/var/...` and the worktree at `/private/var/...`, the result starts with `../`, and the function throws `System schedule paths must be inside the Git worktree` before it writes anything.
- `excludeScriptsFromGit` in `src/schedule/system/runscript-files.ts` catches that error and writes one line to stderr. The exclusion file is left as it was.
- The exclusion-pin case therefore does not discriminate on a macOS host. A regression that made the rows module call `catalogRunscripts` would leave `.git/info/exclude` unchanged, and the `toBe(before)` assertion would still pass.
- By the same reading, the existing real-Git case `excludes the scripts directory from Git when it is ensured in a repository` in `runscript-files.test.ts` would skip its exclusion write on a macOS host, and its `git check-ignore` call would exit 1. That is the same divergence. It was not run.
- The two other real-Git cases in `runscript-files.test.ts`, `lists sorted valid runscript names and writes no Git exclusion` and `computes the runscript file path without creating the directory or writing a Git exclusion`, run no Git in production. Their exclusion assertions guard against a future write that would go through the same guard, so under the same divergence they would not catch that write either.
- The exclusion file itself does not diverge. `path.resolve(worktree, '.git/info/exclude')` names the same file as the unresolved path. Only the lexical `relativeTarget` guard diverges.
- The sandbox that runs these tests sets `TMPDIR` to a real directory, `claude-2.tmp` beside the workspace, which `vitest.config.ts` says is set by `sandbox.ts`. Here `realpathSync` is an identity, so `check-diff` in this workspace cannot reproduce the host divergence. The fix is verified by reading.

## Decision

The divergence is real on a macOS host with the default `TMPDIR`. It makes the exclusion-pin assertion non-discriminating and also breaks the existing `excludes the scripts directory` case on that host. The fix is test-only: resolve the temp roots with `realpathSync`. No assertion changes, and no production line changes.

## Approach

1. `withProject` in `runscript-refresh.test.ts` is the helper the new case shares with the other refresh cases. Its root is resolved once there. The other refresh cases run no Git, and their assertions compare publish counts and paths built from the root. Resolving a root that holds no symlink changes nothing, so those assertions are unaffected.
2. `runscript-files.test.ts` has no shared root helper. Each case builds its root inline, so the change is one wrap per real-Git case, matching the file's existing style, rather than a new helper.
3. Only the four real-Git roots are wrapped. The non-Git cases in both files keep their roots, because none of their assertions depends on git's view of the path.

## Implementation steps

1. In `src/schedule/system/runscript-refresh.test.ts`, add `realpathSync` to the `node:fs` import, after `readFileSync`.
2. In `withProject` in the same file, change the root to `realpathSync(mkdtempSync(path.join(tmpdir(), 'runscript refresh ')))`.
3. In `src/schedule/system/runscript-files.test.ts`, add `realpathSync` to the `node:fs` import, after `readFileSync`.
4. In the three real-Git cases, wrap the root in the same way. The cases are `excludes the scripts directory from Git when it is ensured in a repository` (`schedule ensure git `), `lists sorted valid runscript names and writes no Git exclusion` (`schedule list git `), and `computes the runscript file path without creating the directory or writing a Git exclusion` (`schedule path `).
5. Run `./scripts/run.mjs check-diff` and read its output. Confirm that `git diff` shows only the two imports and the four root lines, with every assertion line unchanged.

## Tests

No test is added. The change fixes the temp root that the existing exclusion-pin case and the three real-Git cases use, so those existing cases are the tests that cover it. A new test would have to read the test's own temp-root spelling, which is fixture setup and not product behavior. Every existing assertion must pass without edits.

## Verification

`./scripts/run.mjs check-diff` must report no lint, typecheck, or test failure. Because this workspace's `TMPDIR` is not a symlink, that run does not show the host behavior. The macOS result is established by the reading above. A later host run of the server project would show it directly. Git diff must show no assertion change.

## Spec and documentation

No user-visible behavior changes, so no file under `product/specs/` changes. `help.md` and `documentation/user-documentation/` describe nothing that changes, so neither is updated.

## Out of scope

- `relativeTarget` compares a lexical project root with git's physical worktree. A caller that passed a symlink-prefixed root would hit the same silent skip with a stderr line. Production passes the process working directory, which is physical, so production is not changed here.
- `product/plans/complete/runscript-clone-single-path.md` still says the exclusion-pin question "is reported separately". This plan answers that question and is its record. That sentence is outside this fix's file set, so it is not edited here.
- Other test files that run Git against temp roots were not surveyed.
