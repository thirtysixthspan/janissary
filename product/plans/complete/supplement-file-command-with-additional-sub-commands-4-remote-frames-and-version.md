# Supplement file command with additional sub commands — 4: remote operation frames, version, descriptors, and far-side formatting

**Complexity: 6/10** — absorbs former subplan 5: ~215 added lines, 4 production files edited, 12 requirements, 14 scenarios (p=6.29)

Decomposed from `./product/plans/complete/supplement-file-command-with-additional-sub-commands.md`, the authoritative feature scope. This is subplan 4 of 8. It depends only on subplans 1-3 (`./product/plans/ready/supplement-file-command-with-additional-sub-commands-1-list-stat-local.md`, `...-2-exists-local.md`, `...-3-head-tail-local.md`) for the pure formatting and failure-vocabulary logic the far side must reproduce. It absorbs the former subplan 5, which had split out the operation descriptors and result decoders; the wire frames and their far-side handlers are one atomic change because `FILESYSTEM_OPERATIONS` satisfies `Record<RemoteFilesystemOperation, AnyOperationDescriptor>` and cannot compile with union members that have no descriptor.

## Goal

Declare the five new read-only remote filesystem operations on the wire and advance the protocol version once for the set, then implement the far side so each operation validates its request in the remote workspace and answers with finished output text. No caller-side port methods, command executors, dispatcher changes, or native-command wiring are part of this subplan.

## Design decisions

- The five operations are `list-directory`, `stat-path`, `path-exists`, `head-lines`, and `tail-lines`. Each request carries the path and the command's arguments; each answer is rooted at the remote workspace and carries the finished output text, so local and remote wording cannot drift.
- Add each name to `RemoteFilesystemOperation` at `src/remote/protocol-frames.ts:30-33` and its argument shape to `RemoteFilesystemArgumentsByOperation` at `src/remote/protocol-frames.ts:38-73`, following `read-lines` and `glob-paths` as the precedent. The shapes are `{ path: string }` for `list-directory`, `stat-path`, and `path-exists`, and `{ path: string; count: number }` for `head-lines` and `tail-lines`. Every answer is `{ text: string }`, matching the finished-text result decoders for `read-lines` and `glob-paths` at `src/remote/filesystem/result-decoders.ts:57-58`. `RemoteFilesystemArguments`, `RemoteFilesystemOperationRequest`, `RemoteFilesystemRequest`, and `AnyRemoteFilesystemOperationResult` are derived from these declarations and need no separate edit.
- These are operations inside the existing `filesystem-request` / `filesystem-reply` frames, not new frame types. Do not add entries to `CLIENT_FRAME_TYPES` at `src/remote/protocol-frames.ts:347` or `SERVER_FRAME_TYPES` at line 354, and do not add fields to `BINARY_FIELDS` in `src/remote/base64-fields.ts`: paths, counts, and answer text are plain string and number values.
- `list-directory` and `stat-path` are distinct from the existing `read-directory` and `stat` operations at `src/remote/protocol-frames.ts:39-40`: they carry the command's own arguments and answer with formatted output text rather than raw navigator data. Do not fold them into the existing operations.
- Advance `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` once for the whole set: bump the constant from its current 47 to 48 and add one version-history entry at the top of the comment block above it covering all five operations, explaining that a version-47 peer refuses them as unknown after the handshake has passed. Do not append them to the version-47 run-clone comment at `src/remote/protocol.ts:253-263`, which belongs to a different, unreleased feature set; one bump for this set is the source requirement, not one per operation.
- Add one operation descriptor module per operation beside `src/remote/filesystem/read-lines-operation.ts`, register each in `READ_OPERATIONS` near `src/remote/filesystem/operations.ts:75-76` (which feeds the exported `FILESYSTEM_OPERATIONS` table at line 185), and add its answer decoder to `resultDecoders` at `src/remote/filesystem/result-decoders.ts:57-58`. Follow `read-lines` and `glob-paths` as the full precedent: each descriptor is built with `descriptorFor<'operation'>()({ valid, decode, paths, rootDestination, decodeResult, run })`, where `valid` checks the raw args, `decode` narrows them, `paths` names the path arguments, and `decodeResult` points at the matching table entry. Set `rootDestination: true` on all five, since each path is relative to the far side's workspace root.
- Each descriptor's `run` treats `context.root` as the far side's workspace and calls the same pure helpers from subplans 1-3, so containment and the secret-file rules are enforced on the far side before formatting and the answer is finished output text. Do not reach for the local disk. Use the same one-word failure translation helper from subplan 1 so local and remote wording cannot drift.
- `list-directory` renders rows with the shared formatter from subplan 1 over the far side's `readDirectory` / `statRows` port methods, filters secret names, and prints `(empty directory)` when empty. `stat-path` renders one row through the same formatter; it works on files and directories.
- `path-exists` returns exactly the type word decided in subplan 2: `file`, `dir`, or `link` from `readRowStat`'s `mode`, `missing` for an absent path, and `forbidden` for an out-of-workspace or secret path, never echoing the path.
- `head-lines` numbers the first N lines as `file read` does. `tail-lines` reads the file once on the far side, counts lines, and numbers the last N with their true absolute positions rather than probing a line count and re-reading. Both use `formatFileLines` at `src/file-read/format.ts:20` with `offset = 1, limit = N` for head and `offset = total - N + 1, limit = N` for tail. N is at most 2000, so the existing numbering and truncation rules apply without hitting the read cap. A directory target answers `notdir`; other failures keep `file read`'s verbose wording as decided in subplan 3.
- The far-side dispatcher at `src/remote/serve-file-navigator.ts:63` dispatches generically through `operationDescriptor(frame.operation).run(...)` and needs no edit.
- Keep each touched production file at or under 200 lines; if `operations.ts` or `result-decoders.ts` grows past the limit, extract a cohesive group of descriptors or decoders into a new module and import it back rather than compacting code.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| Operation name union and argument map | `src/remote/protocol-frames.ts:30-33` and `src/remote/protocol-frames.ts:38-73` |
| Derived request types | `src/remote/protocol-frames.ts:75-91` |
| Frame-type catalogs and binary fields | `CLIENT_FRAME_TYPES` at `src/remote/protocol-frames.ts:347`, `SERVER_FRAME_TYPES` at line 354, `BINARY_FIELDS` in `src/remote/base64-fields.ts` — none needs an entry for these operations |
| Read-only operation precedent | `read-lines` and `glob-paths` argument shapes at `src/remote/protocol-frames.ts:48-49` |
| Protocol version constant and history note | `src/remote/protocol.ts:212-264` (`REMOTE_PROTOCOL_VERSION` at line 264) |
| `readLinesOperation` descriptor precedent | `src/remote/filesystem/read-lines-operation.ts` (38 lines) |
| Operation descriptor table | `READ_OPERATIONS` near `src/remote/filesystem/operations.ts:75-76`, exported through `FILESYSTEM_OPERATIONS` at line 185; `descriptorFor` in `src/remote/filesystem/operation-types.ts` |
| Result decoder table | `resultDecoders` at `src/remote/filesystem/result-decoders.ts:43`, with finished-text entries at lines 57-58 |
| Generic far-side dispatch | `src/remote/serve-file-navigator.ts:63` |
| Shared row formatter, one-word helper | subplan 1 |
| Type-word decision | subplan 2; `readRowStat` at `src/file-navigator/stats.ts:17` |
| Line numbering | `formatFileLines` at `src/file-read/format.ts:20` |
| Containment and secret rules | `src/file-read/policy.ts` (`checkLexicalPath` line 61, `checkRealTarget` line 73, `isSecretPath` line 24) |

