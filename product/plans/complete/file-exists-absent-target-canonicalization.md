# `file exists` answers correctly for dangling symlinks and absent paths behind escaping symlinks

**Complexity: 3/10** — ~20 added lines in one production file, 6 requirements, 8 scenarios (p=4.75)

## Goal

Make the local `file exists` executor answer the correct single word for two absent-target cases it currently gets wrong: a symlink whose target does not exist must answer `link`, and an absent path reached through a symlink that points outside the workspace must answer `forbidden`. A genuinely absent plain path must still answer `missing`, and every existing answer (file, dir, link, absent, escape, no-echo) must stay unchanged.

## Background

`fileExistsInTab` in `src/file-exists/tab-exists.ts` runs `checkLexicalPath` first, then `resolveRealTarget`, then `checkRealTarget`, then `readRowStat`. `resolveRealTarget` calls `canonicalPath` (an alias of `realpathSync.native`) on the requested path; for an absent target — including a dangling symlink and a path beneath a symlink whose leaf is missing — that call throws `ENOENT`/`ENOTDIR`, and `canonicalFailure` turns the throw into an early `missing`. That short-circuit happens before `checkRealTarget`, so a workspace escape hidden behind a missing leaf is never seen, and before `readRowStat`, whose `lstat` would otherwise report the symlink as `link`.

`src/file-read/policy.ts` has a private `resolveExisting` (lines 31-38) that resolves the nearest existing ancestor with `realpathSync` and rejoins the missing tail. Its own `checkRealTarget` contract (comment at lines 69-72) says callers must pass the realpath of the nearest existing parent joined with the remaining segments for a target that does not exist yet. Reusing that algorithm here makes both checks run on the intended paths.

## Approach

Replicate `resolveExisting` locally in `src/file-exists/tab-exists.ts` (keeping `policy.ts` untouched and the fix to one production module). When `canonicalPath` of the requested path throws `ENOENT`/`ENOTDIR`, compute `realTarget` with `resolveExisting` instead of returning `missing`; keep returning `forbidden` for every other error code. `realRoot` stays `canonicalPath(root)`.

This lets `checkRealTarget` see the resolved real target: an escaping symlink's nearest existing ancestor sits outside the root, so containment returns `Outside the workspace` and the answer is `forbidden`. For a dangling symlink the nearest existing ancestor is the root and the rejoined leaf keeps the link's own spelling, so containment passes and `readRowStat`'s `lstat` reports `link`. A plain absent path's rejoined target stays inside the root, containment passes, and `readRowStat` returns `null`, so the answer remains `missing`. Keep the `checkLexicalPath`-first ordering and the one-word, no-echo output unchanged.

## Implementation steps

1. In `src/file-exists/tab-exists.ts`, import `realpathSync` from `node:fs` alongside `constants`.
2. Replace `canonicalFailure` with a boolean `isAbsentPathError` helper that returns true only for `ENOENT`/`ENOTDIR`, so non-absent errors still yield `forbidden`.
3. Add a local `resolveExisting(location)` helper using the same `realpathSync` / `path.dirname` / `path.basename` recursion as `policy.ts:31-38`. Include one short comment stating that resolving the nearest existing ancestor preserves escape detection for `checkRealTarget` and the link's own spelling for `readRowStat`.
4. Change `resolveRealTarget` so its catch branch, for an absent-path error, returns `{ realRoot: canonicalPath(root), realTarget: resolveExisting(target) }` guarded by a nested try/catch that returns `forbidden` on failure; non-absent errors keep returning `forbidden`.
5. Run `$janissary/scripts/run.mjs check-diff` after the source change.

## Tests

Add colocated executor tests to `src/file-exists/tab-exists.test.ts`, mirroring its existing temp-directory and `managersWith` helpers:

- a symlink whose target does not exist answers `link` (dangling symlink).
- an absent path reached through a symlink pointing outside the workspace answers `forbidden`.
- a plain absent path still answers `missing`.

The existing file, dir, link, absent, escape, no-echo, `.git`/`.janissary`, workspace-root, usage, and no-echo tests must keep passing untouched.

Run `$janissary/scripts/run.mjs check-diff` after writing the tests.

## Specs and documentation

- Create `product/specs/file-exists.md` describing the observable one-word answers of `file exists`, including `link` for a dangling symlink, `forbidden` for a path that escapes the workspace through a symlink even when the leaf is absent, and `missing` for a genuinely absent plain path. No existing spec covers this command yet; the help pages do not yet describe `file exists`, so no help or user-documentation change belongs in this fix.

## Out of scope

- No changes to `src/file-read/policy.ts` or any other production module.
- No change to the lexical-first check ordering, the one-word vocabulary, or the no-echo guarantee.
- No remote-tab or dispatcher behavior, no native-command or agent integration, and no help-page additions (those belong to the feature's docs subplan).
- No description correction on the pull request.

## Verification

`$janissary/scripts/run.mjs check-diff` must pass clean after the source change and again after the tests. No `npm run check`.
