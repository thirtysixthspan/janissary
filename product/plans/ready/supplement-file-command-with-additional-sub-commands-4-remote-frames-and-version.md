# Supplement file command with additional sub commands — 4: remote operation frames and protocol version

**Complexity: 4/10** — 45 added lines across 2 protocol files, 6 requirements (p=4.91)

Decomposed from `./product/plans/complete/supplement-file-command-with-additional-sub-commands.md`, the authoritative feature scope. This is subplan 4 of 9. It depends on subplans 1-3 (`./product/plans/ready/supplement-file-command-with-additional-sub-commands-1-list-stat-local.md`, `...-2-exists-local.md`, `...-3-head-tail-local.md`) because the request argument shapes mirror their parser results. Subplan 5 adds the operation descriptors and result decoders for the frames declared here.

## Goal

Declare the five new read-only remote filesystem operations on the wire and advance the protocol version once for the set. No operation descriptors, decoders, port methods, or command executors are part of this subplan.

## Design decisions

- The five operations are `list-directory`, `stat-path`, `path-exists`, `head-lines`, and `tail-lines`. Each request carries the path and the command's arguments; each answer is rooted at the remote workspace and carries the finished output text, so local and remote wording cannot drift.
- Add each name to `RemoteFilesystemOperation` at `src/remote/protocol-frames.ts:30-33` and its argument shape to `RemoteFilesystemArgumentsByOperation` at `src/remote/protocol-frames.ts:38-73`, following `read-lines` and `glob-paths` as the precedent. The shapes are `{ path: string }` for `list-directory`, `stat-path`, and `path-exists`, and `{ path: string; count: number }` for `head-lines` and `tail-lines`. Every answer is `{ text: string }`, matching the finished-text result decoders for `read-lines` and `glob-paths` at `src/remote/filesystem/result-decoders.ts:57-58`. `RemoteFilesystemArguments`, `RemoteFilesystemOperationRequest`, and `RemoteFilesystemRequest` are derived from those two declarations and need no separate edit.
- These are operations inside the existing `filesystem-request` / `filesystem-reply` frames, not new frame types. Do not add entries to `CLIENT_FRAME_TYPES` at `src/remote/protocol-frames.ts:347` or `SERVER_FRAME_TYPES` at line 354, and do not add fields to `BINARY_FIELDS` in `src/remote/base64-fields.ts`: paths, counts, and answer text are plain string and number values.
- `list-directory` and `stat-path` are distinct from the existing `read-directory` and `stat` operations at `src/remote/protocol-frames.ts:39-40`: they carry the command's own arguments and answer with formatted output text rather than raw navigator data. Do not fold them into the existing operations.
- Advance `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` once for the whole set: bump the constant from its current 47 to 48 and add one version-history entry at the top of the comment block above it covering all five operations, explaining that a version-47 peer refuses them as unknown after the handshake has passed. Do not append them to the version-47 run-clone comment at `src/remote/protocol.ts:253-263`, which belongs to a different, unreleased feature set; one bump for this set is the source requirement, not one per operation.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| Operation name union and argument map | `src/remote/protocol-frames.ts:30-33` and `src/remote/protocol-frames.ts:38-73` |
| Derived request types | `src/remote/protocol-frames.ts:75-91` |
| Frame-type catalogs and binary fields | `CLIENT_FRAME_TYPES` at `src/remote/protocol-frames.ts:347`, `SERVER_FRAME_TYPES` at line 354, `BINARY_FIELDS` in `src/remote/base64-fields.ts` — none needs an entry for these operations |
| Read-only operation precedent | `read-lines` and `glob-paths` argument shapes at `src/remote/protocol-frames.ts:48-49` |
| Protocol version constant and history note | `src/remote/protocol.ts:212-264` (`REMOTE_PROTOCOL_VERSION` at line 264) |

## Proposed changes

- Add the five operation names and their argument shapes to the two declarations in `src/remote/protocol-frames.ts`.
- Update the `REMOTE_PROTOCOL_VERSION` constant and its version-history comment in `src/remote/protocol.ts` according to the decision above, once for the set.

## Tests

- In `src/remote/protocol.test.ts`, add a version assertion for the chosen version and a framing round trip for a representative new operation request and reply, and confirm the exact-version handshake still refuses a peer carrying the previous version.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the source changes and again after the tests. No far-side handler exists until subplan 5, so verify only the declared shapes and version here.

## Out of scope

Operation descriptors, far-side validation and formatting, result decoders, caller-side port methods, executors, dispatcher, completion, native commands, agent integration, help, and specs (subplans 5-9). Do not change the wire encoding or the frame-type catalogs.
