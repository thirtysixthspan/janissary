# ACP tool loop 4 — `read-lines` remote filesystem operation

**Complexity: 6/10** — ~50 added lines across 4 edited files and 2 new modules, 8 requirements, 20 test scenarios (p=5.85); above the series' 1–5 target, driven by the scenario count (validation edge cases, reader outcomes over the wire, and each rejection reason)

Run order: 4 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Remote filesystem operation"; decision 21's "file contents never cross to the local machine except as the formatted, capped result text"). Depends on subplans 1 and 3, both implemented (`product/plans/complete/move-janissarys-acp-tool-loop-1-file-read-parser.md`, `product/plans/complete/move-janissarys-acp-tool-loop-3-file-read-reader.md`, and the reader's three follow-up fixes `file-read-home-anchored-secret-check.md`, `file-read-home-secret-before-disk-access.md`, `file-read-lexical-home-secret-without-symlinks.md` in `product/plans/complete/`). Subplan 5 calls it.

A typed `file read` on a remote tab has to read the remote workspace clone, and it may only bring back the formatted, capped text, never the raw file. The remote filesystem session already carries navigator operations over the tab's channel. This subplan adds one read-only operation to that table that runs `readWorkspaceLines` on the far side and returns its text, plus the local port method that asks for it.

## Design decisions

- **Protocol version.** The operation is a wire addition, and the source plan's decision 11 covers it with the single bump to 40. That bump is owned by subplan 25 (`move-janissarys-acp-tool-loop-25-protocol-40.md`), which removes `acp-prompt` and `acp-end` and lists `read-lines` among the additions its version-40 history paragraph names. This subplan leaves `REMOTE_PROTOCOL_VERSION = 39` in `src/remote/protocol.ts` untouched and adds no history paragraph. The series ships as one pull request, so no build between here and subplan 25 is released.
- **Shape**, modeled on `read-file` (`'read-file': descriptorFor<'read-file'>()` in `src/remote/filesystem/operations.ts`):
  - **Arguments.** `path` (a string, possibly empty), plus optional `offset` and `limit`. A present `offset` must be a number that passes `Number.isSafeInteger` and is at least 1. A present `limit` must pass the same test and also be at most `FILE_READ_MAX_LIMIT` (imported from `src/file-read/command.ts`), which is the same bound `parseFileRead` enforces on a typed `--limit`. Any other shape, including a numeric string, `null`, `0`, a fraction, or a `limit` of 2001, fails the descriptor's `valid`, which `decodeRequest` in `src/remote/frame/decode-filesystem.ts` already turns into a malformed `filesystem-request`. Extra keys are ignored, as for every other operation (`src/remote/protocol.test.ts` already pins that for `read-file`).
  - **Decode.** `path` via `requireString`; `offset` and `limit` spread in only when present, the way `optionalPolicy` in `src/remote/filesystem/argument-checks.ts` keeps an absent key absent, so a decoded request never carries `offset: undefined`.
  - **Paths.** `paths: (args) => [args.path]` (the same extractor as `namedPath`), with `rootDestination: true`. See "Containment" below for why both.
  - **Result.** `{ text: string }`, decoded with a new `'read-lines'` entry in `resultDecoders` (`src/remote/filesystem/result-decoders.ts`), built with the existing `decodeResult` helper like `'read-file'`. It accepts only a record whose `text` is a string. The text travels as an ordinary JSON string; it needs no base64 layer (the version-22 paragraph in `src/remote/protocol.ts` applies only to `content` fields), because the frame codec's JSON encoding already escapes newlines.
  - **Run.** `readWorkspaceLines(context.root, { path: args.path, offset: args.offset ?? 1, limit: args.limit ?? FILE_READ_MAX_LIMIT })`, wrapped as `{ text }`. The defaults are the parser's own (`parseFileRead` fills `offset` with 1 and `limit` with `FILE_READ_MAX_LIMIT`); import the constant, never write 2000. `readWorkspaceLines` is synchronous and never throws for a filesystem condition, so `run` returns a plain value and every reader outcome, error or not, comes back as a successful reply. `OperationContext` (`src/remote/filesystem/operation-types.ts`) needs no new member, because `run` needs only `context.root`.
