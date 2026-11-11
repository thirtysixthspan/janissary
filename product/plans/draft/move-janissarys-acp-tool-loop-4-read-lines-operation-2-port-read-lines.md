# ACP tool loop 4.2 — `RemoteFileSystemPort.readLines`

**Complexity: 3/10** — ~22 added lines, 1 edited file and 1 new module, 4 requirements, 6 test scenarios (p=4.43); driven by the absolute-path answer and the rejection reasons the port must pass through

Run order: piece 2 of 2 of subplan 4 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop-4-read-lines-operation.md`. Canonical feature plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Remote filesystem operation"). Depends on subplans 1, 2 and 3 (implemented, plans in `product/plans/complete/`) and on piece 1, `move-janissarys-acp-tool-loop-4-read-lines-operation-1-far-side-operation.md`, which adds the `read-lines` operation, its argument type, and its `{ text: string }` result decoder. Subplan 5 calls the method this piece adds.

Piece 1 made the far side answer `read-lines`. This piece adds the local port method that asks for it, so the typed `file read` command in subplan 5 can read a remote workspace and receive only the formatted, capped text.

## Design decisions

- **Port method.** `RemoteFileSystemPort.readLines(root, relPath, offset?, limit?)` resolves to `{ text, path }`, where `text` is the reader's output and `path` is the workspace-relative spelling actually sent. It is a method on the remote port only, not on the `FileSystemPort` interface (`src/file-navigator/filesystem-port.ts`), because the local path calls `readWorkspaceLines` directly. Its behavior:
  - An absolute `relPath` (`path.posix.isAbsolute`) is answered without sending anything: it resolves to `{ text: 'Outside the workspace: <relPath>.', path: relPath }`. `paths.to` would otherwise turn an absolute path inside the remote workspace into a relative one and read it, while the reader's lexical check refuses every absolute path on a local tab. This keeps both tabs answering the same.
  - Otherwise it maps the path with `this.paths.to(root, relPath)` like `readFile`, sends `read-lines` with `path` set to the mapped spelling and `offset` and `limit` spread in only when defined (the `expectedHash` pattern in `RemoteFileSystemPort.writeFile`), and resolves to `{ text: result.text, path: <mapped spelling> }`.
  - It rejects with the reasons listed under "Rejection reasons" and never turns a rejection into text. That is subplan 5's job.
- **Rejection reasons.** Because the descriptor from piece 1 names no `refusal` (like `read-file`), every failure that is not a reader outcome reaches the caller as a rejection, never as a value; a refusal shape would fold the unavailable case into an ordinary result, so the caller could no longer tell the two apart. The rejection reasons a caller can see are exactly these:
  - `OUTSIDE_ROOT_REASON`: the far-side containment gate refused the path.
  - `Remote connection unavailable.`: the channel was not attached when the request was sent. `RemoteChannel.send` in `src/remote/channel/index.ts` hands the frame to `unavailableSend` (`src/remote/channel/unavailable.ts`), which answers the navigator with that error reply, and `settle` in `src/file-navigator/remote/port-requests.ts` rejects with it because the operation is unclassified.
  - `ENDED_REASON` (`'The remote connection ended.'`): the channel closed with the request in flight.
  - `CLOSED_REASON` (`'The remote file navigator is closed.'`): the port was disposed, or its session never opened, before the request was sent (`unavailableResult`).
  - `TIMED_OUT_REASON` (`'The remote machine did not answer in time.'`): no reply within the deadline.
  - Any other far-side error reply's text, for example `'The remote file navigator session is not open.'`, or `'Invalid remote filesystem operation result.'` when the reply fails the result decoder.
- **Deadline.** `read-lines` keeps the ordinary `REQUEST_DEADLINE_MS` and is not added to `LONG_RUNNING` in `src/file-navigator/remote/port-requests.ts`. The 5 MB cap (`FILE_READ_MAX_BYTES`) bounds the work, and the formatted reply is at most 2000 lines.
- **Contract subplan 5 relies on.** Subplan 5 calls `readLines(workspace, typed, offset, limit)` with `root` equal to the remote workspace path, so `paths.to` is pure normalization (`./notes/a.md` → `notes/a.md`, `a/../../x` → `../x`, `.` → `''`) with no sub-root prefix. Then:
  - On resolve, it prints `text`, except that when `path` differs from the typed spelling and `text` is one line containing no tab character and ending in `: <path>.`, it replaces that suffix with `: <typed>.`. Every reader error line (`readWorkspaceLines` in `src/file-read/read.ts`, and the `Offset past end of file (<n> lines): <path>.` line from `formatFileLines` in `src/file-read/format.ts`) ends exactly `: <args.path>.`, and the far side passes the sent `path` through unchanged, so the suffix is always there to replace. The no-tab test is what keeps a numbered result from being rewritten: every numbered line has a tab after its number, even a one-line file whose content happens to end in `: <path>.`, while no error line has one (`parseFileRead` splits on whitespace, so a path cannot contain a tab). `(empty file)` has no path suffix and is never rewritten.
  - On a rejection whose message is `OUTSIDE_ROOT_REASON`, it prints `Outside the workspace: <typed>.`. On `Remote connection unavailable.` it prints that line. On any other rejection it prints the message as one line.
  - It must use the returned `path`, not recompute the mapping, so the rewrite stays correct if the mapping ever changes.
  This piece implements only the port half of that contract; the printing and rewrite are subplan 5's.
- **Module placement.** `src/file-navigator/remote/port.ts` is at about 189 effective lines and does not import `node:path` (its `watch` method has a local named `path`). Put the logic in a new `src/file-navigator/remote/port-reads.ts` exporting `remoteReadLines(request, paths, root, relPath, offset?, limit?)`, taking the bound `RemoteRequest` (`src/file-navigator/remote/port-git.ts`) and `RemotePortPaths` the way `remoteMove` in `port-moves.ts` does. `RemoteFileSystemPort.readLines` is a one-line delegation through `this.requester()`. `readFile` stays where it is.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The `read-lines` operation, argument type, and result decoder | piece 1: `readLinesOperation` in `src/remote/filesystem/read-lines-operation.ts`, `'read-lines'` in `src/remote/protocol-frames.ts` and `src/remote/filesystem/result-decoders.ts` |
| Rejection reasons | `CLOSED_REASON`, `ENDED_REASON`, `TIMED_OUT_REASON`, `settle` in `src/file-navigator/remote/port-requests.ts`; `unavailableSend` in `src/remote/channel/unavailable.ts`; `OUTSIDE_ROOT_REASON` in `src/file-navigator/file-operation-result.ts` |
| Port request plumbing and path mapping | `RemoteFileSystemPort.request`, `requester`, `readFile` in `src/file-navigator/remote/port.ts`; `RemotePortPaths.to` in `src/file-navigator/remote/port-paths.ts`; `RemoteRequest` in `port-git.ts`; the extraction pattern in `port-moves.ts` |
| Optional-key spreading on a request | `RemoteFileSystemPort.writeFile`'s `expectedHash` |

## Proposed changes

- New `src/file-navigator/remote/port-reads.ts`: `remoteReadLines`, as above.
- `src/file-navigator/remote/port.ts`: `readLines`, delegating to `remoteReadLines`.

## Tests

`src/file-navigator/remote/port.test.ts`, new cases under its existing `harness()` (workspace `/remote/ws`), which cover `port-reads.ts` through the port. `readLines`:

- sends `{ path: 'notes/a.md' }` for `'./notes/a.md'` from root `/remote/ws`, with no `offset` or `limit` keys, and resolves to `{ text, path: 'notes/a.md' }` after `h.reply({ text })`;
- forwards `offset` and `limit` when given;
- resolves an absolute `relPath` to `{ text: 'Outside the workspace: /remote/ws/a.md.', path: '/remote/ws/a.md' }` and sends no `filesystem-request`;
- rejects with `Remote connection unavailable.` when the reply is that error (what `unavailableSend` delivers for an unattached channel; the fake channel in `harness()` does not run it, so reply with the error directly);
- rejects with `OUTSIDE_ROOT_REASON` when the reply is that error;
- rejects with `connection ended` when the channel closes in flight, like "rejects in-flight read-only work when the channel closes".

## Out of scope

The far-side operation, its validation, result decoder, and containment behavior (piece 1). The typed command that calls `readLines` and the error-line rewrite (subplan 5). The protocol version bump and its history paragraph (subplan 25). Specs and docs (subplan 26). Any streaming or partial read, and any change to the reader in `src/file-read/`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes yet; the method has no caller until subplan 5, so piece 1's serve tests and these port tests together are the end-to-end check.
