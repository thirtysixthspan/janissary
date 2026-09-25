# Server-side conflict check for the single-item file-navigator move

## Complexity

6/10. One optional flag is threaded through the single-item move: the wire params and their decoder, the dispatcher, the controller RPC and its adapter, the manager and its mutation helper, the filesystem port on both the local and remote side, the remote operation table, and the client move hook. The remote change moves `REMOTE_PROTOCOL_VERSION` to 20. One new module: the remote port's two move operations move into `src/file-navigator/remote-port-moves.ts` (the `remote-port-git.ts` pattern), because the conflict mapping pushed `remote-port.ts` past the 200-line limit. Every hop is a small edit, but a missed one shows up as a move that can never be confirmed.

## Goal

The navigator has two move paths with different safety contracts. The multi-item move (`moveBatch` in `src/file-navigator/batch.ts`) checks every destination on disk and answers `{ conflictPaths }` when something is in the way. The single-item move (`moveItem` in `src/file-navigator/filesystem.ts`, reached through `moveOne` in `src/file-navigator/manager-item-operations.ts`) calls `renamePath`, a bare `renameSync` that silently replaces an existing file. The client's only guard is `resolveDropTarget` in `web/src/file-navigator/file-navigator-drag.ts`, which can see only loaded rows. Dropping a file onto a row inside a collapsed folder that already holds a same-named file therefore replaces it with no dialog, and undo cannot bring the overwritten file back.

The confirmed-overwrite retry in `web/src/file-navigator/useFileNavigatorMoveOperations.ts` also sends exactly the message a no-conflict move sends, so the server cannot tell consent from ignorance.

After this change the server refuses a replacement it was not told to make, for local and remote trees alike, and the client opens the conflict dialog from the server's answer.

## Approach

Give the single move the same contract the batch move has.

- `moveFileNavigatorItem` params in `src/protocol/file-navigator.ts` gain `overwrite?: boolean`, and its decoder in `src/client-params/file-navigator.ts` accepts it through `optionalBoolean`.
- `moveItem` in `src/file-navigator/filesystem.ts` takes `overwrite = false`. When the destination `path.join(destination, name)` already exists and is not the source itself, and `overwrite` is unset, it returns `{ conflictPaths: [fromRelPath] }` without touching disk. When `overwrite` is set it goes through the existing `moveReplacingDestination`. The existence test uses `exists` from `batch-paths.ts`, the same `lstat` check `moveBatch` uses, rather than `hasNameConflict` from `index.ts`: `hasNameConflict` lists the directory through `readDirSorted`, which filters `.DS_Store` and a few other names, so it would miss a real conflict on exactly those names. The source-equals-destination exception keeps a move into the item's own parent a no-op rename, as it is today.
- A new exported type `MoveOneResult = FileOperationResult<{ from: string; to: string }> | { conflictPaths: string[] }` in `filesystem.ts` is what `FileSystemPort.move` returns. `move` gains an optional `overwrite` argument on the interface and both implementations.
- `moveOne` returns `BulkMoveResult`. A conflict answer passes through unchanged, with nothing pushed to history and no rebuild.
- `moveItem` in `manager-mutations.ts`, `FileNavigatorManager.move`, `moveFileNavigatorItem` in `src/controller/file-navigator.ts`, the controller adapter, and the dispatcher in `src/message/file-navigator.ts` all forward the flag. The controller RPC returns the `BulkMoveResult` and reports a failure through `reportOperationFailure` only when the answer is not a conflict, exactly as `moveFileNavigatorItems` does. `CLIENT_METHOD_CONTRACTS.moveFileNavigatorItem` moves from `'ack'` to `'result'` so the answer reaches the client.
- Remote: `RemoteFileSystemPort.move` sends `overwrite` when set and maps a `conflictPaths` answer back to tree-relative paths. The `move` descriptor in `src/remote/filesystem-operations.ts` validates an optional boolean `overwrite` and decodes it only when present. A version-19 remote would drop the flag and keep replacing files silently while both ends looked healthy, so `REMOTE_PROTOCOL_VERSION` moves to 20 with a comment saying why.
- Client: `requestMove` in `useFileNavigatorMoveOperations.ts` keeps the client-side `conflict` flag as a hint. When the hint is set it opens the dialog directly, as today. Otherwise it sends the move as a `request` and opens the same scalar **Overwrite** / **Cancel** dialog when the server answers with `conflictPaths`. The dialog's confirm sends `overwrite: true`; nothing else ever does. The stale comment above `resolveDropTarget` is corrected to describe what the server now does.

