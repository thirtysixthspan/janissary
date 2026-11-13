<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Pin the plan's design decision that `--dirs` mode matches the pattern against the directory path without its trailing slash, which no test exercises.

Existing Issue: Every `--dirs` test in `src/file-glob/walk-modes.test.ts` uses the pattern `**/*`, so nothing fails if `record` hands the matcher the slashed form (`src/`) instead of the slash-free one (`src`), and a literal pattern such as `src` or `src/*` would then silently list nothing under `--dirs`. Severity: 3/10

Existing Risk: 3/10 - A later refactor of `record` or `visitEntry` (subplan 4 wiring, for instance) can move the slash suffix ahead of the matcher and break every non-wildcard `--dirs` query with no failing test.

Proposal Risk: 1/10 - The behavior is pinned; what stays unpinned is only how minimatch itself treats a trailing slash, which the walker never sends it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "pin --dirs matching against the slash-free directory path". Add a case to `src/file-glob/walk-modes.test.ts` that creates directories `src/x` and `srcx` and the file `src/a.ts`, then asserts `listed({ dirs: true, pattern: 'src' })` is `['src/']` and `listed({ dirs: true, pattern: 'src/*' })` is `['src/x/']`, so the pattern is matched against `src` and `src/x` while the recorded paths carry the slash. Optionally add a start-relative variant with `start` set to `src` and pattern `x`, expecting `['src/x/']`. No production change is expected; if the case fails, fix `record` in `src/file-glob/walk.ts` so the matcher and `checkLexicalPath` receive the slash-free strings and only the push appends `/`. Keep `walk-modes.test.ts` under the 200-line limit. Run `$janissary/scripts/run.mjs check-diff`.
