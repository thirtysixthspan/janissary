# Hosted write tool 10 — `editFile` on both filesystem ports

**Complexity: 5/10** — ~35 added lines across 4 files, 6 requirements, 10 scenarios (p=5.32).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 10 of 15 in the hosted write tool series. Depends on plan 6 (`janissary-hosted-agent-write-tool-6-tool-text-edit.md`), plan 8 (`janissary-hosted-agent-write-tool-8-remote-write-policy.md`) for the wrapper module, and plan 9 (`janissary-hosted-agent-write-tool-9-edit-file-operation.md`) for the remote operation.

With the far side able to edit, the filesystem port contract gets an edit method, so the command executor in plan 11 can edit any workspace through whatever port the tab has. Locally it runs plan 6's helper; remotely it sends plan 9's `edit-file`.

## Goal

`FileSystemPort.editFile(root, relPath, oldString, newString, replaceAll)` returns `FileOperationResult` carrying a positive integer `replacements` on success, on both `LocalFileSystemPort` and `RemoteFileSystemPort`, with refusals, closed sessions, ended connections, and timeouts all reported as failure values.

## Design decisions and dependencies

- Source plan decision: extend `FileSystemPort` with an edit contract and add `editFile` to both port implementations. It always enforces the tool-text policy and takes no selector. Place it in the interface comment's group of methods that report refusals as values.
- `LocalFileSystemPort.editFile` delegates to plan 6's helper in one line, keeping `src/file-navigator/filesystem-port.ts` under 200 counted lines.
- `RemoteFileSystemPort.editFile` delegates in one line to a new wrapper in `src/file-navigator/remote/port-reads.ts`, beside plan 8's write wrapper. The wrapper answers an absolute path locally with the `Outside the workspace` failure value, maps the path through `RemotePortPaths`, encodes `oldString` and `newString` as UTF-8 base64 exactly once, and sends `replaceAll` as a boolean (false when omitted).
- Add `edit-file` to the long-running set in `src/file-navigator/remote/port-requests.ts`, beside `write-file`. No retry: a timed-out or disconnected edit reports the existing remote reason (`The remote machine did not answer in time.`, `The remote connection ended.`, `The remote file navigator is closed.`) and may already have committed. A late reply after expiry is dropped. Cancellation can prevent a request that has not been sent but cannot undo a committed edit.
- Test fakes that implement `FileSystemPort` gain an `editFile` so typecheck stays green.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-navigator/filesystem-port.ts` | Port contract and local port |
| `src/file-navigator/remote/port.ts`, `port-reads.ts` (plan 8) | Remote port and wrapper home |
| `src/file-navigator/remote/port-requests.ts` `RemotePortRequests`, `unavailableResult`, deadlines | Settlement and failure shaping |
| `src/file-write/edit.ts` (plan 6) | Local edit |

## Proposed changes

Add `editFile` to the interface, both port classes, the remote wrapper, the long-running set, and test fakes. Extend the remote-server spec's deadline paragraph in `product/specs/remote-server.md` to list `edit-file` among the long-running operations that are never retried.

## Tests

- `src/file-navigator/filesystem-port.test.ts`: local `editFile` replaces once, replaces all, and refuses zero and multiple matches as plan 6 specifies.
- `src/file-navigator/remote/port.test.ts`: the frame carries base64 `oldString`/`newString` once and the boolean; a success reply decodes the count; an invalid count rejects as an invalid result; an absolute path is answered locally without a frame; close, end, and timeout each resolve as failure values; a late reply after timeout is dropped and nothing is resent.
- `src/file-navigator/remote/port-requests.test.ts`: `edit-file` uses the long deadline.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Typed commands and ACP routing (plans 11 through 13).
- Retrying uncertain mutations, or adding a lock or queue service.
