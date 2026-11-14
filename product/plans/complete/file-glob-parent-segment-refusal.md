# Refuse file glob patterns with a `..` path segment

**Complexity: 4/10** — ~15 added lines in 2 production files, 5 requirements, 12 test scenarios (p=4.90)

`createGlobMatcher` compiles patterns with minimatch's `optimizationLevel: 2`. Its first preprocessing phase runs after brace expansion and rewrites every `<pre>/**/../<p>/<p>/<rest>` into two patterns, `{<pre>/../<p>/<p>/<rest>, <pre>/**/<p>/<p>/<rest>}`, and repeats until nothing changes. The complexity caps in `isGlobPatternTooComplex` count only the brace alternatives, so this split is invisible to them.

Reproduced with the installed minimatch 10.2.5 and the exact options in `src/file-glob/match.ts`, `'**/../a/b/'.repeat(k) + 'c'` passes every cap (one alternative, no `*` in any name) and compiles:

- k=8 (81 characters): 256 patterns, about 6 ms
- k=10 (101 characters): 1,024 patterns, about 24 ms
- k=13 (131 characters): 8,192 patterns, about 0.72 s, blocking the event loop

Growth is about 3.4× in time per repeat, so a pattern well inside the 1024-character cap blocks the server for far longer.

Every other optimizationLevel-2 rewrite was measured with the same options and found to shrink or keep the pattern count: `**/**` collapses to `**`, `.` and empty segments are dropped, `<p>/..` pairs are removed, and the second phase only merges patterns. `**/a/**/`, `**/./**/`, `**//**/`, `**/*/**/`, `./a/`, `a/../b/`, `*/../a/` and `../**/a/` repeated 12 times each compile one pattern. `**/../**/` repeated grows linearly (5 patterns at k=4, 9 at k=8), and it too contains `..`. The `**/../` split is the only multiplier, and it needs a literal `..` segment.

## Goal

A pattern with a `..` path segment in any brace alternative, after backslashes are read as `/`, is refused by `file glob`, matches nothing in `createGlobMatcher`, and is an invalid `glob-paths` request, so minimatch never sees one. Every other pattern compiles and matches exactly as before.

## Approach

Candidate paths handed to the matcher are always relative to `--path` with no `..` segments, so a `..` in a pattern can only climb out of the search folder (which matches nothing) or cancel the folder before it (`x/../src/a.ts` is a roundabout `src/a.ts`). Refusing the segment loses nothing a user needs and removes the only input that triggers the split.

Keeping `optimizationLevel: 2` rather than dropping to 1: level 1 has no split (the reproducer compiles one pattern in 0.3 ms at k=13), but it also stops dropping `.` segments, so `src/./a.ts` would stop matching `src/a.ts`, changing the documented `path.matchesGlob` semantics. Refusing `..` closes the multiplier with no semantic change to any accepted pattern.

In `src/file-glob/pattern-limits.ts`:

- Add `FILE_GLOB_PARENT_SEGMENT`, a clearer refusal than the too-complex text: `Pattern cannot contain a .. folder: file glob only lists paths inside --path.`
- Add `globPatternRefusal(pattern)`, which returns the refusal message or `undefined`. It keeps the existing order: the length cap, then brace-expanding the normalized pattern and the alternatives cap, then the new check that no alternative has a `..` segment when split on `/`, then the star budget. Checking after expansion and normalization catches `{..,x}`, `.{.,}` and `\..`.
- `isGlobPatternTooComplex` becomes `globPatternRefusal(pattern) !== undefined`, so `createGlobMatcher`'s match-nothing fallback and `glob-paths` `valid` refuse `..` with no change at their call sites.
- Extend the module comment to explain the split and why `..` is refused.

In `src/file-glob/command.ts`, `parseFileGlob` returns `{ error }` with the message from `globPatternRefusal` instead of the fixed too-complex text.

## Implementation steps

1. Add the message, `globPatternRefusal`, the `..` check, and the comment in `src/file-glob/pattern-limits.ts`; redefine `isGlobPatternTooComplex` on top of it.
2. Switch `parseFileGlob` in `src/file-glob/command.ts` to `globPatternRefusal`.

## Tests

- `src/file-glob/pattern-limits.test.ts`: `globPatternRefusal` returns the parent-segment message for `../a`, `a/..`, `**/../a/b/c`, `{..,x}/a`, `.{.,}/a` and `a\..\b`; `isGlobPatternTooComplex` is true for them; names that merely contain dots (`..a`, `a..`, `...`, `.env`, `**/.github/**`) stay allowed; the too-complex message still comes back for the existing cap breaches.
- `src/file-glob/match.test.ts`: `createGlobMatcher('**/../a/b/'.repeat(13) + 'c', false)` is built and answers `false` in well under 100 ms (about 0.72 s before); `x/../a.ts` no longer matches `a.ts`; `src/./a.ts` still matches `src/a.ts`.
- `src/file-glob/command.test.ts`: `parseFileGlob` refuses `**/../a/b/c`, `{..,x}/*.ts` and `a\..\b` with the parent-segment message, and the existing too-complex refusals keep their message.
- `src/remote/filesystem/operations.test.ts`: `glob-paths` with `'**/../a/b/'.repeat(13) + 'c'`, `{..,x}/a` and `a\..\b` is invalid.

## Docs and specs

- `help/file.md`: state that a pattern with a `..` folder in it is refused with the new message.
- `product/specs/acp.md`: state the same rule beside the complexity caps.
- `product/specs/remote-server.md`: its `glob-paths` paragraph already says a pattern over the glob's complexity caps is invalid; widen it to patterns the local glob refuses, including a `..` folder.

## Out of scope

- Changing the existing caps, their values, or the too-complex text.
- Changing `optimizationLevel` or any other minimatch option.
- Moving matching off the main event loop.
