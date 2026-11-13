# Hosted write tool 9 — the far-side `edit-file` remote operation

**Complexity: 5/10** — ~55 added lines across 4 files plus a descriptor module, 7 requirements, 13 scenarios (p=5.62).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 9 of 15 in the hosted write tool series. Depends on plan 2 (mutation parser, complete) for `FileEditValue` in `src/file-write/types.ts`, plan 6 (tool-text edit, complete) for `editToolTextFile` in `src/file-write/edit.ts`, and plan 8 (remote write policy, complete on this branch) for protocol version 41. All three have landed, so this plan can start immediately. It does **not** depend on plan 10: the descriptor calls plan 6's helper directly, not a `FileSystemPort` method.

An edit on a remote workspace must not fetch the file, change it locally, and send it back. This plan adds a dedicated `edit-file` operation to the remote filesystem registry, so the far side reads, matches, replaces, and atomically writes in its own workspace through plan 6's helper. Plan 10 later gives the ports an `editFile` method that sends it; until then nothing on the near side sends `edit-file`, and only tests exercise it.

## Goal

A registered, validated `edit-file` operation whose request carries `path`, base64 `oldString` and `newString`, and `replaceAll`, whose far side runs plan 6's edit in its workspace, and whose reply is either a positive replacement count or the existing structured failure. A peer that does not know the operation is refused at the handshake.

## Design decisions and dependencies

