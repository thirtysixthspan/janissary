# ACP tool loop 4.2 — `RemoteFileSystemPort.readLines`

**Complexity: 3/10** — ~24 added lines, 1 edited file and 1 new module, 5 requirements, 7 test scenarios (p=4.64); driven by the absolute-path answer and the rejection reasons the port must pass through

Run order: piece 2 of 2 of subplan 4 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop-4-read-lines-operation.md`. Canonical feature plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Remote filesystem operation"). Depends on subplans 1, 2 and 3 (implemented, plans in `product/plans/complete/`) and on piece 1, `product/plans/complete/move-janissarys-acp-tool-loop-4-read-lines-operation-1-far-side-operation.md` (implemented). Piece 1 added the `read-lines` operation (`readLinesOperation` in `src/remote/filesystem/read-lines-operation.ts`, listed in `READ_OPERATIONS` in `operations.ts`), its `{ path: string; offset?: number; limit?: number }` argument type in `RemoteFilesystemArgumentsByOperation` (`src/remote/protocol-frames.ts`), and its `{ text: string }` result decoder (`'read-lines'` in `resultDecoders`, `src/remote/filesystem/result-decoders.ts`). This piece edits none of those files, and `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` stays 39. Subplan 5 calls the method this piece adds.

Piece 1 made the far side answer `read-lines`. This piece adds the local port method that asks for it, so the typed `file read` command in subplan 5 can read a remote workspace and receive only the formatted, capped text.

## Design decisions

- **Port method.** `RemoteFileSystemPort.readLines(root, relPath, offset?, limit?)`, with `root` and `relPath` strings and `offset` and `limit` optional numbers, returns `Promise<{ text: string; path: string }>` (an inline object type; no named type is exported). It resolves to `{ text, path }`, where `text` is the reader's output and `path` is the workspace-relative spelling actually sent. It is a method on the remote port only, not on the `FileSystemPort` interface (`src/file-navigator/filesystem-port.ts`), because the local path calls `readWorkspaceLines` directly. Its behavior:
  - An absolute `relPath` (`path.posix.isAbsolute`) is answered without sending anything: it resolves to `{ text: 'Outside the workspace: <relPath>.', path: relPath }`. `paths.to` would otherwise turn an absolute path inside the remote workspace into a relative one and read it (from root `/remote/ws`, `/remote/ws/a.md` maps to `a.md`), while the reader's lexical check (`checkLexical` in `src/file-read/read.ts`, `if (path.isAbsolute(requested)) return 'Outside the workspace'`) refuses every absolute path on a local tab. This keeps both tabs answering the same, with the identical line `readWorkspaceLines` prints. The check runs first, before awaiting `paths.to` (which waits for the workspace) or the session, so it is a pure function of `relPath` and answers the same whether the port is open, still opening, or already disposed.
  - Otherwise it maps the path with `paths.to(root, relPath)` like `readFile`, sends `read-lines` with `path` set to the mapped spelling and `offset` and `limit` each spread in only when `!== undefined` (the `...(expectedHash !== undefined && { expectedHash })` pattern in `RemoteFileSystemPort.writeFile`), and resolves to `{ text: result.text, path: <mapped spelling> }`. No `offset` or `limit` key is ever sent as `undefined`.
  - It does not validate `offset` or `limit`. The caller passes values `parseFileRead` (`src/file-read/command.ts`) produced, which already satisfy the far side's checks (safe integer at least 1, `limit` at most `FILE_READ_MAX_LIMIT`), or omits them. Anything else fails `readLinesOperation`'s `valid` on the far side, where `decodeRequest` (`src/remote/frame/decode-filesystem.ts`) treats the frame as malformed and no read runs. That is a caller bug, not a case this port handles.
  - It rejects with the reasons listed under "Rejection reasons" and never turns a rejection into text. That is subplan 5's job.
- **Rejection reasons.** Because the descriptor from piece 1 names no `refusal` (like `read-file`), every failure that is not a reader outcome reaches the caller as a rejection, never as a value; a refusal shape would fold the unavailable case into an ordinary result, so the caller could no longer tell the two apart. The rejection reasons a caller can see are exactly these:
  - `OUTSIDE_ROOT_REASON` (`src/file-navigator/file-operation-result.ts`): the far-side containment gate refused the path.
  - `Remote connection unavailable.`: the channel was not attached when the request was sent. `RemoteChannel.send` in `src/remote/channel/index.ts` hands the frame to `unavailableSend` (`src/remote/channel/unavailable.ts`), which answers the navigator with that error reply synchronously inside `channel.send`. `RemoteFileSystemPort.request` calls `this.requests.add` before `this.channel.send`, so the reply finds the pending request, and `settle` in `src/file-navigator/remote/port-requests.ts` rejects with it because `refusalValueFor` reports the operation unclassified.
  - `ENDED_REASON` (`'The remote connection ended.'`): the channel closed with the request in flight.
  - `CLOSED_REASON` (`'The remote file navigator is closed.'`): the port was disposed, or its session never opened, before the request was sent (`unavailableResult`).
  - `TIMED_OUT_REASON` (`'The remote machine did not answer in time.'`): no reply within the deadline.
  - Any other far-side error reply's text, for example `'The remote file navigator session is not open.'` (`src/remote/serve-file-navigator.ts`), or `'Invalid remote filesystem operation result.'` (thrown by `decodeResult` in `result-decoders.ts`, which `request` turns into a rejection) when the reply fails the result decoder.

  Every rejection is an `Error` whose `message` is exactly the reason string, with no prefix, so a caller compares `error.message` with `===`.
- **Deadline.** `read-lines` keeps the ordinary `REQUEST_DEADLINE_MS` and is not added to `LONG_RUNNING` in `src/file-navigator/remote/port-requests.ts` (which does list `read-file`, a whole-file transfer). The 5 MB cap (`FILE_READ_MAX_BYTES` in `src/file-read/read.ts`) bounds the work, and the formatted reply is at most `FILE_READ_MAX_LIMIT` lines plus the continuation notice. One assertion in `port-requests.test.ts` pins this, so a later change to `LONG_RUNNING` is deliberate.
- **Contract subplan 5 relies on.** Subplan 5 calls `readLines(workspace, typed, offset, limit)` with `root` equal to the remote workspace path, so `paths.to` is pure normalization (`./notes/a.md` → `notes/a.md`, `a/../../x` → `../x`, `.` → `''`) with no sub-root prefix. Then:
  - On resolve, it prints `text`, except that when `path` differs from the typed spelling and `text` is one line containing no tab character and ending in `: <path>.`, it replaces that suffix with `: <typed>.`. Every reader error line (`readWorkspaceLines` in `src/file-read/read.ts`, and the `Offset past end of file (<n> lines): <path>.` line from `formatFileLines` in `src/file-read/format.ts`) ends exactly `: <args.path>.`, and the far side passes the sent `path` through unchanged, so the suffix is always there to replace. For the empty sent path the suffix is `: .` (the far side answers `Is a directory: .`), which the rewrite turns into `Is a directory: ..` for a typed `.`. The no-tab test is what keeps a numbered result from being rewritten: every numbered line has a tab after its number, even a one-line file whose content happens to end in `: <path>.`, while no error line has one (`parseFileRead` splits on whitespace, so a path cannot contain a tab). `(empty file)` has no path suffix and is never rewritten.
  - On an absolute typed path the returned `path` equals the typed spelling, so no rewrite applies and the text is already `Outside the workspace: <typed>.`.
  - On a rejection whose `message` is `OUTSIDE_ROOT_REASON`, it prints `Outside the workspace: <typed>.`. On `Remote connection unavailable.` it prints that line. On any other rejection (`CLOSED_REASON`, `ENDED_REASON`, `TIMED_OUT_REASON`, or another far-side error text) it prints the message as one line.
  - It must use the returned `path`, not recompute the mapping, so the rewrite stays correct if the mapping ever changes.
  - It owns the port's lifetime (a port per read, disposed in a `finally`); `readLines` neither opens nor disposes anything.
  This piece implements only the port half of that contract; the printing and rewrite are subplan 5's.
- **Module placement.** `src/file-navigator/remote/port.ts` is at 189 effective lines by ESLint's `max-lines` count (`skipBlankLines`, `skipComments`) and does not import `node:path` (its `watch` method has a local named `path`). Put the logic in a new `src/file-navigator/remote/port-reads.ts` exporting `remoteReadLines(request, paths, root, relPath, offset?, limit?)`, taking the bound `RemoteRequest` (`src/file-navigator/remote/port-git.ts`) and `RemotePortPaths` the way `remoteMove` in `port-moves.ts` does. It imports `path` from `node:path` (default import, as `port-paths.ts` does), `type RemoteRequest` from `./port-git.js`, and `type RemotePortPaths` from `./port-paths.js`, and opens with a short comment saying why it is split out, like the one atop `port-moves.ts`. `RemoteFileSystemPort.readLines` is a one-line delegation, `remoteReadLines(this.requester(), this.paths, root, relPath, offset, limit)`, placed next to `readFile`; with its import that brings `port.ts` to about 193 effective lines, still under 200. `readFile` stays where it is.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The `read-lines` operation, argument type, and result decoder | piece 1: `readLinesOperation` in `src/remote/filesystem/read-lines-operation.ts`, `'read-lines'` in `src/remote/protocol-frames.ts` and `src/remote/filesystem/result-decoders.ts` |
| Rejection reasons | `CLOSED_REASON`, `ENDED_REASON`, `TIMED_OUT_REASON`, `settle`, `unavailableResult` in `src/file-navigator/remote/port-requests.ts`; `unavailableSend` in `src/remote/channel/unavailable.ts`; `OUTSIDE_ROOT_REASON` in `src/file-navigator/file-operation-result.ts` |
| Port request plumbing and path mapping | `RemoteFileSystemPort.request`, `requester`, `readFile` in `src/file-navigator/remote/port.ts`; `RemotePortPaths.to` in `src/file-navigator/remote/port-paths.ts`; `RemoteRequest` in `port-git.ts`; the extraction pattern in `port-moves.ts` |
| Optional-key spreading on a request | `RemoteFileSystemPort.writeFile`'s `expectedHash` |
| The reader's absolute-path line to match | `checkLexical` and `readWorkspaceLines` in `src/file-read/read.ts` |
| Deadline table and its test | `LONG_RUNNING`, `requestDeadline` in `port-requests.ts`; "gives work the far side really does, like a pull, the long deadline" in `port-requests.test.ts` |

## Proposed changes

- New `src/file-navigator/remote/port-reads.ts`: `remoteReadLines`, as above.
- `src/file-navigator/remote/port.ts`: `readLines`, delegating to `remoteReadLines`, plus its import from `./port-reads.js`.
- `src/file-navigator/remote/port.test.ts` and `port-requests.test.ts`: the tests below.

The two source changes land together and are green at once; nothing but the port calls `remoteReadLines`.

## Tests

`src/file-navigator/remote/port.test.ts`, new cases in a new `describe('RemoteFileSystemPort.readLines', …)` at the end of the file, using its existing `harness()` (workspace `/remote/ws`). They cover `port-reads.ts` through the port, which is what exercises `settle` and the result decoder, so no separate `port-reads.test.ts` is added. Wait for the request with `vi.waitFor` as the existing cases do, and import `OUTSIDE_ROOT_REASON` from `../file-operation-result.js`. `readLines`:

- sends `{ path: 'notes/a.md' }` for `'./notes/a.md'` from root `/remote/ws`, with no `offset` or `limit` keys, and resolves to `{ text, path: 'notes/a.md' }` after `h.reply({ text })`;
- forwards `offset` and `limit` when given;
- resolves an absolute `relPath` to `{ text: 'Outside the workspace: /remote/ws/a.md.', path: '/remote/ws/a.md' }` and sends no `filesystem-request` (wait until the `filesystem-open` frame is sent, then assert no frame has type `filesystem-request`);
- rejects with `Remote connection unavailable.` when the reply is that error (what `unavailableSend` delivers for an unattached channel; the fake channel in `harness()` does not run it, so reply with the error directly);
- rejects with `OUTSIDE_ROOT_REASON` when the reply is that error;
- rejects with `connection ended` when the channel closes in flight, like "rejects in-flight read-only work when the channel closes".

`src/file-navigator/remote/port-requests.test.ts`: in "gives work the far side really does, like a pull, the long deadline", assert that `requestDeadline('read-lines')` is `REQUEST_DEADLINE_MS`, beside the `read-directory` assertion.

## Out of scope

The far-side operation, its validation, result decoder, and containment behavior (piece 1). The typed command that calls `readLines` and the error-line rewrite (subplan 5). The protocol version bump and its history paragraph (subplan 25). Specs and docs (subplan 26). Any streaming or partial read, and any change to the reader in `src/file-read/`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes yet; the method has no caller until subplan 5, so piece 1's serve tests (the `read-lines` cases in `src/remote/serve-file-navigator.test.ts`) and these port tests together are the end-to-end check. Confirm the diff touches only `port-reads.ts`, `port.ts`, `port.test.ts`, and `port-requests.test.ts`, and that `src/remote/protocol.ts` still says version 39.
