# Supplement file command with additional sub commands — 5: remote operation descriptors, far-side formatting, and decoders

**Complexity: 5/10** — ~170 added lines, 5 new descriptor modules, 7 requirements (p=5.62)

Decomposed from `./product/plans/complete/supplement-file-command-with-additional-sub-commands.md`, the authoritative feature scope. This is subplan 5 of 9. It depends on subplan 4 (`./product/plans/ready/supplement-file-command-with-additional-sub-commands-4-remote-frames-and-version.md`) for the declared operations and on subplans 1-3 (`./product/plans/ready/supplement-file-command-with-additional-sub-commands-1-list-stat-local.md`, `...-2-exists-local.md`, `...-3-head-tail-local.md`) for the pure formatting and failure-vocabulary logic the far side must reproduce. Subplan 6 adds the caller-side port methods and wires the command executors to these operations.

## Goal

Implement the far side of the five new read-only operations so each one validates its request in the remote workspace and answers with finished output text. No caller-side port methods, no command executor changes, and no dispatcher or native-command wiring are part of this subplan.

## Design decisions

- Add one operation descriptor module per operation beside `src/remote/filesystem/read-lines-operation.ts`, add each to `READ_OPERATIONS` near `src/remote/filesystem/operations.ts:75-76` (which feeds the exported `FILESYSTEM_OPERATIONS` table at line 185), and add its answer decoder to `resultDecoders` at `src/remote/filesystem/result-decoders.ts:57-58`. Follow `read-lines` and `glob-paths` as the full precedent: each descriptor is built with `descriptorFor<'operation'>()({ valid, decode, paths, rootDestination, decodeResult, run })`, where `valid` checks the raw args, `decode` narrows them, `paths` names the path arguments, and `decodeResult` points at the matching table entry. Set `rootDestination: true` on all five, since each path is relative to the far side's workspace root. `AnyRemoteFilesystemOperationResult` is derived from these descriptors and needs no separate edit.
- Each descriptor's `run` treats `context.root` as the far side's workspace and calls the same pure helpers from subplans 1-3, so containment and the secret-file rules are enforced on the far side before formatting and the answer is finished output text. Do not reach for the local disk. Use the same one-word failure translation helper from subplan 1 so local and remote wording cannot drift.
- `list-directory` renders rows with the shared formatter from subplan 1 over the far side's `readDirectory` / `statRows` port methods, filters secret names, and prints `(empty directory)` when empty. `stat-path` renders one row through the same formatter; it works on files and directories.
- `path-exists` returns exactly the type word decided in subplan 2: `file`, `dir`, or `link` from `readRowStat`'s `mode`, `missing` for an absent path, and `forbidden` for an out-of-workspace or secret path, never echoing the path.
- `head-lines` numbers the first N lines as `file read` does. `tail-lines` reads the file once on the far side, counts lines, and numbers the last N with their true absolute positions rather than probing a line count and re-reading. Both use `formatFileLines` at `src/file-read/format.ts:20` with `offset = 1, limit = N` for head and `offset = total - N + 1, limit = N` for tail. N is at most 2000, so the existing numbering and truncation rules apply without hitting the read cap. A directory target answers `notdir`; other failures keep `file read`'s verbose wording as decided in subplan 3.
- The far-side dispatcher at `src/remote/serve-file-navigator.ts:63` dispatches generically through `operationDescriptor(frame.operation).run(...)` and needs no edit.
- Keep each touched production file at or under 200 lines; if `operations.ts` or `result-decoders.ts` grows past the limit, extract a cohesive group of descriptors or decoders into a new module and import it back rather than compacting code.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| `readLinesOperation` descriptor precedent | `src/remote/filesystem/read-lines-operation.ts` (38 lines) |
| Operation descriptor table | `READ_OPERATIONS` near `src/remote/filesystem/operations.ts:75-76`, exported through `FILESYSTEM_OPERATIONS` at line 185; `descriptorFor` in `src/remote/filesystem/operation-types.ts` |
| Result decoder table | `resultDecoders` at `src/remote/filesystem/result-decoders.ts:43`, with finished-text entries at lines 57-58 |
| Generic far-side dispatch | `src/remote/serve-file-navigator.ts:63` |
| Shared row formatter, one-word helper | subplan 1 |
| Type-word decision | subplan 2; `readRowStat` at `src/file-navigator/stats.ts:17` |
| Line numbering | `formatFileLines` at `src/file-read/format.ts:20` |
| Containment and secret rules | `src/file-read/policy.ts` (`checkLexicalPath` line 61, `checkRealTarget` line 73, `isSecretPath` line 24) |

## Proposed changes

- Add five descriptor modules beside `src/remote/filesystem/read-lines-operation.ts`, each validating its arguments and returning finished output text with the behavior above.
- Register the descriptors and their result decoders in the two tables, keeping the operation names aligned with subplan 4.

## Tests

- Colocated tests for each descriptor, following the `read-lines` / `glob-paths` descriptor tests: valid arguments, malformed arguments, a path outside the workspace, a secret path, and the exact output text for each operation.
- Explicit parity tests for a directory row, `(empty directory)`, each `exists` word, head from line 1, tail with absolute line numbers, and `notdir`, asserting the far-side text matches what subplans 1-3 produce locally.
- Update `src/remote/protocol.test.ts` if the result union gains a new member from these descriptors.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the source changes and again after the tests. No typed command reaches these operations until subplan 6, so verify far-side behavior through descriptor tests here.

## Out of scope

Caller-side port methods and the `withRemoteTabPort` wiring (subplan 6); the ordered dispatcher chain and completion (subplan 7); native commands, roles, primers, the agent gate, and the workspace runner (subplan 8); help, specs, and manual end-to-end checks (subplan 9).
