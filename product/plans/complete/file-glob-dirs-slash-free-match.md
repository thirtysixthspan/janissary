# Pin that --dirs matches the pattern against the slash-free directory path

**Complexity: 1/10** — test-only change: 0 production lines, 0 production files, 2 requirements, 3 scenarios (p=2.86)

Every `--dirs` case in `src/file-glob/walk-modes.test.ts` uses the pattern `**/*`, so nothing fails if `record` in `src/file-glob/walk.ts` hands the matcher the slashed form (`src/`) instead of the slash-free one (`src`). A literal pattern such as `src` or `src/*` would then silently list nothing under `--dirs`. Reading `record` confirms the current code is correct: the matcher receives `startRelative` and `checkLexicalPath` receives `rootRelative`, both without a trailing slash, and only the pushed path gains `/`. The design decision is simply unpinned.

## Goal

A test fails if a refactor moves the trailing-slash suffix ahead of the matcher, so that literal and single-segment `--dirs` patterns keep matching directories by their slash-free paths while the listed paths still carry the slash. The assertion that detects that regression is the slash-terminated pattern `src/`, added by `file-glob-dirs-slash-free-match-discriminating-test.md`. The literal patterns alone cannot detect it: minimatch accepts a candidate that runs one empty segment past the pattern, so `src/` matches `src` and `x/` matches `x`, and it compiles a whole-segment `*` to its non-empty form, so `src/` does not match `src/*`.

## Approach

Add one test case to `src/file-glob/walk-modes.test.ts`. No production change is expected; if the case fails, fix `record` in `src/file-glob/walk.ts` so the matcher and `checkLexicalPath` receive the slash-free strings and only the push appends `/`.

## Implementation steps

1. In `src/file-glob/walk-modes.test.ts`, add a case that creates directories `src/x` and `srcx` and the file `src/a.ts`, then asserts the three expectations listed under Tests.
2. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `listed({ dirs: true, pattern: 'src' })` is `['src/']` — a literal pattern matches the directory by its slash-free path, and `srcx` is not a prefix match.
- `listed({ dirs: true, pattern: 'src/*' })` is `['src/x/']` — a single-segment wildcard matches the nested directory, not the file `src/a.ts`.
- With `start` set to `src` and pattern `x`, `listed` is `['src/x/']` — the start-relative path is matched without a slash while the recorded root-relative path carries one.
- `listed({ dirs: true, pattern: 'src/' })` is `[]` — the only one of these assertions that fails if the matcher receives `src/`, which would list `['src/']`. The three above pin the listed paths but pass either way, because minimatch matches a candidate with one trailing empty segment against a pattern without it and never matches `src/` against `src/*`. Added by `file-glob-dirs-slash-free-match-discriminating-test.md`.

## Out of scope

- How minimatch itself treats a trailing slash in a candidate path; the walker never sends it one.
- Any spec or help change: user-visible behavior is unchanged.
