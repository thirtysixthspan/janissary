# Share the remote tab port setup between file read and file mutations

**Complexity: 3/10** — ~30 added lines, 3 production files edited, 4 requirements, 4 test scenarios (p=4.67)

`src/file-write/tab-write.ts` copies the remote branch of `src/file-read/tab-read.ts`: its own session counter, channel/ready/workspace lookup, open-and-dispose sequence, and a second `Remote connection unavailable.` constant in `src/file-write/outcome.ts`.

## Goal

One helper opens a tab's remote filesystem port for both `file read` and file mutations, and one constant names the unavailable outcome. No behavior changes.

## Approach

Add `src/file-read/remote-tab-port.ts` exporting `REMOTE_UNAVAILABLE` and `withRemoteTabPort(managers, label, prefix, run)`. It looks up the channel, ready promise, and workspace; returns `REMOTE_UNAVAILABLE` when any is missing; otherwise opens a `RemoteFileSystemPort` with session id `<prefix>-<n>` from a module counter, awaits `run(port, workspace)`, and disposes the port in a `finally`.

## Implementation steps

1. Create `src/file-read/remote-tab-port.ts` with the helper and constant.
2. Rewrite `readRemoteFile` in `src/file-read/tab-read.ts` to use the helper with prefix `file-read`, keeping its error-to-line mapping inside the callback; import the shared constant.
3. Rewrite `mutateRemoteFile` in `src/file-write/tab-write.ts` with prefix `file-write`; drop its counter.
4. Have `src/file-write/outcome.ts` import the shared constant instead of declaring its own (no re-export; nothing else imported it from there).

## Tests

New `src/file-read/remote-tab-port.test.ts`:
- returns the unavailable line without running when the tab has no channel, ready promise, or workspace;
- runs the callback with the workspace and a port, returning its result;
- uses incrementing `<prefix>-<n>` session ids;
- disposes the port (detaches the navigator) after success and after a thrown callback.

Existing `tab-read.test.ts`, `tab-write.test.ts`, `outcome.test.ts`, and `src/commands/file.test.ts` stay unchanged and green.

## Out of scope

Any change to wording, session id prefixes, or local read/write paths.
