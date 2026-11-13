# File glob 5 — far-side `glob-paths` remote filesystem operation

**Complexity: 5/10** — ~50 added lines, 4 files edited, 8 requirements, 10 test scenarios (p=5.58)

Run order: 5 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 1 (`FILE_GLOB_MAX_LIMIT`, `FILE_GLOB_DEFAULT_LIMIT`) and subplan 4 (`globWorkspace`, `GLOB_TIMEOUT_MS`).

A remote tab must glob its remote clone and never the local disk. This subplan adds the read-only `glob-paths` operation the far side answers, registers it in the operation table, and bumps the protocol version so a peer without it is refused at the handshake. The near-side port method that sends it is subplan 6.

## Design decisions

All from the source plan:

- The operation is named `glob-paths` and is read-only. Its arguments are `{ pattern: string; dir?: string; hidden?: boolean; dirs?: boolean; limit?: number }`.
- `valid`/`decode` require `pattern` to be a string, `dir` an optional string, `hidden` and `dirs` optional booleans, and `limit` an optional integer from 1 to `FILE_GLOB_MAX_LIMIT`. Anything else is the standard invalid-arguments refusal.
- `paths` returns `[args.dir]` when `dir` is present, else `[]`, with `rootDestination: true`, so the existing far-side containment check applies to `--path` before the operation runs. A refusal comes back as an error carrying the containment reason, which subplan 7 maps to `Outside the workspace: <dir>.`
- `run` returns a promise of `{ text }` from `globWorkspace(context.root, …)` with a fresh deadline, filling omitted flags with false and an omitted limit with `FILE_GLOB_DEFAULT_LIMIT`. The descriptor's `run` already allows `MaybePromise` (`src/remote/filesystem/operation-types.ts`).
- The result decoder accepts exactly `{ text: string }`, beside `read-lines`.
- The standard 60-second request deadline (`REQUEST_DEADLINE_MS` in `src/file-navigator/remote/port-requests.ts`) is enough, because the far side stops at 30 seconds, so `glob-paths` is not added to the `LONG_RUNNING` set.
- `REMOTE_PROTOCOL_VERSION` goes from 41 to 42. A version-41 remote would refuse `glob-paths` as unknown after the handshake had passed, so the exact-version handshake refuses the pairing first.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `readLinesOperation` | `src/remote/filesystem/read-lines-operation.ts` | The model for the descriptor file, its integer checks, and `INVALID_ARGUMENTS`. |
| `requireString`, `stringValue` | `src/remote/filesystem/argument-checks.ts` | Argument validation and decoding. |
| `READ_OPERATIONS` table, `FILESYSTEM_OPERATIONS` | `src/remote/filesystem/operations.ts` | Registration beside `'read-lines': readLinesOperation`; the `satisfies Record<RemoteFilesystemOperation, …>` forces the entry once the union grows. |
| `resultDecoders['read-lines']` | `src/remote/filesystem/result-decoders.ts` | The `{ text }` decoder pattern. |
| `RemoteFilesystemOperation`, `RemoteFilesystemArgumentsByOperation` | `src/remote/protocol-frames.ts` | The operation union and its argument map. |
| Version history comment | `src/remote/protocol.ts` above `REMOTE_PROTOCOL_VERSION` | The style for the version-42 entry. |

## Proposed changes

- `src/remote/protocol-frames.ts`: add `'glob-paths'` to `RemoteFilesystemOperation` and its argument shape to `RemoteFilesystemArgumentsByOperation`.
- New `src/remote/filesystem/glob-paths-operation.ts` exporting `globPathsOperation`, built with `descriptorFor<'glob-paths'>()` as described above. Optional booleans are decoded only when sent, the way `read-lines` decodes only the integers it was sent.
- `src/remote/filesystem/operations.ts`: register `'glob-paths': globPathsOperation` in `READ_OPERATIONS` beside `read-lines`. The file is at 221 raw lines with comments; this is a two-line change (an import and an entry), and if the lint-counted size crosses 200 the read-operations table moves to its own module rather than being compacted.
- `src/remote/filesystem/result-decoders.ts`: add a `'glob-paths'` `{ text: string }` decoder beside `'read-lines'`.
- `src/remote/protocol.ts`: `REMOTE_PROTOCOL_VERSION` to 42, with a version-42 sentence in the existing comment style stating the reason above.
- `product/specs/remote-server.md`: a `Protocol version 42` paragraph after the version-41 one, naming `glob-paths`, its arguments, its `{ text }` result, its containment check on `dir`, its use of the normal request deadline, and why a version-41 peer is refused.

## Tests

- `src/remote/filesystem/operations.test.ts`: `glob-paths` decodes a pattern alone and every optional field; it decodes only the fields it was sent; it rejects a non-string pattern, a non-string `dir`, a non-boolean `hidden` or `dirs`, and a `limit` of 0, 1001, or 1.5; its result decoder accepts `{ text }` and rejects a result without string text; `paths` returns `[dir]` or `[]`.
- `src/remote/serve-file-navigator.test.ts`: a `glob-paths` request returns the sorted root-relative matches from the far-side workspace, and a `dir` that climbs out of the root is refused by the containment check before the walk runs.
- `src/remote/protocol.test.ts`: the version pin changes from 41 to 42.

## Verification

- `$janissary/scripts/run.mjs check-diff`.

## Out of scope

The near-side port method (subplan 6), the typed command (subplan 7), and the ACP loop (subplan 8). `glob-paths` never mutates and never streams partial results.