## Proposed changes

- Add the five operation names and their argument shapes to the two declarations in `src/remote/protocol-frames.ts`.
- Update the `REMOTE_PROTOCOL_VERSION` constant and its version-history comment in `src/remote/protocol.ts` according to the decision above, once for the set.
- Add five descriptor modules beside `src/remote/filesystem/read-lines-operation.ts`, each validating its arguments and returning finished output text with the behavior above.
- Register the descriptors and their result decoders in `READ_OPERATIONS` and `resultDecoders`, keeping the operation names aligned with the wire declarations.

## Tests

- In `src/remote/protocol.test.ts`, add a version assertion for the chosen version and a framing round trip for a representative new operation request and reply, and confirm the exact-version handshake still refuses a peer carrying the previous version.
- Colocated tests for each descriptor, following the `read-lines` / `glob-paths` descriptor tests: valid arguments, malformed arguments, a path outside the workspace, a secret path, and the exact output text for each operation.
- Explicit parity tests for a directory row, `(empty directory)`, each `exists` word, head from line 1, tail with absolute line numbers, and `notdir`, asserting the far-side text matches what subplans 1-3 produce locally.
- Update `src/remote/protocol.test.ts` if the result union gains a new member from these descriptors.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the source changes and again after the tests. It must be clean: the descriptors and decoders are now part of this subplan, so adding the five union members can no longer leave `FILESYSTEM_OPERATIONS` incomplete and break the build or the framing round trip.

## Out of scope

Caller-side port methods and the `withRemoteTabPort` wiring (subplan 6); the ordered dispatcher chain and completion (subplan 7); native commands, settings, roles, primers, the agent gate, and the workspace runner (subplan 8); help, specs, and manual end-to-end checks (subplan 9). Do not change the wire encoding or the frame-type catalogs, and keep command executors out of this subplan.
