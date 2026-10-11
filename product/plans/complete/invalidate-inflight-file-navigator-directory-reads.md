# Invalidate In-Flight File Navigator Directory Reads

Complexity: 7/10

## Goal

Ensure a watcher event invalidates in-flight reads for the changed directory so an older listing or row-detail result cannot restore stale data or interfere with a replacement read.

## Approach

Use request identity markers for asynchronous listing reads and per-row stat reads. `invalidateDirectory` removes the changed listing marker and the stat markers for direct children. Completion handlers update cache entries and release markers only when their request identity is still current. A stat batch spanning directories applies each row independently, preserving results for unaffected directories. Keep `cacheGeneration` as the whole-cache invalidation guard.

## Implementation steps

1. Change listing and stat in-flight state in `src/file-navigator/state.ts` from sets to identity maps and initialize those maps in `freshFileNavigatorState`.
2. Update `listingFor`, `fillStats`, `clearFilesystemCache`, and `invalidateDirectory` in `src/file-navigator/filesystem-cache.ts` to guard writes and marker release by both whole-cache generation and request identity.
3. Add deferred tests for a listing invalidated before completion, replacement reads settling in either order, stale rejection, and stat batches spanning changed and unchanged directories.
4. Update `product/specs/file-navigator-tab.md` to state that watcher invalidation prevents earlier reads from restoring stale rows or details.
5. Run `./scripts/run.mjs check-diff`.

## Tests

- Verify a stale listing success and rejection do not repopulate the changed directory or remove the replacement marker.
- Verify a stale stat result is discarded for invalidated rows while unaffected rows in the same batch remain usable.
- Verify both completion orders leave the changed directory with the replacement result.
- Verify unrelated directory caches remain intact.

## Out of scope

- Revoking filesystem watchers themselves.
- Changing full refresh, pull, or reroot invalidation behavior.