- **Containment: the far-side gate stays, and it wins.** `readWorkspaceLines` does its own lexical and physical containment and secret checks, and the far side's gate (`refusedPaths` in `src/remote/filesystem/refusal.ts`, using `containedPath` and `physicallyContainedPath` from `src/remote/filesystem/path-containment.ts`) runs before any operation. Keep the gate on for `read-lines` rather than declaring no paths: the comment on `refusedPaths` makes path extraction mandatory so no operation can pass containment by never naming its arguments, and two independent checks are the point. The consequences:
  - A path the gate refuses never reaches the reader. `RemoteFileNavigators.refuse` in `src/remote/serve-file-navigator.ts` answers with the error reply `OUTSIDE_ROOT_REASON` (`'The path is outside this file navigator; choose an item inside the tree'`, `src/file-navigator/file-operation-result.ts`), because the descriptor names no `refusal`.
  - Subplan 5 prints that rejection as `Outside the workspace: <typed>.`, the same line the reader itself would have produced. So the double check never shows the user two different messages for the same path, with one deliberate exception: a missing file below a directory symlink that escapes the root. The gate refuses it as outside, while the reader alone would have said `File not found`. The gate's answer is the right one, and `src/remote/serve-file-navigator.test.ts` already pins the gate's behavior for that case ("refuses a missing child below a symlink that resolves outside the workspace").
  - The gate does not check secrets, so every secret path (`.env`, `.ssh/...`, a home-anchored secret) passes it and the reader answers `Secret file: <path>.` as a successful reply.
  - **`rootDestination: true`** exempts only the empty path from the gate (`containedPath` refuses `''`). The port's `paths.to` turns a typed `.` into `''`, and without the exemption a remote `file read .` would answer `Outside the workspace: ..` while a local one answers `Is a directory: ..`. With it, the reader answers `Is a directory: .` for `''`, which subplan 5's rewrite turns into `Is a directory: ..`, matching the local tab. `read-directory` and `watch` use the same flag for the same reason.
- **No refusal shape.** Like `read-file`, the descriptor names no `refusal`, so every failure that is not a reader outcome reaches the caller as a rejection, never as a value. Declaring a refusal shape would fold the unavailable case into an ordinary result, so the caller could no longer tell the two apart. The rejection reasons a caller can see are exactly these:
  - `OUTSIDE_ROOT_REASON`: the far-side containment gate refused the path.
  - `Remote connection unavailable.`: the channel was not attached when the request was sent. `RemoteChannel.send` in `src/remote/channel/index.ts` hands the frame to `unavailableSend` (`src/remote/channel/unavailable.ts`), which answers the navigator with that error reply, and `settle` in `src/file-navigator/remote/port-requests.ts` rejects with it because the operation is unclassified.
  - `ENDED_REASON` (`'The remote connection ended.'`): the channel closed with the request in flight.
  - `CLOSED_REASON` (`'The remote file navigator is closed.'`): the port was disposed, or its session never opened, before the request was sent (`unavailableResult`).
  - `TIMED_OUT_REASON` (`'The remote machine did not answer in time.'`): no reply within the deadline.
  - Any other far-side error reply's text, for example `'The remote file navigator session is not open.'`, or `'Invalid remote filesystem operation result.'` when the reply fails the result decoder.
- **Deadline.** `read-lines` keeps the ordinary `REQUEST_DEADLINE_MS` and is not added to `LONG_RUNNING` in `src/file-navigator/remote/port-requests.ts`. The 5 MB cap (`FILE_READ_MAX_BYTES`) bounds the work, and the formatted reply is at most 2000 lines.
- **Port method.** `RemoteFileSystemPort.readLines(root, relPath, offset?, limit?)` resolves to `{ text, path }`, where `text` is the reader's output and `path` is the workspace-relative spelling actually sent. It is a method on the remote port only, not on the `FileSystemPort` interface (`src/file-navigator/filesystem-port.ts`), because the local path calls `readWorkspaceLines` directly. Its behavior:
  - An absolute `relPath` (`path.posix.isAbsolute`) is answered without sending anything: it resolves to `{ text: 'Outside the workspace: <relPath>.', path: relPath }`. `paths.to` would otherwise turn an absolute path inside the remote workspace into a relative one and read it, while the reader's lexical check refuses every absolute path on a local tab. This keeps both tabs answering the same.
  - Otherwise it maps the path with `this.paths.to(root, relPath)` like `readFile`, sends `read-lines` with `path` set to the mapped spelling and `offset` and `limit` spread in only when defined (the `expectedHash` pattern in `RemoteFileSystemPort.writeFile`), and resolves to `{ text: result.text, path: <mapped spelling> }`.
  - It rejects with the reasons listed under "No refusal shape" and never turns a rejection into text. That is subplan 5's job.
