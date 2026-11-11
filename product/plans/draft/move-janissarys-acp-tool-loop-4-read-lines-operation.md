# ACP tool loop 4 — `read-lines` remote filesystem operation

**Complexity: 5/10** — ~45 added lines across 4 edited files, 7 requirements, 16 scenarios (p=5.65)

Run order: 4 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Remote filesystem operation"; decision 21's "file contents never cross to the local machine except as the formatted, capped result text"). Depends on subplans 1 and 3 (`move-janissarys-acp-tool-loop-1-file-read-parser.md`, `move-janissarys-acp-tool-loop-3-file-read-reader.md`). Subplan 5 calls it.

A typed `file read` on a remote tab has to read the remote workspace clone, and it may only bring back the formatted, capped text, never the raw file. The remote filesystem session already carries navigator operations over the tab's channel. This subplan adds one read-only operation to that table that runs `readWorkspaceLines` on the far side and returns its text, plus the local port method that asks for it.

## Design decisions

- **Protocol version.** The operation is a wire addition, and the source plan's decision 11 covers it with the single bump to 40. That bump is owned by subplan 25, which removes `acp-prompt` and `acp-end`. This subplan leaves `REMOTE_PROTOCOL_VERSION` at 39, and the version-40 history paragraph written in subplan 25 names `read-lines` alongside the loop frames. The series ships as one pull request, so no build between here and subplan 25 is released.
- **Shape**, modeled on `read-file` (`'read-file': descriptorFor<'read-file'>()` in `src/remote/filesystem/operations.ts`):
  - Arguments: `path` (a string), plus optional `offset` and `limit`, each a positive integer when present. Any other shape fails the descriptor's `valid`, which `decodeFilesystemFrame` in `src/remote/frame/decode-filesystem.ts` already turns into a malformed `filesystem-request`.
  - Paths: `namedPath`, so the far side's containment gate (`refusedPaths` in `src/remote/filesystem/refusal.ts`) refuses a path outside the root before anything runs.
  - Result: `{ text }`, decoded with a new `read-lines` entry in `resultDecoders`.
  - Run: `readWorkspaceLines(context.root, args)`, with the absent `offset` and `limit` filled with 1 and 2000, so the far side's defaults are the parser's.
- **No refusal shape.** Like `read-file`, the descriptor names no `refusal`. A containment refusal therefore comes back as the error reply carrying `OUTSIDE_ROOT_REASON`, and a dropped or unattached channel rejects the request with `Remote connection unavailable.` (`unavailableResult` in `src/file-navigator/remote/port-requests.ts` throws for an unclassified operation). The typed command in subplan 5 turns each rejection into its one output line. Declaring a refusal shape would fold the unavailable case into an ordinary result, so the caller could no longer tell the two apart.
- **Deadline.** `read-lines` keeps the ordinary `REQUEST_DEADLINE_MS`. The 5 MB cap bounds the work, so it does not join `LONG_RUNNING`.
- **Port method.** `RemoteFileSystemPort.readLines(root, relPath, offset?, limit?)` maps the path with `this.paths.to(root, relPath)` like `readFile`, sends `read-lines`, and resolves to the result's `text`. It is a method on the remote port only, not on the `FileSystemPort` interface, because the local path calls `readWorkspaceLines` directly.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Read-only operation descriptor to copy | `'read-file'` in `READ_OPERATIONS`, `src/remote/filesystem/operations.ts` |
| A descriptor kept in its own module because `operations.ts` is near the limit (190 effective lines) | `writeFileOperation` in `src/remote/filesystem/write-file-operation.ts` |
| Argument helpers | `requireString`, `stringValue` in `src/remote/filesystem/argument-checks.ts` |
| Operation union and per-operation argument types | `RemoteFilesystemOperation`, `RemoteFilesystemArgumentsByOperation` in `src/remote/protocol-frames.ts` |
| Result decoders | `resultDecoders` in `src/remote/filesystem/result-decoders.ts` |
| Containment gate and refusal routing | `refusedPaths`, `refusalFor` in `src/remote/filesystem/refusal.ts`; `RemoteFileNavigators.refuse` in `src/remote/serve-file-navigator.ts` |
| Port request plumbing and path mapping | `RemoteFileSystemPort.request`, `readFile` in `src/file-navigator/remote/port.ts`; `RemotePortPaths.to` in `src/file-navigator/remote/port-paths.ts` |

## Proposed changes

- `src/remote/protocol-frames.ts`: add `'read-lines'` to `RemoteFilesystemOperation` and its arguments `{ path: string; offset?: number; limit?: number }` to `RemoteFilesystemArgumentsByOperation`.
- New `src/remote/filesystem/read-lines-operation.ts`: the descriptor above, with its own validator for the two optional positive integers.
- `src/remote/filesystem/operations.ts`: list `'read-lines': readLinesOperation` in `READ_OPERATIONS`, so the `satisfies` over `RemoteFilesystemOperation` stays exhaustive.
- `src/remote/filesystem/result-decoders.ts`: a `read-lines` decoder accepting only a record with a string `text`.
- `src/file-navigator/remote/port.ts`: `readLines`, as above. The file is at 189 effective lines. If the method pushes it past 200, move `readFile` and `readLines` together into a new `port-reads.ts` beside `port-moves.ts`, following the existing `remoteMove` extraction.

## Tests

- `src/remote/filesystem/operations.test.ts`:
  - validation accepts a path alone or with both integers, and rejects a missing path and a zero, negative, fractional, or string `offset` or `limit`;
  - containment: `refusedPaths` names `../x` and a symlink escaping the root;
  - result decoding accepts `{ text }` and rejects a missing or non-string `text`.
- `src/remote/serve-file-navigator.test.ts`: a `read-lines` request against a real temporary root returns the numbered text, and an outside path gets the `OUTSIDE_ROOT_REASON` error reply without reading.
- `src/file-navigator/remote/port.test.ts`: `readLines`:
  - maps the path through the workspace prefix;
  - forwards `offset` and `limit` only when given;
  - resolves to the text;
  - rejects with `Remote connection unavailable.` when the channel is unattached.

## Out of scope

The typed command that calls `readLines` (subplan 5). The protocol version bump (subplan 25). Any streaming or partial read.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes yet.
