# Hosted write tool 8 — carry the write policy over the remote `write-file` operation

**Complexity: 5/10** — ~35 added lines across 5 production files, 6 requirements, 13 test scenarios (p=5.49).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 8 of 15 in the hosted write tool series. Depends on plan 7 (`janissary-hosted-agent-write-tool-7-write-policy-port.md`, complete on this branch), which added trailing `policy?: FileWritePolicy` to `FileSystemPort.writeFile` (`src/file-navigator/filesystem-port.ts:95` `writeFile(`) and the tool-text branch of `LocalFileSystemPort.writeFile` (`src/file-navigator/filesystem-port.ts:191` `if (policy === 'tool-text') return writeToolTextBytes(...)`). `FileWritePolicy` is `'tool-text'` in `src/file-write/types.ts`.

A remote workspace must be written on its own machine, with no local target, temporary file, or cached copy. The `write-file` operation already does that for editor saves, with one base64 copy of the content. This plan makes it carry the tool-text selector, makes the far side validate and enforce it, and bumps the protocol so a peer that would ignore it is refused at the handshake.

## Goal

`RemoteFileSystemPort.writeFile` forwards `policy: 'tool-text'` in the `write-file` request when supplied, the far side validates it at the frame boundary and runs the local port's tool-text branch in its own workspace, and an older remote cannot be paired.

## Design decisions and dependencies

