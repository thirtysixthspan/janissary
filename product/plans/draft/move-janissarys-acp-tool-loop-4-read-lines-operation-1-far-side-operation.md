# ACP tool loop 4.1 — far-side `read-lines` operation

**Complexity: 5/10** — ~38 added lines across 3 edited files and 1 new module, 7 requirements, 14 test scenarios (p=5.47); driven by the validation edge cases and the reader outcomes over the wire

Run order: piece 1 of 2 of subplan 4 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop-4-read-lines-operation.md`. Canonical feature plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Remote filesystem operation"; decision 21's "file contents never cross to the local machine except as the formatted, capped result text"). Depends on subplans 1, 2 and 3, all implemented (`product/plans/complete/move-janissarys-acp-tool-loop-1-file-read-parser.md`, `product/plans/complete/move-janissarys-acp-tool-loop-2-file-read-format.md`, `product/plans/complete/move-janissarys-acp-tool-loop-3-file-read-reader.md`, and the reader's three follow-up fixes `file-read-home-anchored-secret-check.md`, `file-read-home-secret-before-disk-access.md`, `file-read-lexical-home-secret-without-symlinks.md` in `product/plans/complete/`). Piece 2 (`move-janissarys-acp-tool-loop-4-read-lines-operation-2-port-read-lines.md`) builds the local port method on it.

A typed `file read` on a remote tab has to read the remote workspace clone, and it may only bring back the formatted, capped text, never the raw file. The remote filesystem session already carries navigator operations over the tab's channel. This piece adds one read-only operation to that table that runs `readWorkspaceLines` on the far side and returns its text. It has no caller yet; piece 2 adds the port method that sends it.

## Design decisions

- **Protocol version.** The operation is a wire addition, and the source plan's decision 11 covers it with the single bump to 40. That bump is owned by subplan 25 (`move-janissarys-acp-tool-loop-25-protocol-40.md`), which removes `acp-prompt` and `acp-end` and lists `read-lines` among the additions its version-40 history paragraph names. This piece leaves `REMOTE_PROTOCOL_VERSION = 39` in `src/remote/protocol.ts` untouched and adds no history paragraph. The series ships as one pull request, so no build between here and subplan 25 is released.
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
- **No refusal shape.** Like `read-file`, the descriptor names no `refusal`, so every failure that is not a reader outcome reaches the caller as an error reply, never as a value. Declaring a refusal shape would fold the unavailable case into an ordinary result, so the caller could no longer tell the two apart. On the far side that means the gate's refusal is the `OUTSIDE_ROOT_REASON` error reply, and a reply that fails the result decoder is `'Invalid remote filesystem operation result.'`. The full list of rejection reasons the local caller sees, and how the port surfaces them, belongs to piece 2.
- **Imports.** The new descriptor imports `readWorkspaceLines` from `../../file-read/read.js` and `FILE_READ_MAX_LIMIT` from `../../file-read/command.js`, with `.js` extensions. Both modules are free of `Managers` and `src/remote/` imports (subplan 3's import rule), so the far side can load them and nothing cycles.
- **Module placement.** `src/remote/filesystem/operations.ts` is near the 200 effective-line limit (about 190), so the descriptor lives in its own module the way `writeFileOperation` and `searchTextOperation` do, and `operations.ts` gains only one import and one entry.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The reader, its defaults, and caps | `readWorkspaceLines`, `FILE_READ_MAX_BYTES` in `src/file-read/read.ts`; `FILE_READ_MAX_LIMIT`, `parseFileRead` in `src/file-read/command.ts` |
| Read-only operation descriptor to copy | `'read-file'` in `READ_OPERATIONS`, `src/remote/filesystem/operations.ts` |
| A descriptor kept in its own module because `operations.ts` is near the limit | `writeFileOperation` in `src/remote/filesystem/write-file-operation.ts`, `searchTextOperation` in `search-text-operation.ts` |
| Argument helpers and the optional-key pattern | `requireString`, `stringValue`, `optionalPolicy` in `src/remote/filesystem/argument-checks.ts` |
| Operation union and per-operation argument types | `RemoteFilesystemOperation`, `RemoteFilesystemArgumentsByOperation` in `src/remote/protocol-frames.ts` |
| Result decoders | `resultDecoders`, `decodeResult` in `src/remote/filesystem/result-decoders.ts` |
| Request decoding into a malformed `filesystem-request` | `decodeRequest` in `src/remote/frame/decode-filesystem.ts` |
| Containment gate and refusal routing | `refusedPaths`, `refusalFor` in `src/remote/filesystem/refusal.ts`; `RemoteFileNavigators.refuse` in `src/remote/serve-file-navigator.ts` |

## Proposed changes

Land them in this order so typecheck stays green: the type union first, then the decoder and descriptor together (the `satisfies Record<RemoteFilesystemOperation, …>` on `FILESYSTEM_OPERATIONS` fails until the table has the entry, and the mapped `PATH_CASES` and `VALID_RESULTS` types in `operations.test.ts` fail until those tables do), then the tests.

- `src/remote/protocol-frames.ts`: add `'read-lines'` to `RemoteFilesystemOperation` and `'read-lines': { path: string; offset?: number; limit?: number }` to `RemoteFilesystemArgumentsByOperation`.
- `src/remote/filesystem/result-decoders.ts`: the `'read-lines'` decoder described above.
- New `src/remote/filesystem/read-lines-operation.ts`: `readLinesOperation`, built with `descriptorFor<'read-lines'>()`, holding the validator, decode, paths, `rootDestination`, decoder, and run described above. The two integer checks are private helpers in this module.
- `src/remote/filesystem/operations.ts`: import it and list `'read-lines': readLinesOperation` in `READ_OPERATIONS` after `'read-file'`. That is one import and one entry, keeping the file under 200 effective lines.

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

## Out of scope

The local port method `RemoteFileSystemPort.readLines`, `port-reads.ts`, the absolute-path answer, the local rejection reasons, the deadline choice, and the contract for subplan 5 (piece 2). The typed command that calls `readLines` and the error-line rewrite (subplan 5). The protocol version bump and its history paragraph (subplan 25). Specs and docs (subplan 26). Any streaming or partial read, and any change to the reader in `src/file-read/`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes; the operation has no caller until piece 2 and subplan 5, so the serve tests above are the end-to-end check of the far side.
