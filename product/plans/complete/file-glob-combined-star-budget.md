# Bound the combined cost of brace alternatives and per-name wildcards in a file glob pattern

**Complexity: 2/10** — ~10 added lines in 1 production file, 3 requirements, 5 test scenarios (p=4.05)

The pattern caps are checked independently: at most 64 `{a,b}` alternatives, and at most three `*` in one name of each alternative. minimatch tests a failing name against every expanded alternative in turn, so the per-alternative worst case multiplies by the alternative count, all synchronously within one directory's turn of the walk.

Measured on this machine with the project's minimatch 10.2.5 and the exact options `createGlobMatcher` uses (including `noext`), best of three `match` calls against a 255-character name of `a`:

- One three-star name: `*a*a*b` 1.2 ms, `*?a*?a*?aZ` 2.1 ms (the slowest three-star shape tried). Four stars, `*a*a*a*b`: 75 ms.
- Three-star names times alternatives grow linearly: `*?a*?a*?a` with 2, 3, and 4 trailing alternatives took 4.3, 6.3, and 8.4 ms; `*a*a*` plus six two-way groups (64 alternatives) took 73 ms, and `*?a*?a*?` plus six groups took 69 ms, so the worst three-star shape at 64 alternatives is about 135 ms.
- Two-star names stay cheap at the full cap: `*?a*?a` or `*a?*a?` plus six groups (64 alternatives) took 0.9 ms. One-star names at 64 alternatives took 0.01 ms.
- The earlier pattern-limits plan measured 12.5 ms for one three-star name on a slower run, so the same 64-alternative pattern there would cost roughly 0.8 s per name.

## Goal

A single match stays well under 10 ms on a 255-character name at every allowed combination of alternatives and stars, while every documented ordinary pattern stays legal: `{*.ts,*.js,*.md,*.json}`, `*-*-*.ts`, `*.{js,md}`, and two-alternative three-star patterns such as `*-*-*.{ts,js}`.

## Approach

In `src/file-glob/pattern-limits.ts`, add `FILE_GLOB_MAX_ALTERNATIVES_AT_MAX_STARS = 2` and `FILE_GLOB_MANY_ALTERNATIVES_NAME_STARS = 2`. `isGlobPatternTooComplex` picks the per-name star cap from the expanded alternative count: three while the pattern expands to at most two alternatives, two above that. `hasTooManyStars` takes the cap as a parameter. The worst allowed cases become two three-star alternatives (about 4.3 ms measured) and 64 two-star alternatives (about 0.9 ms). Record the measurements in the module comment.

Reword `FILE_GLOB_TOO_COMPLEX` to name the combined rule: `Pattern too complex: use at most 1024 characters, 64 {a,b} combinations, and three * wildcards in one name, or two when {a,b} choices make more than two patterns.`

The same predicate gates `parseFileGlob`, `createGlobMatcher`, and the far-side `glob-paths` validation, so no call site changes.

## Tests

- `src/file-glob/pattern-limits.test.ts`: six two-way groups after a three-star name are refused; two alternatives with three stars are allowed and three are refused; 64 alternatives with two stars are allowed; the existing ordinary patterns stay allowed.
- `src/file-glob/match.test.ts`: `*?a*?a*?` plus six two-way groups answers `false` against a 255-character name in under 50 ms (about 135 ms before the fix).

Existing tests in `src/file-glob/command.test.ts`, `src/file-glob/glob.test.ts`, and `src/remote/filesystem/operations.test.ts` keep passing; any that assert the message text follow the constant.

## Docs and specs

- `help/file.md` errors paragraph: the new rule and message.
- `product/specs/acp.md` `### File glob`: the new rule and message.

## Out of scope

- The PR description's pattern paragraph, handled by a later backlog entry.
- Globstar multiplication: `**/*a*a*b/**` against a 15-folder path of 255-character names tests the name at each depth (17 ms measured for one alternative). This plan bounds the per-name cost only.
- Moving matching off the main event loop or adding a per-match timeout.
