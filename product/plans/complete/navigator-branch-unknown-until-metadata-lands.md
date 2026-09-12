# Distinguish unloaded navigator git metadata from a confirmed non-primary branch

**Complexity: 4/10** — one optional field on an existing per-tab state record, three one-line writes (set on a landed refresh, clear on reroot, read in the accessor), and one changed return value on an accessor that already has an `undefined` case. No new module, no new subsystem, no protocol or UI change. The number is not lower because the marker has to be cleared on every path that changes a tab's root, and because the accessor's new `undefined` is load-bearing for a caller in a different feature.

Work item, verbatim: *"Give the file navigator's primary-branch answer a 'not yet known' state so a file activated from a freshly opened navigator is not silently opened unsynced."*

`FileNavigatorManager.onPrimaryBranch` answers `isPrimaryBranch(state.branch, state.defaultBranch)` for any label that names a navigator tab. Between `manager.open` and the first `refreshGit` result, both of those fields are still `undefined`, and `isPrimaryBranch` reads an absent current branch as "cannot confirm" — so the accessor returns a confident `false` for a tab that has simply not loaded its git metadata yet. That window is not short: `loadGitMetadata` resolves a whole-tree `changedPaths` in the same `Promise.all`, which is seconds rather than milliseconds on a large repository. A user who opens a file navigator and immediately activates a config-listed file on the project's default branch gets an ordinary editor tab instead of the synced workspace copy, and the same activation a second later behaves differently with nothing on screen explaining why.

## Design decisions

- **The unknown is a marker, not an inference.** "Has a git-metadata result landed for this root?" cannot be recovered from `branch`/`defaultBranch`, because both are legitimately `undefined` after a *successful* load of a non-repository root. A dedicated boolean on `FilesTabState` is the only honest way to say it.
- **The marker is scoped to the current root, not the tab.** `refreshGit` already discards a result whose `current.root !== root`; the marker is written inside that same guard, so it records "metadata landed *for this root*". `rerootTree` clears it alongside `state.branch`, so a rerooted tab answers unknown until the new root's metadata lands rather than answering from the previous repository.
- **`undefined` keeps its existing meaning at the call site.** `OpenFileManager.isSyncPath` already treats a `undefined` navigator answer as "no navigator governs this open" and falls through to the launch-dir cache. Returning `undefined` for an unloaded navigator reuses that branch exactly: the answer becomes the launch dir's, which for the ordinary case (a navigator rooted in the project, opened on the project's default branch) is the same answer the navigator would have given a second later.
- **Only one level of unknown exists, and it still lands on the safe answer.** `isLaunchDirOnPrimaryBranch` already returns `undefined` both for "not yet cached" and "cached but unconfirmable", and `isSyncPath` maps that to `false` with `?? false`. So the fallback chain has exactly one unknown state and one terminal answer; no second marker is introduced there, and the conservative "no sync" direction is preserved when nothing at all is known yet.
- **No new refresh trigger.** Every existing refresh point — open, reroot, pull, watcher rebuild — already routes through `refreshGit`, so the marker is set by all of them without new plumbing.

## Proposed changes

- `src/file-navigator/state.ts` — `FilesTabState` gains an optional `gitMetadataLoaded` boolean beside `branch`/`defaultBranch`, documenting that it records whether a `gitMetadata` result has landed for the tab's *current* root, and that it exists so the sync gate can tell an unloaded tab apart from a confirmed feature branch.
- `src/file-navigator/git-refresh.ts` — set `current.gitMetadataLoaded = true` inside the existing `current.root === root` block that already writes `gitStatuses`, `branch`, `githubUrl`, and `defaultBranch`. A result discarded for a changed root leaves the marker alone, which is what keeps it root-scoped.
- `src/file-navigator/navigation.ts` — `rerootTree` clears `state.gitMetadataLoaded` where it already resets `state.gitStatuses` and `state.branch` after assigning the new `state.root`.
- `src/file-navigator/manager.ts` — `onPrimaryBranch` returns `undefined` when `state.gitMetadataLoaded` is not set, and the classification otherwise. Its comment is updated to say `undefined` now covers two cases: the label is not a navigator tab, and the navigator has not yet loaded git metadata for its current root.
- `src/open/file-manager.ts` — no code change. The existing `if (navigatorPrimary !== undefined) return navigatorPrimary;` already routes the new `undefined` to the launch-dir fallback. Its comment gains a clause naming the unloaded-navigator case, so the reason the fallback is reachable from a navigator open is written down.

No protocol, client, or `FileNavigatorView` change: the marker is consumed server-side only.

## Tests

- `src/file-navigator/manager.test.ts`, `default branch metadata` block:
  - `onPrimaryBranch(label)` is `undefined` before the first metadata result resolves, and `true` after it lands (deferring the `defaultBranch`/`currentBranch` mocks so the pre-resolution state is observable).
  - A reroot resets the answer to `undefined` until the new root's metadata lands.
  - The existing `answers onPrimaryBranch only for file-navigator tabs` case keeps passing unchanged for its non-navigator labels.
- `src/open/file-manager.test.ts`, `branch gate` block: a navigator whose accessor returns `undefined` consults the launch-dir cache — asserting `isLaunchDirOnPrimaryBranch` is called with the launch dir and the tab routes by *its* answer rather than opening unsynced outright. `makeSyncedManagers` already takes `navigatorPrimary: boolean | undefined`, so the fixture needs no change.

## Out of scope

- Making the gate read git live instead of from a cached value. The deliberate ceiling set by the completed sync plan stands: a branch switched outside the app is applied at the next metadata refresh.
- Which checkout governs the gate when a navigator is rooted outside the launch dir — a separate entry in this pull request's backlog.
- Splitting `isLaunchDirOnPrimaryBranch`'s fire-and-forget refresh out of its read — also a separate entry.
- Any user-visible indication that a tab's sync state was decided before its navigator finished loading.

## Verification

- `./scripts/run.mjs check-diff`
