<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the security gap where the walker's secret-file drop judges a symbolic link by its own name, so a link to a secret file or to a file outside the workspace is listed.

Existing Issue: The walker classifies a symbolic link to a file as a file and then runs the secret check only on the link's own root-relative path, so a link such as `notes.txt` pointing at `.env`, at a file under `~/.aws/`, or at a file outside the workspace root passes the filter and is listed, while `file read` on that same path refuses it through its real-target check. Severity: 3/10

Existing Risk: 3/10 - The glob output names paths that resolve to secret or out-of-workspace files, so the secret drop that the plan relies on to keep the listing consistent with `file read` can be bypassed by anyone able to create a link in the workspace, and an agent is steered toward reads that fail.

Proposal Risk: 1/10 - Only links pay an extra `realpath`, and a link whose target cannot be resolved is dropped, so the remaining risk is a target swapped between the check and a later read, which `file read`'s own real-target check still catches.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "drop symbolic-link matches whose resolved target is a secret file or lies outside the workspace". In `src/file-glob/walk.ts`, let `classify` report that a `'file'` came from a symbolic link (for example a `'link'` kind, or a flag `visitEntry` passes on to `record`), and in `record`, after the matcher and the existing `checkLexicalPath(state.options.root, rootRelative)` test, for link matches only resolve the link with `realpath` (from `node:fs/promises`, or `realpathSync`) and run `checkRealTarget(realRoot, realTarget)` from `src/file-read/policy.ts`, where `realRoot` is the realpath of `options.root` computed once in `walkGlob` and kept on `WalkState`; drop the match on any failure result or on a rejected `realpath`, before the push so it does not count toward the limit. Keep the check off regular files and directories so the plan's "check only matches" cost rule holds. Add cases to `src/file-glob/walk-modes.test.ts`: a link `notes.txt -> .env` and a link to a file in a second `mkdtempSync` directory outside the root are both omitted in file mode, while the existing `lists a symbolic link to a file in file mode only` case (a link to an ordinary in-root file) still lists `link.ts`. Note the added rule in `product/plans/complete/file-glob-3-sorted-walker-2-dirs-links-secrets-deadline.md`'s design decisions and in the file glob spec under `product/specs/` if it describes link handling. Run `$janissary/scripts/run.mjs check-diff`; `walk.test.ts` and `walk-modes.test.ts` must pass unchanged apart from the new cases.


* Pin the plan's design decision that `--dirs` mode matches the pattern against the directory path without its trailing slash, which no test exercises.

Existing Issue: Every `--dirs` test in `src/file-glob/walk-modes.test.ts` uses the pattern `**/*`, so nothing fails if `record` hands the matcher the slashed form (`src/`) instead of the slash-free one (`src`), and a literal pattern such as `src` or `src/*` would then silently list nothing under `--dirs`. Severity: 3/10

Existing Risk: 3/10 - A later refactor of `record` or `visitEntry` (subplan 4 wiring, for instance) can move the slash suffix ahead of the matcher and break every non-wildcard `--dirs` query with no failing test.

Proposal Risk: 1/10 - The behavior is pinned; what stays unpinned is only how minimatch itself treats a trailing slash, which the walker never sends it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "pin --dirs matching against the slash-free directory path". Add a case to `src/file-glob/walk-modes.test.ts` that creates directories `src/x` and `srcx` and the file `src/a.ts`, then asserts `listed({ dirs: true, pattern: 'src' })` is `['src/']` and `listed({ dirs: true, pattern: 'src/*' })` is `['src/x/']`, so the pattern is matched against `src` and `src/x` while the recorded paths carry the slash. Optionally add a start-relative variant with `start` set to `src` and pattern `x`, expecting `['src/x/']`. No production change is expected; if the case fails, fix `record` in `src/file-glob/walk.ts` so the matcher and `checkLexicalPath` receive the slash-free strings and only the push appends `/`. Keep `walk-modes.test.ts` under the 200-line limit. Run `$janissary/scripts/run.mjs check-diff`.