- Source plan decision: `policy` is an optional remote `write-file` argument accepting only `'tool-text'`, validated by the `write-file` descriptor; anything else (other strings, numbers, `null`) is an invalid request. Omission leaves the frame exactly as today: build the argument with the same conditional spread `expectedHash` already uses, so the key is absent rather than `undefined`.
- The frame argument type uses `FileWritePolicy` imported from `src/file-write/types.ts` (type-only import, `.js` extension), not a re-spelled literal, so a later policy value cannot drift between the port and the frame.
- The far side repeats every path, secret, size, and text check through plan 7's local branch (`writeToolTextBytes` in `src/file-write/port-adapter.ts`) rather than trusting caller-side checks. The far-side `context.filesystem` is a `FileSystemPort` (`src/remote/filesystem/operation-types.ts` `filesystem: FileSystemPort`), so the descriptor's `run` passes `args.policy` as the fifth `writeFile` argument and needs nothing else.
- Content keeps its existing single base64 layer; the frame codec does not re-encode it (protocol version 22's rule). No file-cache path is involved: nothing here goes through `src/file-navigator/remote/file-cache.ts`.
- `src/file-navigator/remote/port.ts` is at 193 counted lines and adding the policy parameter and its type import would push it toward the limit. Source plan decision: move the `writeFile` request body into a new exported function `remoteWriteFile` in `src/file-navigator/remote/port-reads.ts`, beside `remoteReadLines`, taking `(request, paths, root, relPath, content, expectedHash?, policy?)` the same way `remoteReadLines` takes the bound requester and path mapper. `RemoteFileSystemPort.writeFile` becomes a one-line delegation via `this.requester()`, like `readLines`. Update the file's header comment to say it holds the line read and the write.
- With the tool policy only, `remoteWriteFile` answers a POSIX-absolute `relPath` (`path.posix.isAbsolute`, as `remoteReadLines` does) locally with `failureResult('Outside the workspace')` (from `src/file-navigator/file-operation-result.ts`) before mapping or sending, because the path mapper would otherwise turn an absolute path inside the remote workspace into a relative one. `'Outside the workspace'` is the exact reason the local tool-text branch produces (`src/file-read/policy.ts` `if (path.isAbsolute(requested)) return 'Outside the workspace'`), so local and remote tabs report identically. Without the policy, an absolute path keeps today's editor behavior (mapped and sent).
- Bump `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` (currently `export const REMOTE_PROTOCOL_VERSION = 40;`) to 41, or to the next unused version if another protocol change has landed first, with a version comment above it in the style of the Version 32 `expectedHash` comment: an older remote would drop `policy` and apply the editor's looser write rules while both ends looked healthy. Plan 9 adds `edit-file` with its own bump, because each subplan can merge and ship on its own; if plans 8 and 9 ship in the same release, the implementer of plan 9 folds the two into one bump and one comment.
- `write-file` stays in the long-running deadline set (`src/file-navigator/remote/port-requests.ts:39`). Nothing retries: a timed-out or disconnected write resolves through the existing `settle`/`unavailableResult` refusal path with the existing remote reason and may already have committed. No change to `port-requests.ts` or the refusal shapes is needed; `refusedItem` already covers `write-file`.
- Web typecheck: none of the touched files is reachable from `web/src` (no web import of `src/remote/**` or `src/file-navigator/remote/**`), and `port-reads.ts` gains only `file-operation-result.ts` and a type import, so no `web/tsconfig.json` change is needed.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-navigator/remote/port.ts` `writeFile` | Base64 encoding and `expectedHash` conditional spread; body moves to `remoteWriteFile` |
| `src/file-navigator/remote/port-reads.ts` `remoteReadLines` | Extraction pattern and absolute-path answer |
| `src/file-navigator/file-operation-result.ts` `failureResult` | Local absolute-path failure value |
| `src/file-write/types.ts` `FileWritePolicy` | Policy type for the frame argument and port parameter |
| `src/remote/protocol-frames.ts:36` `RemoteFilesystemArgumentsByOperation['write-file']` | Frame argument type; add `policy?: FileWritePolicy` |
| `src/remote/filesystem/write-file-operation.ts` `writeFileOperation` | `valid`, `decode`, and `run`; follow the `expectedHash` pattern (`=== undefined \|\|` check, conditional spread) |
| `src/remote/filesystem/argument-checks.ts` `requireString`, `stringValue` | Boundary validation; additionally require the value to equal `'tool-text'` |
| `src/remote/protocol.ts` version history comments | Bump convention |

## Proposed changes

In order, each step keeping typecheck green:

1. `src/remote/protocol-frames.ts`: add optional `policy?: FileWritePolicy` to the `write-file` arguments.
2. `src/remote/filesystem/write-file-operation.ts`: `valid` accepts `args.policy === undefined || args.policy === 'tool-text'`; `decode` carries it only when present; `run` passes `args.policy` after `args.expectedHash`.
3. `src/file-navigator/remote/port-reads.ts` and `port.ts`: add `remoteWriteFile`, forward `policy`, add the policy-only absolute-path answer, and make the port method accept `policy?: FileWritePolicy` and delegate.
4. `src/remote/protocol.ts`: bump the version with its comment.

Update `product/specs/remote-server.md`: add a paragraph after the protocol version 40 paragraph (line ~290) saying `write-file` may carry `policy: 'tool-text'`, the far side then enforces the tool rules in its own workspace, content still crosses as one base64 copy with no local cache or temporary file, a version-40 peer is refused at the handshake, and the new protocol version.

## Tests

- `src/file-navigator/remote/port.test.ts` (next to `forwards the optional expected hash and omits it for unconditional writes`): the frame carries `policy` only when supplied; content stays single base64; an absolute path with the policy answers `Outside the workspace` and sends no frame; an absolute path without the policy is still sent; the no-policy frame is unchanged; close, end, and timeout still resolve as failure values for a policy write.
- `src/remote/filesystem/operations.test.ts`: add `write-file` rows with `policy: 'tool-text'` to the accepted table (beside line ~40) and rows with `policy: 'other'`, `policy: 7`, and `policy: null` to the invalid table (beside lines ~83–85).
- `src/remote/serve-file-navigator.test.ts`: a policy write over the channel lands only in the far-side workspace and creates nested parents there; a secret path and invalid UTF-8 are refused on the far side; no local file-cache entry or temporary file appears.
- `src/remote/protocol.test.ts`: the `it('is 40', ...)` expectation (line ~968) moves to the new number; the existing mismatched-version handshake tests cover refusal of the previous version.
- Remote editor save tests stay green unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each step. Manual end to end: pair a remote tab, save a file through the editor (unchanged behavior), then perform a tool-text write via the port (plan 11 wiring is not yet present, so exercise it through the `serve-file-navigator` test harness) and confirm the file appears only on the far side.

## Out of scope

- The `edit-file` operation (plan 9) and the port edit contract (plan 10).
- Command and ACP wiring (plans 11 through 13).
- Retrying uncertain writes.
- Any change to `port-requests.ts`, refusal shapes, or the file cache.