- **Contract subplan 5 relies on.** Subplan 5 calls `readLines(workspace, typed, offset, limit)` with `root` equal to the remote workspace path, so `paths.to` is pure normalization (`./notes/a.md` → `notes/a.md`, `a/../../x` → `../x`, `.` → `''`) with no sub-root prefix. Then:
  - On resolve, it prints `text`, except that when `path` differs from the typed spelling and `text` is one line containing no tab character and ending in `: <path>.`, it replaces that suffix with `: <typed>.`. Every reader error line (`readWorkspaceLines` in `src/file-read/read.ts`, and the `Offset past end of file (<n> lines): <path>.` line from `formatFileLines` in `src/file-read/format.ts`) ends exactly `: <args.path>.`, and the far side passes the sent `path` through unchanged, so the suffix is always there to replace. The no-tab test is what keeps a numbered result from being rewritten: every numbered line has a tab after its number, even a one-line file whose content happens to end in `: <path>.`, while no error line has one (`parseFileRead` splits on whitespace, so a path cannot contain a tab). `(empty file)` has no path suffix and is never rewritten.
  - On a rejection whose message is `OUTSIDE_ROOT_REASON`, it prints `Outside the workspace: <typed>.`. On `Remote connection unavailable.` it prints that line. On any other rejection it prints the message as one line.
  - It must use the returned `path`, not recompute the mapping, so the rewrite stays correct if the mapping ever changes.