Rejected: routing the single move through `moveBatch` with one source. It would make the batch path's `moved`/`mutated` bookkeeping and its "items already in the destination are no-ops" filtering the single move's behavior too, and change the failure reporting shape the single move uses today. Threading one flag is smaller and keeps each path's existing reporting.

## Implementation steps

1. Server filesystem layer: add `MoveOneResult` and the `overwrite` parameter to `moveItem` in `src/file-navigator/filesystem.ts`; update `FileSystemPort.move` and `LocalFileSystemPort.move` in `src/file-navigator/filesystem-port.ts`.
2. Manager and RPC chain: `moveOne` (`manager-item-operations.ts`), `moveItem` (`manager-mutations.ts`), `FileNavigatorManager.move` (`manager.ts`), `moveFileNavigatorItem` (`src/controller/file-navigator.ts`), the adapter (`src/controller/file-navigator-adapter.ts`), the dispatcher (`src/message/file-navigator.ts`), the params type (`src/protocol/file-navigator.ts`), the decoder (`src/client-params/file-navigator.ts`), and the reply contract (`src/client-message.ts`).
3. Remote: `RemoteFileSystemPort.move` (`src/file-navigator/remote-port.ts`, delegating with `moveMany` to the new `remote-port-moves.ts`), the `move` descriptor (`src/remote/filesystem-operations.ts`), and the version bump with its comment (`src/remote/protocol.ts`).
4. Client: `useFileNavigatorMoveOperations.ts` and the comment in `file-navigator-drag.ts`.
5. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/file-navigator/filesystem.test.ts`: a move onto an existing same-named file without `overwrite` answers `{ conflictPaths: [from] }` and leaves both files intact; the same move with `overwrite` replaces the destination and removes the source.
- `src/file-navigator/manager.test.ts` (or the closest manager-level file): a conflicting single move returns the conflict, pushes nothing onto the undo stack, and leaves both files on disk.
- `src/controller/file-navigator.test.ts`: a conflict answer is returned to the caller and posts no failure notification.
- `src/client-params/file-navigator.test.ts`: `overwrite: true` is accepted and a non-boolean `overwrite` is refused.
- `src/message/handler.test.ts`: the dispatcher forwards `overwrite` (the existing routing case is updated to the four-argument call, since forwarding the flag is the deliberate change).
- `src/remote/filesystem-operations.test.ts`: `move` decodes `overwrite` only when sent and refuses a non-boolean one.
- `src/remote/serve-file-navigator.test.ts`: a remote `move` onto an existing file answers a conflict and leaves both files; with `overwrite` it replaces.
- `src/file-navigator/remote-port.test.ts`: the port sends `overwrite` and maps a conflict answer back to tree-relative paths.
- `src/remote/protocol.test.ts`: the pinned version literal moves to 20 (deliberate).
- `web/src/file-navigator/useFileNavigatorMoveOperations.test.ts`: a no-hint move whose server answer is a conflict opens the scalar dialog, and its confirm sends `overwrite: true`; the existing confirm case asserts the flag.
- `web/src/file-navigator/useFileNavigatorDrag.test.ts` and `FileNavigatorTab.test.tsx`: the no-conflict drop cases now assert a `request` rather than a `send` (the transport change is deliberate), and the `confirmOverwrite` case asserts `overwrite: true`. A new case drops onto a target with no visible conflict, has the server answer a conflict, and checks that the dialog opens and its confirm sends `overwrite: true`. Drag tests that drop onto a valid target only to check highlighting or the ghost label get a `request` stub on their client fixture; their assertions are unchanged. The "does not invent conflicts for children absent from collapsed client rows" case in `file-navigator-drag.test.ts` stays valid and unchanged.

## Out of scope

- Restoring an overwritten file on undo (the separate `undoCopyPaste` identity item covers the history side).
- Removing `hasNameConflict`, which still has no production caller.
- Unifying the single and batch move paths.

## Documentation and specification impact

`product/specs/file-navigator-tab.md` says "a visible name conflict" offers **Overwrite** or **Cancel** for one item. It changes to say any name conflict, including one inside a collapsed folder the tree has not loaded, is detected on disk before anything moves. `product/specs/remote-server.md` gains a paragraph for the version-20 bump. `documentation/user-documentation/tab-types/file-navigator.md` already says a single-item name conflict opens the dialog, which is what now happens, so it needs no change; `help.md` does not describe this flow.
