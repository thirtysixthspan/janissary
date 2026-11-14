# State the file glob pattern caps in the PR description

**Complexity: 1/10** — description-only: 0 production lines, 0 files, 4 requirements (p=2.71)

## Issue

PR #2001's description says matching uses minimatch with Node's own `path.matchesGlob` options except case folding and never mentions the pattern complexity caps. It omits that the branch also turns off extglobs, so `+(a|b)` is matched literally unlike `path.matchesGlob`, that patterns over the caps are refused with the `Pattern too complex` message, and that the far side of a remote tab rejects such a pattern as an invalid `glob-paths` request.

## Approach

Change only the pull request description. Take the caps and the exact refusal from `src/file-glob/pattern-limits.ts` as it now stands: at most 1024 characters, at most 64 `{a,b}` combinations, and at most three `*` wildcards in one name, or two when the `{a,b}` choices expand to more than two patterns; a `**` folder wildcard does not count. The refusal is `FILE_GLOB_TOO_COMPLEX`. The reason is that each `*` nests another backtracking loop in the compiled matcher, which runs on the main event loop. Keep the wording consistent with `help/file.md` Finding files and the `glob-paths` paragraph of `product/specs/remote-server.md`.

## Implementation

1. Read the current PR body with `gh pr view --json body`.
2. In the implementation paragraph, name `noext` beside the case-folding exception, say `+(a|b)`-style groups are matched literally unlike `path.matchesGlob`, and add the caps, the exact refusal message, and why they exist.
3. In the remote paragraph, add that the far side refuses a `pattern` over the caps as an invalid request.
4. Leave every other paragraph byte-for-byte unchanged and apply the body with `gh pr edit --body-file ./temp/pr-body.md` after the push.

## Tests

None: no code, test, spec, or help changes. `src/file-glob/pattern-limits.test.ts`, `src/file-glob/match.test.ts`, and the `glob-paths` operation tests already pin the caps, the literal extglob behavior, and the far-side refusal.

## Out of scope

- Changing the caps, the refusal text, the matcher options, specs, or help.
- The optional Behavior examples line for a refused pattern.
- The other description corrections recorded in `product/backlog/pull-request.md`.
