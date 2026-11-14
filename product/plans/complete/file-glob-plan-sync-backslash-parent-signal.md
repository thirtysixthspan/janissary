# Bring the file glob plan back in line with the backslash, `..` folder, and signal-chain repairs

**Complexity: 1/10** — 0 production lines or files (plan text only), 8 requirements, 0 test scenarios (p=3.13)

`product/plans/complete/file-glob.md` still describes the pattern caps and the matcher as they stood before three later repairs. The backslash-normalization repair judges the caps on the same normalized pattern minimatch expands; the `..` refusal repair adds a second refusal message and a parent-segment check; and the signal-chain repair pins cancellation at every hop. The canonical plan names neither the normalization, nor the `..` message and its reason, nor the cancellation tests, so a later reader could treat all three as unplanned.

## Goal

Every statement in the file glob plan's Pattern caps decision, Glob semantics decision, Proposed changes, Tests, and help-and-spec bullet matches `src/file-glob/pattern-limits.ts`, `src/file-glob/match.ts`, `src/file-glob/command.ts`, `src/remote/filesystem/glob-paths-operation.ts`, and the tests as they stand. Its `**Complexity: 7/10**` line stays unchanged, because it rates the original build.

## Approach

Edit only `product/plans/complete/file-glob.md`, taking every fact from the code. Rewrite only the sentences that are wrong or incomplete, and leave the rest of the plan as it is. This mirrors `product/plans/complete/file-glob-plan-sync.md`, which synced the earlier repairs.

## Implementation steps

1. **Pattern caps decision.** Say the caps are judged on `normalizeGlobPattern(pattern)` — every `\` rewritten to `/`, the rewrite minimatch applies under `windowsPathsNoEscape` — so `\{a,b}` counts as a real choice. Add that a pattern with a `..` name in any brace alternative is refused with `FILE_GLOB_PARENT_SEGMENT` (`Pattern cannot contain a .. folder: file glob only lists paths inside --path.`), because `optimizationLevel: 2` splits each `**/../<p>/<p>` into two patterns. Say `parseFileGlob` returns whichever message `globPatternRefusal` gives, and that the far-side `glob-paths` validation refuses both kinds through `isGlobPatternTooComplex`.
2. **Glob semantics decision.** Add that a backslash is a folder separator, not an escape, and that a `..` pattern is refused rather than matched as `path.matchesGlob` would.
3. **`pattern-limits.ts` bullet.** List `FILE_GLOB_PARENT_SEGMENT`, `normalizeGlobPattern`, and `globPatternRefusal` with its check order (length, brace alternatives, `..` name, star budget), and say `isGlobPatternTooComplex` is defined on it.
4. **Command-module bullet.** `parseFileGlob` returns `globPatternRefusal`'s message, not the fixed too-complex text.
5. **Matcher bullet.** `createGlobMatcher` normalizes once and hands that string to both the complexity predicate and `new Minimatch`.
6. **Tests — backslash and `..`.** Add the cases in `src/file-glob/pattern-limits.test.ts`, `src/file-glob/match.test.ts`, `src/file-glob/command.test.ts`, and `src/remote/filesystem/operations.test.ts`.
7. **Tests — cancellation.** Add the cases in `src/file-glob/glob.test.ts`, `src/file-glob/tab-glob.test.ts`, and `src/remote/serve-acp-loop.test.ts`.
8. **Help and spec bullet.** Note that `help/file.md`, `product/specs/acp.md`, and `product/specs/remote-server.md` state the `..` refusal. Verify every changed sentence against `src/file-glob/pattern-limits.ts`, `src/file-glob/match.ts`, and `src/file-glob/command.ts`; no code or test changes.

## Tests

None. This changes a plan document only, and the tests the repairs added already pin each behavior the plan now describes.

## Out of scope

- Any code, test, spec, help, or PR description change.
- The other entries in `product/backlog/pull-request.md`, including the backslash documentation proposal and the PR description correction.
- Changing the original plan's complexity rating.
