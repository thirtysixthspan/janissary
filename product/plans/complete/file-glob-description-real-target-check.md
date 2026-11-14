# Name the rebuilt real-target secret check in the PR description

**Complexity: 1/10** — description-only: 0 production lines, 0 files, 4 requirements (p=2.71)

## Issue

PR #2001's description names `positiveInteger` as the one piece `file read` and `file glob` now share, but never says that `checkRealTarget` in `src/file-read/policy.ts`, which `file read` and the hosted write tool rely on to refuse secret and outside paths, was rebuilt on a new exported `createRealTargetCheck`. Two later repairs are also missing from the implementation paragraph: backslashes in a pattern are normalized to `/` before the caps are checked, and a pattern with a `..` folder is refused.

## Approach

Change only the pull request description. Take the behavior from the code as it now stands:

- `createRealTargetCheck(realRoot)` in `src/file-read/policy.ts` resolves the home-secret anchors once and returns a check that does pure string work per call; `checkRealTarget` now calls it, so its results are unchanged. `src/file-glob/walk.ts` builds one per search as its `secretCheck`. `src/file-read/policy.test.ts` pins that both give the same results and that a linked home secret entry is resolved at creation.
- `globPatternRefusal` in `src/file-glob/pattern-limits.ts` judges `normalizeGlobPattern(pattern)` (every `\` turned into `/`), the same string `createGlobMatcher` in `src/file-glob/match.ts` compiles.
- `globPatternRefusal` returns `Pattern cannot contain a .. folder: file glob only lists paths inside --path.` when any `{a,b}` alternative has a `..` name. The far side's `glob-paths` validator rejects the same patterns as invalid through `isGlobPatternTooComplex`.

## Implementation

1. Read the current PR body with `gh pr view 2001 --json body`.
2. In the implementation paragraph, after the `A ** folder wildcard does not count as a *.` sentence, add one sentence on backslash normalization and one on the `..` folder refusal with its exact text.
3. In the same paragraph, after the `positiveInteger` sentence, add one sentence on `createRealTargetCheck`, its per-search use in the walk, and `checkRealTarget` being built on it with behaviour pinned by `src/file-read/policy.test.ts`.
4. In the remote paragraph, extend the far side's invalid-request clause to cover a pattern with a `..` folder.
5. Leave every other paragraph byte-for-byte unchanged, leave out change-set statistics, and apply the body with `gh pr edit --body-file ./temp/pr-body.md` after the push.

## Tests

None: no code, test, spec, or help changes. `src/file-read/policy.test.ts` and the `src/file-glob/` tests already pin the behavior described.

## Out of scope

- Changing any code, refusal text, spec, or help page.
- Any other paragraph of the description, and the PR title.
