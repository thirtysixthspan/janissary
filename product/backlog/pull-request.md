<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Share the remote tab port setup between the typed file reader and the new file mutator instead of duplicating it.

Existing Issue: `src/file-write/tab-write.ts` copies the remote branch of `src/file-read/tab-read.ts` nearly line for line, with its own module-level session counter, its own channel, ready, and workspace lookup, its own open-and-dispose sequence, and a second `Remote connection unavailable.` constant in `src/file-write/outcome.ts` beside the private one in `tab-read.ts`. Severity: 2/10

Existing Risk: 3/10 - A later change to how a tab's remote port is opened, scoped, or reported unavailable, such as the session id scheme or the unavailable wording, has to be made twice, and a miss leaves reads and writes on the same tab behaving differently.

Proposal Risk: 1/10 - A behavior-preserving extraction already covered by both modules' tests; the main hazard is changing a session id prefix that a test asserts.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "extract the shared remote tab port helper for file read and file mutations". Add a helper beside `localReadRoot` in `src/file-read/tab-read.ts`, or in a new small module such as `src/file-read/remote-tab-port.ts`, exporting the single `REMOTE_UNAVAILABLE` constant and a `withRemoteTabPort(managers, label, prefix, run)` that looks up the channel, ready promise, and workspace, returns `REMOTE_UNAVAILABLE` when any is missing, opens a `RemoteFileSystemPort` with an incrementing `<prefix>-<n>` id, awaits `run(port, workspace)`, and disposes the port in a `finally`. Use it from `readRemoteFile` in `src/file-read/tab-read.ts` with prefix `file-read` and from `mutateRemoteFile` in `src/file-write/tab-write.ts` with prefix `file-write`, and have `src/file-write/outcome.ts` import the shared constant instead of declaring its own. `src/file-write/tab-write.test.ts`, `src/file-write/outcome.test.ts`, and the existing `file read` tab tests must pass unchanged.
