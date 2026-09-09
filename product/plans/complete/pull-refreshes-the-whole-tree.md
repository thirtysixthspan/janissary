# A pull's refresh reaches the whole tree, and nothing read before it can land after it

**Complexity: 4/10** — one field on the per-tab state, two guards and one pruning condition in `filesystem-cache.ts`, four call sites that lose a line each, plus the tests that pin both halves. No new architecture, no wire-protocol change, and no change to what a pull does on disk.

The header's **Pull from origin** button runs `git pull` at the tree's root and then refreshes the view rather than waiting on directory watchers "a git-driven replace may not deliver" (`product/specs/file-navigator-tab.md`). The refresh is `clearFilesystemCache` — drop every cached listing and stat — followed by a rebuild that re-reads them.

For a local tree that works, and an end-to-end test against a real git repository (added by this plan) proves it: a pull that adds and removes files at the root and inside an expanded subdirectory is reflected immediately. For a tree whose reads are asynchronous — a remote tree over a workspace channel — the same refresh does two wrong things:

1. **It collapses the tree.** The rebuild that follows the clear has no listings yet, so it produces an empty row list. `pruneCachedRows` reads that empty list as "every expanded directory has disappeared from disk", deletes all of them from `expanded`, and stops their watchers. The pull's refresh destroys the view it was meant to update.

2. **A read started before the pull can land after it.** `clearFilesystemCache` empties `listings` and `stats` but not `listingLoads`/`statLoads`, and it has no way to disown a promise already in flight. When that pre-pull read resolves it writes the pre-pull directory contents into the freshly cleared cache and calls `onReady`, so the tree renders the listing as it was *before* the pull — the precise failure the button exists to prevent. It also deletes the in-flight marker belonging to the read that replaced it, so which contents win is left to promise ordering.

The second half is not only the pull's. Every other wholesale-invalidation site — `rerootTree`, `retarget`, and the two remote-root updates — spells out `clearFilesystemCache(state)` followed by `state.listingLoads.clear(); state.statLoads.clear();`, and each is open to the same late write. On a reroot that is worse than staleness: a read of the *old* root resolving after `state.root` has moved is stored as the *new* root's listing under the same relative path.

## Goal

Clicking the pull button leaves the tree showing the post-pull filesystem, with the directories the user had expanded still expanded, whether the tree's reads are synchronous or asynchronous. Nothing read before an invalidation can be shown after it.

## Design decisions

**A cache generation, not more bookkeeping at each call site.** The problem is that a promise in flight cannot tell whether the cache it was started for still exists. One counter on the tab state, bumped by `clearFilesystemCache` and captured by each read before it starts, answers that exactly: on resolution, a read whose generation no longer matches returns without touching `listings`, `stats`, either load set, or `onReady`. Clearing the load sets alone cannot fix this — it unblocks a second read but leaves the first one free to overwrite it.

**`clearFilesystemCache` becomes the whole invalidation.** It already meant "drop the cache"; the four callers that follow it with `listingLoads.clear(); statLoads.clear();` were saying the rest of that sentence themselves, and the pull — the one caller that didn't — is the bug. Folding those two lines in makes the function's name true and removes the chance for the next caller to forget. The callers lose the duplicated lines; nothing else about them changes.

**Prune only what a loaded parent listing proves is gone.** `pruneCachedRows` currently infers "this directory no longer exists" from its absence in the rows just built, which is sound only when those rows were built from real listings. An expanded path is now pruned only when its parent directory's listing is actually in the cache — the case where the rows genuinely say the directory is missing. A synchronous tree loads every visible listing during the same build, so its behavior is unchanged; an asynchronous one simply defers the decision to the rebuild that `onReady` triggers, by which time the parent is loaded.

