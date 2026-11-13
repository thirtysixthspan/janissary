<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the security gap where a remote text edit can reach outside the tab's root through a parent-relative path that the local edit refuses.

Existing Issue: `remoteEditFile` refuses only absolute paths and then maps `relPath` against the remote workspace with `RemotePortPaths.to`, so a path such as `../other/file.txt` under a subfolder root is sent as a workspace-relative path the far side accepts, while `LocalFileSystemPort.editFile` refuses the same input as `Outside the workspace` relative to the root it was given. Severity: 5/10

Existing Risk: 5/10 - Once plan 11 routes agent edits through the port, an agent on a remote tab rooted at a subfolder can edit sibling files elsewhere in the remote workspace that the same request on a local tab would refuse, so the two ports enforce different containment boundaries behind one contract.

Proposal Risk: 2/10 - Both ports refuse root-escaping paths identically, leaving the far side's workspace-level check as defence in depth; a caller that legitimately relied on escaping the root would now be refused, which nothing currently does.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "refuse root-escaping relative paths in remoteEditFile before sending edit-file". In `src/file-navigator/remote/port-reads.ts` `remoteEditFile`, after the absolute-path check, compute `path.posix.relative(root, path.posix.resolve(root, relPath))` and return `failureResult('Outside the workspace')` without a frame when the result is `..` or starts with a `../` segment, matching the reason `resolveMutationTarget` in `src/file-write/target.ts` gives locally; keep the plain mapped path and base64 text unchanged otherwise. Add a case to `src/file-navigator/remote/port.test.ts` beside `answers an absolute edit path locally and sends no frame` that calls `editFile('/remote/ws/src', '../b.txt', ...)` and asserts the `Outside the workspace` failure and no `filesystem-request` frame, and add the matching local case to `src/file-navigator/filesystem-port-policy.test.ts`. The existing `remoteEditFile` tests (frame shape, zero-replacement rejection, close/end/timeout) must pass unchanged. `remoteWriteFile` under the tool-text policy shares the same shape and should be checked the same way in the same change.


* Pin the close-reason text in the remote edit settlement test, which the plan names but the test leaves unasserted.

Existing Issue: The plan's test list says close, connection end, and timeout each resolve as failure values with the named reasons, but the close case in `resolves an edit as a failure value on close, connection end, and timeout` asserts only `{ ok: false }` and never checks `The remote file navigator is closed.` Severity: 2/10

Existing Risk: 2/10 - A change to how a closed navigator settles an edit, such as an empty or wrong reason reaching the agent, would pass the test unnoticed.

Proposal Risk: 1/10 - The assertion then matches the plan exactly; the only remaining exposure is the shared `CLOSED_REASON` constant changing, which the import would track.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "assert the closed-navigator reason in the remote editFile settlement test". In `src/file-navigator/remote/port.test.ts`, change the close branch of `resolves an edit as a failure value on close, connection end, and timeout` from `toMatchObject({ ok: false })` to `toEqual({ ok: false, reason: CLOSED_REASON })`, importing `CLOSED_REASON` from `src/file-navigator/remote/port-requests.ts`; if the harness's `onClose` settles with a different reason, record that discrepancy rather than weakening the assertion. Run the server tests for that file and confirm its other cases stay green.
