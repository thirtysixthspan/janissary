# Resolve the file glob's home-secret locations once per walk

**Complexity: 3/10** — ~25 added lines, 2 files, 4 requirements, 7 test scenarios (p=4.69)

`isSecretMatch` in `src/file-glob/walk.ts` calls `checkLexicalPath` for every match the pattern accepts, and under a linked `--path` also `checkRealTarget`. Both reach `isUnderHomeSecret` in `src/file-read/policy.ts`, which runs `realpathSync` on the home directory and on each `SECRET_DENY_PATHS` entry's literal location (recursing to parents for missing ones), and `checkLexicalPath` additionally resolves the root. A glob near its match limit therefore issues thousands of blocking `realpath` calls on the server's main loop, while the file glob plan promises the secret check costs no I/O per match. `linkTargetAllowed` pays the same cost again for every in-root link.

## Goal

The walk resolves the home directory and the home-secret locations once, before it visits any entry, and the per-match secret check is pure string work. Every path `file read` refuses as `Secret file` is still omitted: secret names and table runs relative to the root, and anything whose real location falls under a home-secret entry in its literal or resolved form, including when the workspace is, or is inside, the home directory.

## Approach

In `src/file-read/policy.ts`, split `isUnderHomeSecret` into a resolver that computes the lowercase anchor list (each entry joined to the resolved home, in literal and resolved forms) and a pure containment test over that list. Add `createRealTargetCheck(realRoot)`, which resolves the anchors once and returns a function with exactly `checkRealTarget`'s result for a real target. `checkRealTarget` becomes `createRealTargetCheck(realRoot)(realTarget)` and `checkLexicalPath` keeps calling `isUnderHomeSecret`, so `file read` and the tool writer behave exactly as today.

The glob's lexical check on a root-relative path equals the real-target check on the root's real path joined with that relative path: the relative path is already contained and normalized, `checkLexicalPath` anchors the home test at `resolveExisting(root)`, which is the walk's `realRoot`, and the relative path recovered from the join is the same one `isSecretPath` tests. So `walkGlob` builds one check alongside `realRoot` and `isSecretMatch` applies it to `realRoot + rootRelative` and, under a linked start, to `realRoot + realPrefix + startRelative`. `linkTargetAllowed` keeps its one async `realpath` of the link (that is the link target, not policy I/O) and applies the same check.

## Implementation steps

1. `src/file-read/policy.ts`: add `resolveHomeSecretAnchors()` and `isUnderAnchors(anchors, realFile)`; rebuild `isUnderHomeSecret` on them; add and export `createRealTargetCheck(realRoot)`; rebuild `checkRealTarget` on it.
2. `src/file-glob/walk.ts`: add a `secretCheck` field to `WalkState` built with `createRealTargetCheck(realRoot)` in `walkGlob`; use it in `isSecretMatch` and `linkTargetAllowed`; drop the `checkLexicalPath`/`checkRealTarget` imports.

## Tests

- `src/file-read/policy.test.ts`: `createRealTargetCheck` gives the same results as `checkRealTarget` for an inside path, a root-relative secret, an outside path, and a home `.ssh` target, and refuses a target under a home `.aws` that is a link to another home folder.
- New `src/file-glob/walk-secrets.test.ts` (mocking `node:fs` `realpathSync` with a spy around the real one, `HOME` stubbed to a temp directory): the number of `realpathSync` calls for a walk is the same with 2 matches and with 40; a walk rooted at the home directory omits a file under a home `.aws` that is a link to another home folder (reached through that folder's real name) and lists ordinary files; a walk rooted at the home `.ssh` directory lists nothing; an in-root link to a file inside the home secret target is omitted.
- Existing secret tests in `src/file-glob/walk-modes.test.ts`, `src/file-glob/glob.test.ts`, and `src/file-read/` keep passing untouched.

## Spec

None: user-visible behavior does not change.

## Out of scope

- The other `product/backlog/pull-request.md` entries (caller-side refusal, linked `--path` ignored lookup).
- Making the one-time anchor resolution asynchronous, or changing `checkLexicalPath`'s per-call cost for `file read`.
