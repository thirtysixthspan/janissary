# Hosted write tool 9 — the far-side `edit-file` remote operation

**Complexity: 5/10** — ~50 added lines across 4 files plus a descriptor module, 6 requirements, 11 scenarios (p=5.44).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 9 of 15 in the hosted write tool series. Depends on plan 2 (`janissary-hosted-agent-write-tool-2-mutation-parser.md`) for the result type, plan 6 (`janissary-hosted-agent-write-tool-6-tool-text-edit.md`) for the edit helper, and plan 8 (`janissary-hosted-agent-write-tool-8-remote-write-policy.md`) for the protocol version it set.

An edit on a remote workspace must not fetch the file, change it locally, and send it back. This plan adds a dedicated `edit-file` operation to the remote filesystem registry, so the far side reads, matches, replaces, and atomically writes in its own workspace through plan 6's helper. Plan 10 gives the ports an `editFile` method that sends it.

## Goal

A registered, validated `edit-file` operation whose request carries `path`, base64 `oldString` and `newString`, and `replaceAll`, whose far side runs plan 6's edit in its workspace, and whose reply is either a positive replacement count or the existing structured failure. A peer that does not know the operation is refused at the handshake.

## Design decisions and dependencies

- Source plan decision: a dedicated `edit-file` operation rather than an edit mode on `write-file`, reusing the operation registry, request/result validation, and port architecture. Keep `write-file` distinct.
- Register it in `RemoteFilesystemOperation` and `RemoteFilesystemArgumentsByOperation` in `src/remote/protocol-frames.ts`, in `MUTATION_OPERATIONS` in `src/remote/filesystem/operations.ts` through a new `src/remote/filesystem/edit-file-operation.ts` descriptor (keeping `operations.ts`, at 192 counted lines, to one import and one entry), and in `resultDecoders` in `src/remote/filesystem/result-decoders.ts`. The `satisfies` on `FILESYSTEM_OPERATIONS` makes a missing entry a build failure.
- Wire arguments: `path` (string), `oldString` and `newString` (UTF-8 base64 strings, encoded once by the sender), and `replaceAll` (required boolean). The descriptor validates with `requireString` and `requireBoolean`, decodes both strings on the owning machine before matching, and treats non-base64 or non-UTF-8 payloads as invalid arguments. The general frame codec must not encode those fields again. Decoded text is subject to plan 6's 5 MiB checks.
- The descriptor's `run` calls plan 6's helper with `context.root`, the same way `read-lines` calls the reader directly. It never reaches `src/file-navigator/remote/file-cache.ts` and creates temporary output only beside the target through `atomicWriteFile`.
- Failure shape: the descriptor names `refusedItem`, so a containment refusal arrives as `{ ok: false, reason }`. Its `paths` names `path` for the far side's existing containment check.
- Result decoding: success must carry `value.replacements` as a positive safe integer; failure must carry a string `reason`; anything else is an invalid result.
- Bump `REMOTE_PROTOCOL_VERSION` to the next unused version after plan 8's, with a comment that an older remote would refuse `edit-file` as unknown; the exact-version handshake refuses that pairing first. If plans 8 and 9 ship in one release, fold them into one bump and one comment.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/remote/filesystem/write-file-operation.ts`, `read-lines-operation.ts` | Descriptor-in-its-own-module pattern |
| `src/remote/filesystem/operation-types.ts` `descriptorFor` | Typed descriptor builder |
| `src/remote/filesystem/refusal-shapes.ts` `refusedItem` | Failure shape |
| `src/remote/filesystem/argument-checks.ts` `requireString`, `requireBoolean` | Boundary validation |
| `src/file-write/edit.ts` (plan 6) | The edit itself |

## Proposed changes

Add the frame union member and argument type, the descriptor module, the registry entry, the result decoder, and the version bump with its comment.

Update `product/specs/remote-server.md`: the `edit-file` operation, its arguments with one base64 layer for both strings, far-side read-modify-write with no file cache, its result shape, and the new version.

## Tests

- `src/remote/filesystem/operations.test.ts`: valid arguments decode; missing fields, a string `replaceAll`, non-base64 `oldString`, and invalid UTF-8 after decoding are invalid; the result decoder accepts a positive count and a failure, and rejects zero, a fraction, and a missing `replacements`; a refusal uses `refusedItem`.
- `src/remote/serve-file-navigator.test.ts`: an `edit-file` request changes only the far-side file and answers the count; a same-named local sentinel file is untouched; no local file-cache entry or temporary file appears; an escaping path and a secret path are refused on the far side; multiple matches without `replaceAll` answer the match failure and leave the file.
- `src/remote/protocol.test.ts`: new version number, previous version refused.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- The port `editFile` method, its remote request wrapper, and its deadline (plan 10).
- Typed commands and ACP routing (plans 11 through 13).
- Streaming, chunking, or files over 5 MiB.
