# Keep the glob walker fail-soft when the workspace root cannot be resolved

**Complexity: 2/10** — ~10 added lines in 1 file, 2 requirements, 2 test scenarios (p=3.59)

The link target check (`file-glob-walker-link-target-check.md`) made `walkGlob` resolve `options.root` with an unguarded `await realpath(...)` while building its state. A root removed or renamed between validation and walking (the default start is the root itself) now makes `walkGlob` reject, where before it returned no paths with `truncated` and `timedOut` false, as the "Read failures, completed" decision in `file-glob-3-sorted-walker-2-dirs-links-secrets-deadline.md` requires. It is the one failure path in the walker that is not fail-soft.

## Goal

When the workspace root cannot be resolved, `walkGlob` returns `{ paths: [], truncated: false, timedOut: false }` without walking, the same result as a deleted start directory. A resolvable root behaves exactly as before.

## Approach

Verified against the code: `walkGlob` in `src/file-glob/walk.ts` sets `realRoot: await realpath(options.root)` inside the `WalkState` literal with no `try`/`catch`; every other filesystem call in the walker (`readSorted`, `classify`, `linkTargetAllowed`) already maps a rejection to a skip. `realRoot` is only consumed by `checkRealTarget` in `src/file-read/policy.ts`, which expects canonical paths, so falling back to the unresolved `options.root` would wrongly drop in-root links under a symbolic-linked root such as macOS's `/var`. Instead, a missing root ends the walk with the empty result, which is correct because nothing under a missing root can be listed.

Add a small `resolveRoot(root): Promise<string | undefined>` helper that returns the `realpath` result or `undefined` on rejection. `walkGlob` calls it first and returns the empty result when it yields `undefined`, then builds the state with the resolved path.

## Implementation steps

1. In `src/file-glob/walk.ts`, add `resolveRoot` beside `linkTargetAllowed`.
2. In `walkGlob`, resolve the root before building `WalkState`; on `undefined`, return `{ paths: [], truncated: false, timedOut: false }`; otherwise use the resolved path as `realRoot`.

## Tests

In `src/file-glob/walk.test.ts`:

- A fresh `mkdtempSync` directory that is removed before walking, passed as both `root` and `start`, yields `{ paths: [], truncated: false, timedOut: false }` rather than rejecting.

Existing cases in `walk.test.ts` and `walk-modes.test.ts`, including the deleted-start case and `lists a symbolic link to a file in file mode only`, pass unchanged.

## Out of scope

- Changing `src/file-read/policy.ts` or the link target check itself.
- The second backlog entry (aligning the remaining plan sentences on link classification).
- User-facing specs and help: no spec or help page describes `file glob` yet, and the plans' "Read failures, completed" decision already states the behavior this restores.
