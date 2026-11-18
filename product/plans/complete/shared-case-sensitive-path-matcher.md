# Route include/exclude path selection through one case-sensitive matcher

**Complexity: 3/10** — ~30 added lines in 1 production file, 5 behavioral requirements and 8 test scenarios (p=4.71); a localized swap of the matcher behind `filterPaths` with no new architecture.

## Goal

`src/search/filter-paths.ts` filters workspace file lists by the `include` and `exclude` fields used by file grep, the file navigator, and the search plugin. It calls `path.matchesGlob`, which folds case on macOS and Windows with no way to turn it off, while file glob builds its matcher in `src/file-glob/match.ts` with minimatch's `nocase: false` and is case-sensitive on every host. The same mixed-case include pattern therefore selects different files depending on which command runs. Make both pipelines share one case-sensitive matcher so a pattern selects the same paths everywhere. No command, flag, key binding, or user-visible syntax changes.

## Approach

Reuse `createGlobMatcher` from `src/file-glob/match.ts` as the single matcher behind both pipelines. It already compiles minimatch with the documented option set (`nocase: false`, `nonegate`, `noext`, POSIX rules, `dot` from its `hidden` argument) and applies the shared complexity guard from `src/file-glob/pattern-limits.ts`, so routing `filterPaths` through it aligns case semantics with file glob without duplicating either the options or the guard. Pass `hidden: false`, matching `path.matchesGlob`'s default where `*` does not cross into dot-names.

Keep the behavior unique to `filterPaths` in `filter-paths.ts` itself:

- Build one selector per comma-separated pattern, compiling its matcher once and reusing it for every path rather than recompiling per path.
- The `**/` retry for a pattern with no `/`, so a bare `*.test.ts` reaches files at any depth.
- The directory-prefix rule for a pattern that is not a glob, so `src` selects everything beneath `src/`.
- Empty include selects everything, empty exclude removes nothing, and exclude wins over include.

Dropping `path.matchesGlob` also drops the Node `path` import. No module is added and no import boundary changes: `filter-paths.ts` is core (and on the search plugin's import allow-list), and importing a sibling core module creates no cycle.

## Implementation steps

1. In `src/search/filter-paths.ts`, replace the `node:path` import with an import of `createGlobMatcher` and its `GlobMatcher` type from `../file-glob/match.js`. Keep `patterns`, `normalize`, and `GLOB_CHARS` unchanged.
2. Replace `selects`/`anySelects` with a `selector(pattern): GlobMatcher` factory that normalizes the pattern, compiles `createGlobMatcher(normalized, false)` plus a `**/${normalized}` matcher when the normalized pattern has no `/`, records whether the pattern is a glob, and returns a matcher applying the direct match, the deep retry, the early return for globs, and the directory-prefix rule in today's order.
3. Have `filterPaths` compile include and exclude selectors once from the parsed fields, preserve the empty-fields fast path, and evaluate each path against the selector lists with `some`, keeping exclude-wins. Run `$janissary/scripts/run.mjs check-diff`.
4. Run the full `$janissary/scripts/run.mjs check-diff` once more with all changes in place.

## Tests

- `src/search/filter-paths.test.ts` (existing): every current case must keep passing unchanged — directory prefix, glob at depth, `./` anchoring, trailing slash and backslash, exclude by prefix and glob, bare wildcard and character class at any depth, boundary crossing, comma-separated patterns, whitespace trimming, exclude-wins, no match, invalid pattern, extensionless file, and prefix non-match.
- Add a cross-pipeline case asserting `filterPaths` and `createGlobMatcher` select the same paths for a set of slash-containing mixed-case patterns, so case sensitivity is pinned to agree with file glob on every host.
- `src/file-glob/match.test.ts` (existing): its case-sensitivity, hidden-name, pattern-limit, and refusal cases stay green; no new case required.
- `src/file-grep/filter-worker.test.ts` and `src/plugins/search/scan.test.ts`: the pipelines that consume `filterPaths` keep their existing include/exclude assertions passing. The `hostile glob responsiveness` cases are adapted: because `filterPaths` now inherits file glob's complexity guard and literal-extglob rules, a hostile pattern is refused in a fast, ordinary match instead of forcing a long backtrack, so those cases assert a quick clean resolve and an unblocked parent. The pending-worker abort path stays covered by the existing FakeWorker test.

## Out of scope

- Changing `src/file-glob/match.ts`, its minimatch options, or the shared pattern-limit constants.
- New commands, flags, key bindings, or help/documentation changes; this is a behavior-alignment fix with no new syntax.
- Changing normalization already done in `filterPaths` (the `./` strip, trailing-slash strip, and backslash folding) or the comma-separated field grammar.
- Tightening file-read/write/patch canonicalization or any other case-folding debt tracked separately in the backlog.
