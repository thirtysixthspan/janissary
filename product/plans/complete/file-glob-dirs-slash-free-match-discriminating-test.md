# Make the --dirs slash-free match test fail when the matcher receives the slashed path

**Complexity: 1/10** — test-only change: 0 production lines, 0 production files, 2 requirements, 2 scenarios (p=2.76)

The case `matches the pattern against the directory path without its trailing slash under dirs` in `src/file-glob/walk-modes.test.ts` was added to pin that `record` in `src/file-glob/walk.ts` hands the matcher the slash-free directory path. Its three assertions (patterns `src`, `src/*`, and start-relative `x`) cannot fail under that regression. minimatch's `matchOne` accepts a candidate that runs one empty segment past the pattern, so `src/` matches `src` and `x/` matches `x`, and a whole-segment `*` is compiled to its non-empty form, so `src/` does not match `src/*`. All three pass whether the matcher receives `src` or `src/`, and the earlier plan's goal is not delivered.

## Goal

A test in `src/file-glob/walk-modes.test.ts` fails if `record` passes a directory's start-relative path to the matcher with a trailing slash, and the earlier plan `product/plans/complete/file-glob-dirs-slash-free-match.md` says which assertion detects that regression and why the literal patterns alone do not.

## Approach

Add one discriminating assertion to the existing case: a pattern ending in a slash, `listed({ dirs: true, pattern: 'src/' })`. With the slash-free matcher input `src` does not match `src/`, so the result is `[]`; if the slash reached the matcher, `src/` would match and the result would be `['src/']`. Keep the three existing assertions, which still pin the listed paths. No production change is expected.

## Implementation steps

1. In `src/file-glob/walk-modes.test.ts`, add `expect(await listed({ dirs: true, pattern: 'src/' })).toEqual([])` to the case `matches the pattern against the directory path without its trailing slash under dirs`.
2. Temporarily change `record` in `src/file-glob/walk.ts` to pass `` `${startRelative}/` `` to the matcher for directories, run the case, confirm only the new assertion fails, then revert `walk.ts` exactly.
3. Correct the Goal and Tests of `product/plans/complete/file-glob-dirs-slash-free-match.md` so they name the slash-terminated pattern as the assertion that detects the regression and explain why the literal patterns do not.
4. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `listed({ dirs: true, pattern: 'src/' })` is `[]` — the matcher receives `src`, which a slash-terminated pattern does not match.
- Mutation check: with `record` passing the slashed path to the matcher, the same call returns `['src/']` and the case fails.

## Out of scope

- How minimatch itself treats trailing slashes beyond the cases the walker can produce.
- Any production, spec, or help change: user-visible behavior is unchanged.
