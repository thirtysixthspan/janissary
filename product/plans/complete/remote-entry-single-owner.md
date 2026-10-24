# Give the remote session entry one owner for its ending, readiness, cache owner and usability

**Complexity: 6/10** — four consolidations inside the remote layer and its two outside readers, each replacing hand-copied steps with one helper; the entry stays a plain record for now.

## Goal

The steps that end an unreferenced remote entry, settle its readiness, name its file-cache owner, and decide whether an agent run may use it each have one definition. A new ending path or settle site cannot miss a step, and a changed cache-owner key cannot silently stop cached files being cleared when a session ends.

## Approach

This is the first increment the backlog entry describes, and it leaves the entry's type and its other transitions where they are.

1. **Ending.** `RemoteManager.release` writes out the last-reference sequence (capture the session id, `finish()`, `channelClosed`, `closeAfterShutdown()`, drop the session record) that `finishUnreferencedEntry` already holds, apart from its `closed` guard. The last-reference branch of `release` calls `finishUnreferencedEntry` instead. An already-closed entry has nothing left to finish, so the guard changes nothing a caller can see.
2. **Readiness.** `ready` is settled from five sites in `src/remote/entry-factory.ts`, one in `src/remote/resume.ts` and one in `src/remote/manager-closed.ts`, under `!entry.closed`, `!entry.settled`, or both. Add `settleEntryReady(entry, result)` beside `isEstablished` in `src/remote/attach.ts`. It does nothing when the entry is already settled or closed. Otherwise it marks it settled and either records the workspace directory and home and resolves, or rejects with the given error. Every site calls it. The after-settlement `reportRemoteRefusal` branch for `workspace-failed` stays at its call site. `remoteChannelClosed` settles before `markEntryEnded` marks the entry closed, and remembers whether it was already settled for its terminated notice.
3. **Cache owner.** `{ destination, workspaceRoot, workspaceLabel }` is built literally in `markEntryEnded`, twice in `src/file-navigator/manager/files.ts`, and once in `src/plugins/remote-capabilities.ts`. Add `remoteCacheOwner(entry)` in `src/remote/attach.ts`, answering `undefined` until the workspace has landed, and use it at all four.
4. **Usability.** `RemoteManager.acquireAgentLease` refuses an entry that is closed, detached, or has no workspace, while `establishedLabel` in `src/agent/remote-target.ts` checks only attached and workspace. Add `isUsableEntry(entry)` beside `isEstablished` and use it in both, so `establishedLabel` also refuses a closed entry still in the table.

## Implementation steps

1. Add a colocated `src/agent/remote-target.test.ts` pinning which live entries `establishedLabel` reuses (through `resolveRemoteAgentTarget`), before changing its predicate.
2. Add `settleEntryReady`, `remoteCacheOwner`, and `isUsableEntry` to `src/remote/attach.ts`, and use `remoteCacheOwner` in `markEntryEnded`.
3. Route every settle site through `settleEntryReady`.
4. Make `release` call `finishUnreferencedEntry`.
5. Use `remoteCacheOwner` in `src/file-navigator/manager/files.ts` and `src/plugins/remote-capabilities.ts`.
6. Use `isUsableEntry` in `acquireAgentLease` and `establishedLabel`.

## Tests

- New `src/agent/remote-target.test.ts`: `resolveRemoteAgentTarget` reuses an attached entry with a workspace on the same destination (matched case-insensitively), and opens a fresh channel instead for an entry that is detached, has no workspace, is on another destination, or is closed.
- `src/remote/attach.test.ts`: `settleEntryReady` resolves once with the directory and home, rejects with the error, and does nothing on a settled or closed entry; `remoteCacheOwner` answers `undefined` before the workspace lands and the owner after; `isUsableEntry` refuses a closed, detached, or workspace-less entry.
- Existing coverage stays green: `src/remote/manager.test.ts`, `src/remote/resume.test.ts`, `src/remote/attach.test.ts`, `src/file-navigator/manager/files.test.ts`, `src/plugins/remote-capabilities.test.ts`.

## Out of scope

- Moving the entry type and its helpers out of `src/remote/attach.ts`, or the `attach.ts` ↔ `manager.ts` type cycle.
- Turning the entry into a class whose transitions sit behind methods.
- `closeAll` and `terminateRemoteEntry`, which end the entry differently on purpose.
