# Make the file glob pattern caps judge the backslash-normalized pattern minimatch expands

**Complexity: 2/10** — ~8 added lines in 2 production files, 3 requirements, 8 test scenarios (p=4.33)

`isGlobPatternTooComplex` brace-expands the raw pattern, where brace-expansion reads `\{` as an escaped literal brace and so counts one alternative. `createGlobMatcher` builds minimatch with `windowsPathsNoEscape: true`, and the minimatch constructor rewrites every `\` to `/` before it expands braces, so the matcher compiles every alternative the cap never saw.

Reproduced with the installed minimatch 10.2.5 and the exact options in `src/file-glob/match.ts`:

- `x` followed by sixteen copies of `\{a,b}` (97 characters): the cap sees 1 alternative and allows it; minimatch compiles 65,536 and `createGlobMatcher` took about 26.7 s to build, blocking the event loop.
- `*a*a*\{b,c,d}`: the cap sees one three-star name and allows it; minimatch compiles three three-star alternatives, which the combined star budget forbids.

With `nonegate` and `nocomment` set, that backslash rewrite is the only change the minimatch constructor makes to the pattern before brace expansion (`parseNegate` and the comment check are off, and `assertValidPattern` only checks type and length), so closing it closes the class of pre-expansion mismatches for these options.

## Goal

The cap predicate and the matcher read the same string: the cap refuses exactly the patterns whose compiled alternatives break the existing caps, whether or not they are written with backslashes, and the existing caps, values, and refusal text stay unchanged.

## Approach

In `src/file-glob/pattern-limits.ts`, export `normalizeGlobPattern(pattern)`, which rewrites every `\` to `/` — the rewrite minimatch applies under `windowsPathsNoEscape`. `isGlobPatternTooComplex` keeps the raw length check, then brace-expands and star-counts `normalizeGlobPattern(pattern)`; `hasTooManyStars` splits on `/` alone. Extend the module comment to say the cap reads the matcher's normalized pattern and why.

In `src/file-glob/match.ts`, `createGlobMatcher` normalizes once and hands that same string to both the predicate and `new Minimatch`, keeping `windowsPathsNoEscape: true`. The string minimatch receives then has no backslash, so its own rewrite is the identity and the compiled set is the expansion of exactly the string the cap judged, rather than a second copy of the rewrite that could drift.

`parseFileGlob` in `src/file-glob/command.ts` and `valid` in `src/remote/filesystem/glob-paths-operation.ts` call the same predicate, which normalizes internally, so neither call site changes.

## Implementation steps

1. Add `normalizeGlobPattern` and normalize inside `isGlobPatternTooComplex` in `src/file-glob/pattern-limits.ts`; drop the `\\` split in `hasTooManyStars`; extend the comment.
2. In `src/file-glob/match.ts`, normalize once and pass the normalized string to the predicate and to `Minimatch`.

## Tests

- `src/file-glob/pattern-limits.test.ts` (patterns written with `String.raw`): `x` plus seven backslash-`{a,b}` groups is refused; `x` plus six is allowed; `*a*a*` plus backslash-`{b,c,d}` is refused; `*a*a*` plus backslash-`{b,c}` is allowed; `normalizeGlobPattern` rewrites each backslash to `/`; the existing `*a*` backslash `*b*` case stays allowed.
- `src/file-glob/match.test.ts`: `createGlobMatcher` for `x` plus sixteen backslash-`{a,b}` groups is built and answers `false` against a 60-character name in well under 100 ms (about 26.7 s before); a backslash still acts as a path separator, so `a\b.ts` matches `a/b.ts`.
- `src/file-glob/command.test.ts`: `parseFileGlob` refuses both bypass patterns with the too-complex message.
- `src/remote/filesystem/operations.test.ts`: `glob-paths` with each bypass pattern is invalid.

Existing cap, matcher, parser, and operation tests keep passing untouched.

## Docs and specs

None. `help/file.md`, `product/specs/acp.md`, and `product/specs/remote-server.md` state the caps in terms of `{a,b}` combinations and stars per name; the rules do not change, only how faithfully they are applied.

## Out of scope

- Changing the caps' values or the refusal text.
- minimatch's `optimizationLevel: 2` preprocessing after brace expansion, which turns each `**/../<p>/<p>` into two patterns. That multiplier is not a pre-expansion rewrite and is not counted by the cap; it is reported for a separate entry.
- Moving matching off the main event loop.
