# Hosted write tool 8 — carry the write policy over the remote `write-file` operation

**Complexity: 5/10** — ~35 added lines across 5 files, 6 requirements, 11 scenarios (p=5.43).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 8 of 15 in the hosted write tool series. Depends on plan 7 (`janissary-hosted-agent-write-tool-7-write-policy-port.md`), which adds the selector to the port contract and the local port.

A remote workspace must be written on its own machine, with no local target, temporary file, or cached copy. The `write-file` operation already does that for editor saves, with one base64 copy of the content. This plan makes it carry the tool-text selector, makes the far side validate and enforce it, and bumps the protocol so a peer that would ignore it is refused at the handshake.

## Goal

`RemoteFileSystemPort.writeFile` forwards `policy: 'tool-text'` in the `write-file` request when supplied, the far side validates it at the frame boundary and runs the local port's tool-text branch in its own workspace, and an older remote cannot be paired.

## Design decisions and dependencies

- Source plan decision: `policy` is an optional remote `write-file` argument accepting only `'tool-text'`, validated by the `write-file` descriptor; anything else (other strings, numbers, `null`) is an invalid request. Omission leaves the frame exactly as today.
- The far side repeats every path, secret, size, and text check through plan 7's local branch and plans 4 and 5, rather than trusting caller-side checks.
- Content keeps its existing single base64 layer; the frame codec does not re-encode it (protocol version 22's rule). No file-cache path is involved: nothing here goes through `src/file-navigator/remote/file-cache.ts`.
- `src/file-navigator/remote/port.ts` is at 193 counted lines. Source plan decision: move its `writeFile` request wrapper into `src/file-navigator/remote/port-reads.ts`, beside the existing `remoteReadLines`, leaving a one-line delegation in the port.
- With the tool policy, the wrapper answers an absolute path locally with the `Outside the workspace` failure value before mapping or sending, mirroring `remoteReadLines`, because the path mapper would otherwise turn an absolute path inside the remote workspace into a relative one.
- Bump `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` from 40 to 41, or to the next unused version if another protocol change has landed first, with a version comment: an older remote would drop `policy` and apply the editor's looser write rules while both ends looked healthy. Plan 9 adds `edit-file` with its own bump, because each subplan can merge and ship on its own; if plans 8 and 9 ship in the same release, the implementer of plan 9 may fold the two into one bump and one comment.
- `write-file` stays in the long-running deadline set. Nothing retries: a timed-out or disconnected write reports the existing remote reason and may already have committed.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-navigator/remote/port.ts` `writeFile` | Base64 encoding and `expectedHash` forwarding |
| `src/file-navigator/remote/port-reads.ts` `remoteReadLines` | Extraction pattern and absolute-path answer |
| `src/remote/protocol-frames.ts` `RemoteFilesystemArgumentsByOperation['write-file']` | Frame argument type |
| `src/remote/filesystem/write-file-operation.ts` | Descriptor validation, decoding, and dispatch |
| `src/remote/filesystem/argument-checks.ts` `requireString`, `stringValue` | Boundary validation |
| `src/remote/protocol.ts` version history comments | Bump convention |

## Proposed changes

Add optional `policy?: 'tool-text'` to the `write-file` frame arguments. In the descriptor, validate it, decode it, and pass it to `context.filesystem.writeFile`. Move the remote write wrapper into `port-reads.ts`, forward `policy`, and add the absolute-path answer for the policy case. Bump the version with its comment.

Update `product/specs/remote-server.md`: `write-file` may carry `policy: 'tool-text'`, the far side then enforces the tool rules in its own workspace, content still crosses as one base64 copy with no local cache or temporary file, and the new protocol version.

## Tests

- `src/file-navigator/remote/port.test.ts`: the frame carries `policy` only when supplied; content stays single base64; an absolute path with the policy is answered locally and sends no frame; the no-policy frame is unchanged; close, end, and timeout still resolve as failure values.
- `src/remote/filesystem/operations.test.ts`: the descriptor accepts absent and `'tool-text'` policy and rejects other strings, numbers, and `null`.
- `src/remote/serve-file-navigator.test.ts`: a policy write over the channel lands only in the far-side workspace and creates nested parents there; a secret path and invalid UTF-8 are refused on the far side; no local file-cache entry or temporary file appears.
- `src/remote/protocol.test.ts`: the version expectation moves to the new number and the previous version is refused at the handshake.
- Remote editor save tests stay green unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- The `edit-file` operation (plan 9) and the port edit contract (plan 10).
- Command and ACP wiring (plans 11 through 13).
- Retrying uncertain writes.