- Source plan decision: a dedicated `edit-file` operation rather than an edit mode on `write-file`, reusing the operation registry, request/result validation, and port architecture. Keep `write-file` distinct.
- Registration, in this order so typecheck stays green: (1) add `'edit-file'` to the `RemoteFilesystemOperation` union (`src/remote/protocol-frames.ts:20`, the line listing `'write-file'`) and an `'edit-file': { path: string; oldString: string; newString: string; replaceAll: boolean }` member to `RemoteFilesystemArgumentsByOperation` beside the `'write-file'` member (`protocol-frames.ts:37`); (2) add an `'edit-file'` entry to `resultDecoders` in `src/remote/filesystem/result-decoders.ts`; (3) add the descriptor module `src/remote/filesystem/edit-file-operation.ts` exporting `editFileOperation`; (4) import it in `src/remote/filesystem/operations.ts` beside `writeFileOperation` (line 14) and add `'edit-file': editFileOperation` to `MUTATION_OPERATIONS` beside `'write-file'`. The `satisfies Record<RemoteFilesystemOperation, AnyOperationDescriptor>` on `FILESYSTEM_OPERATIONS` makes a missing entry a build failure. `operations.ts` is 219 raw lines but under the 200 counted-line limit; it gains only one import line and one entry line, never inline descriptor code.
- Wire arguments: `path` (string), `oldString` and `newString` (UTF-8 text, each base64-encoded once by the sender), and `replaceAll` (required boolean; absent is invalid, not `false`). The argument type in `protocol-frames.ts` carries the base64 strings; the descriptor's `decode` returns the decoded text, so `run` receives plain text.
- Base64 validation is strict and lives as a private helper in `edit-file-operation.ts` (not in `argument-checks.ts`, which no other operation needs it in): a value is valid only when it is a string, `Buffer.from(value, 'base64').toString('base64')` equals the value exactly (Node's decoder is lenient and silently drops bad characters, so the round-trip is what rejects non-base64), and the bytes decode with `new TextDecoder('utf-8', { fatal: true })` (as `decodeEditableText` does at `src/file-write/edit-text.ts:20`). `valid` uses the helper as a predicate; `decode` throws `'Invalid remote filesystem operation arguments.'` (the `INVALID_ARGUMENTS` text from `argument-checks.ts`) on failure, as `requireInteger` does in `read-lines-operation.ts`. An empty string is valid base64 for empty text; an empty `oldString` then reaches plan 6, which answers `No matching text` (`edit-text.ts:45`). Size limits are plan 6's: `checkEditReplacement` and the result-size check inside `replaceExactText`; the descriptor adds no size check of its own.
- The frame codec does not re-encode argument strings (it stopped sniffing `content` at protocol version 22; see the comment in `src/remote/protocol.ts`), so nothing in `src/remote/frame/` changes. One base64 layer crosses the wire.
- The descriptor's `run` calls `editToolTextFile(context.root, args.path, args.oldString, args.newString, args.replaceAll)` from `src/file-write/edit.ts` directly, the same way `readLinesOperation.run` calls `readWorkspaceLines(context.root, …)` directly instead of going through `context.filesystem`. It returns the helper's `FileOperationResult<FileEditValue>` unchanged. It never reaches `src/file-navigator/remote/file-cache.ts`; plan 6's helper already writes through `atomicWriteFile`, which places its temporary file beside the target. Plan 10 must not reroute this `run` through the new port method; plan 10's port method is the near-side *sender* only.
- Containment and secrets: `paths: (args) => [args.path]` so the far side's existing containment check in the serve path refuses an escaping path before `run`; secret and other policy refusals come from plan 6's `resolveMutationTarget` inside the helper. Do not set `rootDestination` (an empty `path` is not the root for an edit).
- Failure shape: the descriptor sets `refusal: refusedItem` from `src/remote/filesystem/refusal-shapes.ts`, so a containment refusal arrives as `{ ok: false, reason }`, the same shape plan 6 returns for match failures.
- Result decoding: the `'edit-file'` decoder accepts `{ ok: true, value: { replacements } }` only when `replacements` is a positive safe integer (`Number.isSafeInteger(n) && n >= 1`), and `{ ok: false, reason }` only when `reason` is a string; anything else throws `'Invalid remote filesystem operation result.'` via `decodeResult`. Type it `decodeResult<FileOperationResult<FileEditValue>>`, importing `FileEditValue` as a type from `../../file-write/types.js`, modelled on the `'create-file'` decoder.
- Protocol version (orchestrator decision): plans 8 and 9 ship in the same PR and version 41 has not been released, so this plan does **not** bump `REMOTE_PROTOCOL_VERSION`; it stays `41`. Instead, extend the existing `// Version 41 …` comment above `export const REMOTE_PROTOCOL_VERSION = 41;` in `src/remote/protocol.ts` with a sentence that version 41 also adds the `edit-file` operation, which a version-40 remote would refuse as unknown after the handshake had already passed, so the exact-version handshake refuses that pairing first. `src/remote/protocol.test.ts` (`it('is 41', …)`) needs no change.
- Web typecheck reachability: the web project typechecks `src/` through `@shared`, and `src/file-navigator/remote/port.ts` and `port-requests.ts` import `operations.ts` as a value, so the new descriptor and `src/file-write/edit.ts` become reachable from web. This is already the case for `read-lines-operation.ts` (which imports `node:fs` code) and for `src/file-write/edit-text.ts` (`isWellFormed`, covered by `ES2024.String` in `web/tsconfig.json` `lib`), so no tsconfig change is needed; confirm with `npm run typecheck:diff`.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/remote/filesystem/write-file-operation.ts`, `read-lines-operation.ts` | Descriptor-in-its-own-module pattern; `read-lines` for calling a helper directly with `context.root` and for a throwing `decode` check |
| `src/remote/filesystem/operation-types.ts` `descriptorFor` | Typed descriptor builder (`descriptorFor<'edit-file'>()({ … })`) |
| `src/remote/filesystem/refusal-shapes.ts` `refusedItem` | Failure shape |
| `src/remote/filesystem/argument-checks.ts` `stringValue`, `requireString`, `requireBoolean` | Boundary validation for `path` and `replaceAll` |
| `src/remote/filesystem/result-decoders.ts` `decodeResult`, `'create-file'` entry | Result decoder pattern |
| `src/file-write/edit.ts` `editToolTextFile` | The edit itself (read, match, replace, atomic write, all policy refusals) |
| `src/file-write/types.ts` `FileEditValue` | Success value type |

## Proposed changes

Add the frame union member and argument type, the result decoder, the descriptor module, and the registry entry, in that order. Extend the version-41 comment in `src/remote/protocol.ts`.

Update `product/specs/remote-server.md`: extend the existing "Protocol version 41 …" paragraph (do not add a version-42 paragraph) to say version 41 also adds the `edit-file` operation, with arguments `path`, `oldString`, `newString` (each one base64 layer of UTF-8 text), and required `replaceAll`; the far side reads, matches, replaces, and atomically writes in its own workspace with no local file cache or temporary file; it answers the replacement count or `{ ok: false, reason }`; and a version-40 peer is refused at the handshake.

## Tests

- `src/remote/filesystem/operations.test.ts`: add `'edit-file'` to `ALL_OPERATIONS`; add a valid-arguments row with its `paths` (`['a.txt']`); invalid rows for missing `oldString`, missing `replaceAll`, a string `replaceAll`, non-base64 `oldString` (e.g. `'!!'`), and base64 of invalid UTF-8 (e.g. `Buffer.from([0xff]).toString('base64')`); a decode test that the decoded arguments carry plain text; result-decoder tests accepting a positive count and a failure and rejecting zero, `1.5`, a missing `replacements`, and a non-string `reason`; add `'edit-file'` to the expected list in `'names a refusal shape for exactly the operations whose result can carry one'`. It stays out of the `rootDestination` list.
- `src/remote/serve-file-navigator.test.ts`, beside the tool-text `write-file` cases: an `edit-file` request changes only the far-side file and answers `{ ok: true, value: { replacements: 1 } }`; a same-named local sentinel file is untouched; no local file-cache entry or stray temporary file appears; an escaping path is refused as `{ ok: false, reason }` and a secret path (`.env`) is refused on the far side; two matches without `replaceAll` answer `Multiple matches` and leave the file unchanged; `replaceAll: true` answers a count of 2.
- `src/remote/protocol.test.ts`: no change (version stays 41).

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each step (it covers lint, server and web typecheck, and related tests). There is no manual end-to-end check for this plan: no near-side caller sends `edit-file` until plan 10, so the `serve-file-navigator.test.ts` cases are the end-to-end proof.

## Out of scope

- The port `editFile` method, its remote request wrapper, and its deadline (plan 10).
- Typed commands and ACP routing (plans 11 through 13).
- Any protocol version bump beyond the existing 41.
- Streaming, chunking, or files over 5 MiB.