**The rows a remote tree shows during the round trip are out of scope.** Between the clear and the arriving listings a remote tree renders its waiting state, as it already does whenever the root listing is loading. Keeping the previous rows on screen through a refresh would mean holding a second, shadow copy of the cache; it is a separate change and not what the issue asks for.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The cache, its two load sets, and the wholesale clear | `src/file-navigator/filesystem-cache.ts` |
| The pull's invalidate-then-rebuild sequence | `invalidateAfterPull` in `src/file-navigator/manager-pull.ts` |
| The other four invalidation sites | `navigation.ts` (`rerootTree`), `open.ts` (`updateRemoteRoot`, `retarget`), `open-command.ts` (`openRemoteTree`) |
| The per-tab state record and its two construction sites | `state.ts`; `open.ts:16`, `open-command.ts`'s `freshState` |
| A tree-relative path's parent | `parentPath` in `src/file-navigator/index.ts` |
| Tests that drive the manager against a real temp-directory tree | `src/file-navigator/manager.test.ts` |
| Tests that shell out to a real `git` | `src/gitignore.test.ts`, `src/git/identity.test.ts` |

## Implementation steps

1. **`src/file-navigator/state.ts`: add `cacheGeneration: number`**, commented as what a read captures to tell whether the cache it was started for is still the current one. Initialize it to `0` at both construction sites (`open.ts`'s state literal and `open-command.ts`'s `freshState`).

2. **`src/file-navigator/filesystem-cache.ts`: make the invalidation whole and generation-aware.**
   - `clearFilesystemCache` increments `state.cacheGeneration` and clears `listings`, `stats`, `listingLoads`, and `statLoads`.
   - `listingFor` captures the generation before starting an asynchronous read; both of its settle paths return immediately when `state.cacheGeneration` has moved on.
   - `fillStats` does the same for its batched `statRows` call.
   - `pruneCachedRows` skips an expanded path whose parent listing is not in `state.listings`, since the rows just built cannot say whether it is gone.

3. **Drop the now-duplicated clears** at the four sites that follow `clearFilesystemCache` with `listingLoads.clear(); statLoads.clear();` — `navigation.ts`'s `rerootTree`, `open.ts`'s `updateRemoteRoot`, and `open-command.ts`'s `openRemoteTree` — and let `retarget` in `open.ts`, which clears all four maps by hand, call `clearFilesystemCache` instead.

4. **`src/file-navigator/manager-pull.ts`: update `invalidateAfterPull`'s comment** to say that the clear also disowns reads that were already in flight, so nothing read before the pull can be rendered after it. No code change.

## Tests

- `src/file-navigator/filesystem-cache.test.ts` (new) — against a state whose `readDirectory`/`statRows` return promises the test resolves by hand: `clearFilesystemCache` empties both caches and both load sets and moves the generation on; a listing read in flight across the clear writes nothing and fires no `onReady`; the read issued after the clear still completes and lands, so the stale one cannot take its in-flight marker with it; a stat batch in flight across the clear is discarded the same way; `pruneCachedRows` keeps an expanded directory whose parent listing has not loaded yet, still prunes one whose loaded parent no longer lists it, and still stops the pruned directory's watcher.
- `src/file-navigator/pull-refresh.test.ts` (new) — end-to-end against a real git repository (a bare origin, an author clone that pushes, and the tree's own clone), with no git mocking and live watchers: after the pull button's `pull()`, the tree shows a file the pull added at the root and one it added inside an expanded subdirectory, no longer shows either of the files it removed, and still has the subdirectory expanded.
- `src/file-navigator/manager.test.ts` must pass unchanged — its existing pull cases pin the notifications line, the button's flash sequence, coalescing, and that a failed pull rebuilds nothing.

## Out of scope

- **Holding the previous rows on screen while a remote tree's refresh is in flight.** See the design note above.
- **Refreshing other navigator tabs rooted in the same repository.** A pull in one tree still leaves a second tree's rows to its own watchers; deciding which trees share a repository needs a repository-root lookup the navigator does not do today.
- **What a pull does when git blocks on credentials**, or any other change to `pullRoot` itself.
- **The watchers a git-driven directory replace silently orphans.** The explicit refresh exists because of them; re-arming them is a separate concern.
- **Changing when `waitingFor` is reported**, or anything else in the payload.
