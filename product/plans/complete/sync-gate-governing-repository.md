# Govern the sync gate by the repository containing the file, not the navigator tab's root

**Complexity: 3/10** — one containment test added to an existing synchronous predicate, using an accessor (`rootOf`) the manager already exposes. No new state, no new accessor, no async work, no UI or protocol change. The number is not lower because the containment test has to agree with the path normalization the same function already performs, and because it changes which of two existing answers a real activation gets.

Work item, verbatim: *"Resolve the governing checkout against the repository that actually contains the file rather than the navigator tab's root, which can be a different repository from the one the sync path was matched against."*

`OpenFileManager.isSyncPath` decides a path is config-listed by making it relative to `managers.tab.launchDir`, but takes the branch answer from `managers.fileNavigator.onPrimaryBranch(label)` — the branch of the *activating navigator tab's own root*. The completed sync plan justified that with "a navigator rooted outside the project launch dir is moot anyway, since `syncPaths` are launch-dir-relative and a file outside it never matches." That reasoning holds for a navigator rooted *beside* or *below* the launch dir, but not for one rooted *above* it: `files ~/dev` with the project at `~/dev/janissary` lists files that do match the launch-dir-relative sync paths, while reporting a branch belonging to a different repository — or, when the parent is not a repository at all, to none.

So a user browsing the project from a navigator rooted one directory up activates a backlog file while the project sits on its default branch, and gets an unsynced ordinary tab because the parent directory is unconfirmable. The mirror case is worse: a parent directory that *is* a repository sitting on `master` enables syncing on the strength of an unrelated repository's branch.

## Design decisions

- **The launch dir is the arbiter of containment, because it is already the arbiter of matching.** The path half of the gate is decided entirely against `launchDir`; taking the branch half from a root that may sit outside it is the inconsistency. A navigator governs only when its root is the launch dir or below it — exactly the region in which its branch is the branch the matched path belongs to.
- **Containment, not equality.** A navigator rooted at `product/` inside the project is still the right governing tree: it is inside the same checkout, so its branch is the project's branch. Only a root at or above the launch dir's parent — or on a wholly different path — is disqualified.
- **A disqualified navigator falls back, it does not disable.** Failing the containment test produces the same answer a non-navigator open already gets: the launch dir's own cached branch pair. That is the conservative, already-tested path, so the failure mode is an existing one rather than a new one.
- **The containment test is normalized the same way the match is.** `isSyncPath` already builds its relative path with `path.relative(...).split(path.sep).join('/')`; the root test uses `path.relative` in the same form, treating an empty result (root *is* the launch dir) and any result that neither escapes upward nor is absolute as contained.
- **No new accessor.** `FileNavigatorManager.rootOf(label)` already answers a label's tree root and already returns `undefined` for a label that names no navigator tab, which is exactly the "no navigator governs" signal the gate needs.
- **A nested repository inside the launch dir keeps governing.** This plan does not resolve the enclosing git repository of the file with a git call; it keeps the existing cached-value design and only stops trusting a root that provably sits outside the matched region. Resolving the true containing repository for a nested checkout below the launch dir remains the completed plan's documented behavior.

## Proposed changes

- `src/open/file-manager.ts` — `isSyncPath` gains a containment test between the config-path check and the navigator read: the navigator's answer is consulted only when `managers.fileNavigator.rootOf(label)` resolves to the launch dir or a directory inside it; otherwise the gate goes straight to `isLaunchDirOnPrimaryBranch(launchDir) ?? false`. The containment test itself goes in a small private helper beside `isSyncPath`, so the gate reads as two conditions rather than four clauses, and the comment on `isSyncPath` names the out-of-project navigator as a fallback case.

No other file changes: `rootOf` already exists, and the fallback branch is unchanged.

## Tests

- `src/open/file-manager.test.ts`, `branch gate` block:
  - A navigator whose `rootOf` is the launch dir governs exactly as today — a config-listed path with the navigator on a feature branch opens as an ordinary editor tab, and the launch-dir cache is never consulted.
  - A navigator whose `rootOf` is the launch dir's *parent* falls back to the launch-dir cache: with the navigator reporting a feature branch and the launch dir reporting primary, the file still routes into the sync workspace, and `isLaunchDirOnPrimaryBranch` is called with the launch dir.
  - A navigator rooted in a subdirectory of the launch dir still governs, pinning that containment is "at or below" rather than "equal to".
  - `makeSyncedManagers`'s navigator stub gains a `rootOf` alongside its `onPrimaryBranch`, defaulting to the launch dir so every existing case keeps its current governing tree.
- The two pre-existing synced-path cases above the `branch gate` block cover the unchanged matching half and must keep passing untouched.

## Out of scope

- Resolving the file's enclosing git repository with a git call. The gate stays synchronous and reads values resolved elsewhere; this plan narrows which cached value it trusts, it does not add a lookup of its own.
- A navigator rooted in a *nested* repository below the launch dir, which continues to govern its own subtree as the completed plan describes.
- Keeping remote (SSH-rooted) trees out of the gate, which still rests on their materialized path not matching a launch-dir-relative sync path.
- Any user-visible indication of which checkout governed a given open.

## Verification

- `./scripts/run.mjs check-diff`
