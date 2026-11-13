<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Stop advertising `expectedHash` in the agent's mutation primer, since an agent has no way to obtain the editor's private fingerprint it must match.

Existing Issue: `FILE_MUTATION_PRIMER` tells ACP agents that `"expectedHash" is optional on write`, but the value must equal the custom 53-bit `contentHash` fingerprint from `src/editor/save-conflict.ts`, which no tool output exposes (adding hashes to `file read` output is out of scope), so the option is unusable by the agent the primer addresses. Severity: 3/10

Existing Risk: 3/10 - An agent trying to be careful supplies a guessed hash such as a SHA-256 and receives `This file changed on disk since it was loaded`, a misleading refusal that spends tool steps against the eight-step cap or leads it to conclude the file is being changed concurrently.

Proposal Risk: 1/10 - Typed users and the parser keep `expectedHash`, so nothing is removed; the only cost is that an agent no longer learns about an option it could not use.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "remove expectedHash from the agent mutation primer". In `src/file-write/command.ts`, drop the `"expectedHash" is optional on write` clause from `FILE_MUTATION_PRIMER`, keeping the sentence about creating or overwriting files and missing parent folders, and leave `parseFileMutation` and `WRITE_KEYS` unchanged so typed and programmatic callers can still send it. Update `src/file-write/command.test.ts`, which asserts the primer contains `expectedHash` and has six lines, and check `src/acp/tool-table.test.ts`, which compares primers against the constant and should pass unchanged. If `product/specs/acp.md` describes the primer's contents, update that sentence to match.


* Share the remote tab port setup between the typed file reader and the new file mutator instead of duplicating it.

Existing Issue: `src/file-write/tab-write.ts` copies the remote branch of `src/file-read/tab-read.ts` nearly line for line, with its own module-level session counter, its own channel, ready, and workspace lookup, its own open-and-dispose sequence, and a second `Remote connection unavailable.` constant in `src/file-write/outcome.ts` beside the private one in `tab-read.ts`. Severity: 2/10

Existing Risk: 3/10 - A later change to how a tab's remote port is opened, scoped, or reported unavailable, such as the session id scheme or the unavailable wording, has to be made twice, and a miss leaves reads and writes on the same tab behaving differently.

Proposal Risk: 1/10 - A behavior-preserving extraction already covered by both modules' tests; the main hazard is changing a session id prefix that a test asserts.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "extract the shared remote tab port helper for file read and file mutations". Add a helper beside `localReadRoot` in `src/file-read/tab-read.ts`, or in a new small module such as `src/file-read/remote-tab-port.ts`, exporting the single `REMOTE_UNAVAILABLE` constant and a `withRemoteTabPort(managers, label, prefix, run)` that looks up the channel, ready promise, and workspace, returns `REMOTE_UNAVAILABLE` when any is missing, opens a `RemoteFileSystemPort` with an incrementing `<prefix>-<n>` id, awaits `run(port, workspace)`, and disposes the port in a `finally`. Use it from `readRemoteFile` in `src/file-read/tab-read.ts` with prefix `file-read` and from `mutateRemoteFile` in `src/file-write/tab-write.ts` with prefix `file-write`, and have `src/file-write/outcome.ts` import the shared constant instead of declaring its own. `src/file-write/tab-write.test.ts`, `src/file-write/outcome.test.ts`, and the existing `file read` tab tests must pass unchanged.
