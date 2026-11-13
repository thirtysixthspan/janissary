# Hosted write tool 6b — exact-text edit of an existing file on the owning machine

**Complexity: 4/10** — ~45 added lines in one new module, 0 edited files, 9 requirements, 18 filesystem and policy scenarios (p=5.15).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Decomposed from `./product/plans/complete/janissary-hosted-agent-write-tool-6-tool-text-edit.md` (run order 6 of 15 in the hosted write tool series); this is piece 6b of 2. Depends on plan 1 (`janissary-hosted-agent-write-tool-1-shared-file-policy.md`), plan 2a (`janissary-hosted-agent-write-tool-2a-contract-and-messages.md`, for `FileEditValue`), plan 4 (`janissary-hosted-agent-write-tool-4-contained-target.md`) for the shared target resolver, and plan 6a (`janissary-hosted-agent-write-tool-6a-edit-text-replacement.md`) for the pure text rules. Plans 1, 2a, 4, 5, and 6a are complete on this branch (`src/file-write/edit-text.ts` exists, including the ill-formed `oldString` refusal from `refuse-ill-formed-edit-old-string.md`), so nothing remains to land first.

This piece adds the read-modify-write helper that plans 9 and 10 call as `src/file-write/edit.ts` `editToolTextFile`. A remote workspace never ships the file to the caller: the read, match, replace, and write happen in one synchronous call on the machine that owns the file. Like plan 5, it is not wired to a port or command yet.

## Goal

A synchronous edit that replaces exact literal occurrences of `oldString` with `newString` in an existing regular UTF-8 text file, preserves every untouched byte including line endings and a BOM, and reports the replacement count or a one-word refusal.

## Design decisions and dependencies

- Create `src/file-write/edit.ts` exporting `editToolTextFile(root, relativePath, oldString, newString, replaceAll)` returning `FileOperationResult<FileEditValue>` (`FileEditValue` from `src/file-write/types.ts`, `{ replacements }`, always at least 1 on success). Keep it a new module rather than growing `src/file-write/filesystem.ts` (44 lines), with small private helpers (read, write) so it stays well under 200 lines and the cognitive-complexity limit. Relative imports use `.js` extensions.
- `newString` is checked first, before resolving the target, with `checkEditReplacement` from plan 6a, so a NUL or lone surrogate is `Not a text file` even for a path that would also be refused.
- Source plan decision: edits require an existing regular text file. Resolve with `resolveMutationTarget(root, relativePath)` from `src/file-write/target.ts`; it already refuses escapes, secrets, directories (`Is a directory`), and non-regular files (`Not a text file`, via `lstatSync`/`statSync` only, never opening), and its failure result is returned unchanged. When it succeeds with `exists: false` (including any `missingSegments`), the edit returns `File not found` (the `FilePolicyFailure` word from `src/file-read/policy.ts`). Edits never create parents.
- Existing file over `FILE_POLICY_MAX_BYTES` (`src/file-read/policy.ts`) is `File too large (>5 MB)` from its `statSync` size before reading. Read the bytes with `readFileSync` (no encoding) and decode with plan 6a's `decodeEditableText`, which keeps the BOM so it is written back unchanged. Do not reuse `readExistingText` in `src/file-write/filesystem.ts`: it decodes non-fatally and strips the BOM.
- Wrap the stat and read in `runFileOperation`, so every filesystem error maps through `fileOperationReason`. Stat and read `target.realPath` (already symlink-resolved). When the wrapped helper itself returns a `FileOperationResult`, unwrap the nested result exactly as `checkExpectedHash` in `src/file-write/filesystem.ts` does (`if (!read.ok) return read; if (!read.value.ok) return read.value;`).
- Match, size-check, and replace with plan 6a's `replaceExactText`, passing the read buffer's byte length; its refusals (`NO_MATCHING_TEXT_REASON` for an empty, ill-formed, or absent `oldString`; `MULTIPLE_MATCHES_REASON`; `File too large (>5 MB)`) are returned unchanged. Do not re-validate `oldString` in `edit.ts`.
- Write by calling `createTargetParents(target)` from `src/file-write/target.ts` (with no missing segments it only rechecks containment and returns the real destination), then `atomicWriteFile` with the UTF-8 buffer of the edited text inside `runFileOperation`, exactly like the private `writeEncoded` in `src/file-write/filesystem.ts` (mirror rather than import). Any refusal leaves the file unchanged. If the file is deleted between the read and `createTargetParents`, the recheck returns the lexical destination and the write recreates it; this race window is accepted, matching plan 5's write, and is not tested.
- One synchronous call with no await from validation to rename, as in plan 5.
- Check order: `newString` text check, resolve target, missing target, size, decode, count matches, result size, write.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-write/edit-text.ts` `checkEditReplacement`, `decodeEditableText`, `replaceExactText` (plan 6a) | Text check, BOM-keeping decode, matching, result size, replacement |
| `src/file-write/target.ts` `resolveMutationTarget`, `createTargetParents` (plan 4) | Containment, secret, classification, pre-write recheck |
| `src/file-read/policy.ts` `FILE_POLICY_MAX_BYTES`, `FilePolicyFailure` (plan 1) | 5 MiB limit and policy words |
| `src/file-write/types.ts` `FileEditValue` (plan 2a) | The result value type |
| `src/file-write/filesystem.ts` `writeEncoded` (plan 5) | Pattern to mirror for the write; private, so mirror rather than import |
| `src/atomic-write.ts` `atomicWriteFile`; `src/file-navigator/file-operation-result.ts` | Atomic replacement and result shapes |

## Proposed changes

Create `src/file-write/edit.ts` exporting `editToolTextFile`. It checks `newString`, resolves the existing target, checks the size, reads and decodes with BOM preservation, runs the 6a replacement, and writes atomically. No existing production file changes.

## Tests

Add `src/file-write/edit.test.ts` against temporary directories, reusing the setup patterns of `src/file-write/filesystem.test.ts` (`chmodSync` for read-only, restored in cleanup) and `src/file-write/target.test.ts` (`execFileSync('mkfifo', …)` for the pipe); the matching rules themselves are covered by plan 6a, so this file proves the on-disk behavior:

- One match replaced on disk and `{ replacements: 1 }` returned; two matches with `replaceAll` both replaced and `{ replacements: 2 }` returned; zero matches and multiple matches without `replaceAll` refuse and leave the file unchanged.
- Untouched CRLF and mixed line endings survive byte for byte; a BOM-prefixed file keeps its BOM on disk.
- Missing file, directory, named pipe (not opened), invalid UTF-8, NUL content, empty file (no match), and existing file over 5 MiB all refuse without change.
- A replacement that would grow the file past 5 MiB refuses and leaves the file unchanged; an exactly 5 MiB result is written.
- A missing parent directory refuses `File not found` and creates nothing; `newString` containing NUL or a lone surrogate refuses `Not a text file` and leaves the file unchanged.
- An empty or ill-formed (lone surrogate) `oldString` refuses `No matching text` and leaves the file unchanged.
- Escaping path, escaping symlink, and secret paths refuse; a read-only file reports the permission reason and is unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. There is no user-facing entry point until plans 9 through 11, so `src/file-write/edit.test.ts` is the end-to-end check for plan 6 as a whole.

## Out of scope

- Port, remote transport, and command wiring (plans 9 through 11).
- Regex or fuzzy matching, diffs, or returning content or hashes.
- Line-ending normalization.