- **Module placement.** `src/file-navigator/remote/port.ts` is at about 189 effective lines and does not import `node:path` (its `watch` method has a local named `path`). Put the logic in a new `src/file-navigator/remote/port-reads.ts` exporting `remoteReadLines(request, paths, root, relPath, offset?, limit?)`, taking the bound `RemoteRequest` (`src/file-navigator/remote/port-git.ts`) and `RemotePortPaths` the way `remoteMove` in `port-moves.ts` does. `RemoteFileSystemPort.readLines` is a one-line delegation through `this.requester()`. `readFile` stays where it is.
- **Imports.** The new descriptor imports `readWorkspaceLines` from `../../file-read/read.js` and `FILE_READ_MAX_LIMIT` from `../../file-read/command.js`, with `.js` extensions. Both modules are free of `Managers` and `src/remote/` imports (subplan 3's import rule), so the far side can load them and nothing cycles.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The reader, its defaults, and caps | `readWorkspaceLines`, `FILE_READ_MAX_BYTES` in `src/file-read/read.ts`; `FILE_READ_MAX_LIMIT`, `parseFileRead` in `src/file-read/command.ts` |
| Read-only operation descriptor to copy | `'read-file'` in `READ_OPERATIONS`, `src/remote/filesystem/operations.ts` |
| A descriptor kept in its own module because `operations.ts` is near the limit (about 190 effective lines) | `writeFileOperation` in `src/remote/filesystem/write-file-operation.ts`, `searchTextOperation` in `search-text-operation.ts` |
| Argument helpers and the optional-key pattern | `requireString`, `stringValue`, `optionalPolicy` in `src/remote/filesystem/argument-checks.ts` |
| Operation union and per-operation argument types | `RemoteFilesystemOperation`, `RemoteFilesystemArgumentsByOperation` in `src/remote/protocol-frames.ts` |
| Result decoders | `resultDecoders`, `decodeResult` in `src/remote/filesystem/result-decoders.ts` |
| Containment gate and refusal routing | `refusedPaths`, `refusalFor` in `src/remote/filesystem/refusal.ts`; `RemoteFileNavigators.refuse` in `src/remote/serve-file-navigator.ts` |
| Rejection reasons | `CLOSED_REASON`, `ENDED_REASON`, `TIMED_OUT_REASON`, `settle` in `src/file-navigator/remote/port-requests.ts`; `unavailableSend` in `src/remote/channel/unavailable.ts` |
| Port request plumbing and path mapping | `RemoteFileSystemPort.request`, `requester`, `readFile` in `src/file-navigator/remote/port.ts`; `RemotePortPaths.to` in `src/file-navigator/remote/port-paths.ts`; `RemoteRequest` in `port-git.ts`; the extraction pattern in `port-moves.ts` |

## Proposed changes

Land them in this order so typecheck stays green: the type union first, then the decoder and descriptor together (the `satisfies Record<RemoteFilesystemOperation, …>` on `FILESYSTEM_OPERATIONS` fails until the table has the entry), then the port.

- `src/remote/protocol-frames.ts`: add `'read-lines'` to `RemoteFilesystemOperation` and `'read-lines': { path: string; offset?: number; limit?: number }` to `RemoteFilesystemArgumentsByOperation`.
- `src/remote/filesystem/result-decoders.ts`: the `'read-lines'` decoder described above.
- New `src/remote/filesystem/read-lines-operation.ts`: `readLinesOperation`, built with `descriptorFor<'read-lines'>()`, holding the validator, decode, paths, `rootDestination`, decoder, and run described above. The two integer checks are private helpers in this module.
- `src/remote/filesystem/operations.ts`: import it and list `'read-lines': readLinesOperation` in `READ_OPERATIONS` after `'read-file'`. That is one import and one entry, keeping the file under 200 effective lines.
- New `src/file-navigator/remote/port-reads.ts`: `remoteReadLines`, as above.
- `src/file-navigator/remote/port.ts`: `readLines`, delegating to `remoteReadLines`.

## Tests

- `src/remote/filesystem/operations.test.ts`. Its fixed tables must each gain the operation, or the existing exhaustiveness tests fail:
  - `ALL_OPERATIONS` gains `'read-lines'`;
  - `PATH_CASES` gains `['read-lines', { path: 'a.txt', offset: 3, limit: 10 }, ['a.txt']]`;
  - `INVALID_CASES` gains a missing path, an `offset` of `0`, a negative `limit`, a fractional `offset`, a string `limit` (`'5'`), and a `limit` of `FILE_READ_MAX_LIMIT + 1`;
  - `VALID_RESULTS` gains `'read-lines': { text: '1\ta' }`;
  - a new case: `valid` accepts a path alone, a path with both integers, and a `limit` of exactly `FILE_READ_MAX_LIMIT`, and `decode` of a path alone yields an object with no `offset` or `limit` key;
  - a new case: the `read-lines` result decoder rejects a missing or non-string `text`.
- `src/remote/serve-file-navigator.test.ts`, against the real temporary root the suite already builds:
  - a `read-lines` request for a known file returns `{ result: { text } }` whose text equals `readWorkspaceLines(root, …)` for the same arguments, and one with `offset` and `limit` returns only that window with the continuation notice;
  - a request with no `offset` or `limit` behaves as offset 1, limit `FILE_READ_MAX_LIMIT`;
  - `.env` returns `{ result: { text: 'Secret file: .env.' } }`, a successful reply;
  - a missing file returns `File not found: <path>.` as a result, and the empty path returns `Is a directory: .`;
  - add `['read-lines', { path: '../outside' }]` to the existing "refuses escaping paths as an error" `it.each` table, so the outside path gets the `OUTSIDE_ROOT_REASON` error reply with no `result`.
- `src/file-navigator/remote/port.test.ts`, new cases under its existing `harness()` (workspace `/remote/ws`), which cover `port-reads.ts` through the port. `readLines`:
  - sends `{ path: 'notes/a.md' }` for `'./notes/a.md'` from root `/remote/ws`, with no `offset` or `limit` keys, and resolves to `{ text, path: 'notes/a.md' }` after `h.reply({ text })`;
  - forwards `offset` and `limit` when given;
  - resolves an absolute `relPath` to `{ text: 'Outside the workspace: /remote/ws/a.md.', path: '/remote/ws/a.md' }` and sends no `filesystem-request`;
  - rejects with `Remote connection unavailable.` when the reply is that error (what `unavailableSend` delivers for an unattached channel; the fake channel in `harness()` does not run it, so reply with the error directly);
  - rejects with `OUTSIDE_ROOT_REASON` when the reply is that error;
  - rejects with `connection ended` when the channel closes in flight, like "rejects in-flight read-only work when the channel closes".

## Out of scope

The typed command that calls `readLines` and the error-line rewrite (subplan 5). The protocol version bump and its history paragraph (subplan 25). Specs and docs (subplan 26). Any streaming or partial read, and any change to the reader in `src/file-read/`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes yet; the operation has no caller until subplan 5, so the server tests above are the end-to-end check.
