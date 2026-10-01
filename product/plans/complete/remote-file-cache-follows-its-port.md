# Tie each cached remote file to the port it writes back through

**Complexity: 4/10** — the remote file cache (`src/file-navigator/remote/file-cache.ts`) gains `forgetRemoteFilesOf` and `isRemoteCacheFile`; the two navigator dispose sites call the former; `saveFile` (`src/editor/save.ts`) and `commitEditorFile` (`src/editor/commit.ts`) use the latter; `saveFile` writes remote-first. No new architecture.

`materializeRemoteFile` records `{ filesystem, root, relPath, label }` in a module-level map, cleared only when a whole remote workspace (or the whole cache) is cleared. A navigator disposes its port when it closes (`closeTabState` in `src/file-navigator/manager/profile.ts`) or is re-rooted away from the remote (`releaseRemote` in `src/file-navigator/open.ts`), but the record kept the disposed port. Separately, `saveFile` wrote the local cached copy *before* the remote write, so any failed remote write — a disposed port, a refusal, a dropped connection — left the local copy holding content the remote never received.

## Goal

- The cached copy follows the remote: it is written only after the remote accepts the content; a failed write leaves it unchanged (and the editor dirty, as before).
- A record lives exactly as long as its port: disposing a navigator's port forgets the records that write back through it.
- A cached copy with no record is refused on save with a notification saying its navigator is closed, rather than silently saved only locally; committing one is refused as for any remote file.

## Approach

1. `file-cache.ts`: `forgetRemoteFilesOf(filesystem)` drops every record holding that port (the files stay — an editor may hold one open); `isRemoteCacheFile(file)` answers whether a path lies inside the cache root.
2. Call `forgetRemoteFilesOf(state.filesystem)` just before `state.filesystem.dispose()` in `closeTabState` and `releaseRemote`. (`retarget` only disposes local ports, which own no records.)
3. `saveFile`: refuse an orphaned cache file (`isRemoteCacheFile && !remoteFileFor`) with a notification and a thrown error before any write; for a remote file, `saveRemote` awaits the remote write and only then runs the local write and `finishSave`.
4. `commitEditorFile`: test `isRemoteCacheFile` rather than `remoteFileFor`, so an orphaned cached copy is never committed to the local repository.

## Tests

- `src/file-navigator/remote/file-cache.test.ts`: a refused remote write leaves the cached copy unchanged; `forgetRemoteFilesOf` forgets only that port's records and leaves the file; saving an orphaned cached copy throws, notifies, sends nothing, and leaves the copy unchanged; `isRemoteCacheFile` answers only for paths inside the cache. Existing save and draft cases keep passing.
- New `src/file-navigator/manager/profile.test.ts`: `closeTabState` disposes the port and forgets its records.

## Out of scope

- Re-binding an orphaned cached copy to a newly opened navigator on the same remote root.
- Validating the shape of remote replies.
