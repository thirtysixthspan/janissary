# Hosted write tool 6 — exact-text edit on the owning machine

**Complexity: 6/10** — ~100 added lines in one new module, 18 requirements, 28 matching, encoding, and policy scenarios (p=5.94).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 6 of 15 in the hosted write tool series. Depends on plan 1 (`janissary-hosted-agent-write-tool-1-shared-file-policy.md`), plan 2 (split into 2a/2b/2c1/2c2; `janissary-hosted-agent-write-tool-2a-contract-and-messages.md` owns the request type and match-failure words), and plan 4 (`janissary-hosted-agent-write-tool-4-contained-target.md`) for the shared target resolver. All of these, and plan 5, are already complete on this branch; this plan only adds a new module and edits no existing production file.

An edit has to read, match, replace, and write in one place, on the machine that owns the file, so a remote workspace never ships the file to the caller. This plan adds that read-modify-write helper. Like plan 5, it is not wired to a port or command yet.

## Goal

A synchronous edit that replaces exact literal occurrences of `oldString` with `newString` in an existing regular UTF-8 text file, preserves every untouched byte including line endings and a BOM, and reports the replacement count or a one-word refusal.

## Design decisions and dependencies

- Source plan decision: edits require an existing regular text file. Resolve with `resolveMutationTarget(root, relativePath)` from `src/file-write/target.ts`; it already refuses escapes, secrets, directories (`Is a directory`), and non-regular files (`Not a text file`, via `lstatSync`/`statSync` only, never opening). When it succeeds with `exists: false` (including any `missingSegments`), the edit returns `File not found` (the `FilePolicyFailure` word from `src/file-read/policy.ts`). Edits never create parents.
- Existing file over `FILE_POLICY_MAX_BYTES` (`src/file-read/policy.ts`) is `File too large (>5 MB)` from its `statSync` size before reading. Read the bytes with `readFileSync` (no encoding) and decode with a `TextDecoder` for UTF-8 with `fatal: true` and `ignoreBOM: true`, so the BOM stays part of the text and is written back unchanged; a decode throw or any NUL in the decoded text is `Not a text file`. Do not reuse `readExistingText` in `src/file-write/filesystem.ts`: it decodes non-fatally and strips the BOM.
- `newString` is checked first, before resolving the target: containing NUL or failing `isWellFormed()` is `Not a text file`, matching `encodeToolText` in `src/file-write/filesystem.ts` (the plan 2 parser in `src/file-write/command.ts` checks neither). `oldString` is not checked; a malformed one simply finds no match.
- Matching is literal and non-overlapping, scanning left to right with `indexOf` advancing by `oldString.length`, never a regex. An empty `oldString` cannot reach here (`src/file-write/command.ts` returns `undefined` for `oldString === ''`), but the helper still refuses it defensively with `NO_MATCHING_TEXT_REASON` rather than looping.
- Zero matches return `NO_MATCHING_TEXT_REASON` (`'No matching text'`). More than one match without `replaceAll` returns `MULTIPLE_MATCHES_REASON` (`'Multiple matches'`); both are exported from `src/file-write/types.ts`, not `command.ts`. With `replaceAll`, every occurrence is replaced and zero is still refused. An empty file therefore has no match.
- Replacement uses split-and-join, so `$&`, `$1`, and similar markers in `newString` stay literal. An empty `newString` deletes the matched text.
- Before building the result, compute its UTF-8 byte size as the original byte length plus count times (`Buffer.byteLength(newString)` minus `Buffer.byteLength(oldString)`); refuse with `File too large (>5 MB)` when it exceeds `FILE_POLICY_MAX_BYTES` (exactly equal is accepted), without allocating the oversized string.
- Write by calling `createTargetParents(target)` from `src/file-write/target.ts` (with no missing segments it only rechecks containment and returns the real destination), then `atomicWriteFile` with the UTF-8 buffer inside `runFileOperation`, exactly like the private `writeEncoded` in `src/file-write/filesystem.ts`. Wrap the stat and read in `runFileOperation` too, so every filesystem error maps through `fileOperationReason`. Any refusal leaves the file unchanged.
- One synchronous call with no await from validation to rename, as in plan 5.
- Result is `FileOperationResult<FileEditValue>` (`FileEditValue` from `src/file-write/types.ts`, `{ replacements }`, always at least 1 on success).
- Check order: `newString` text check, resolve target, missing target, size, decode, count matches, result size, write.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-write/target.ts` `resolveMutationTarget`, `createTargetParents` (plan 4) | Containment, secret, classification, pre-write recheck |
| `src/file-read/policy.ts` `FILE_POLICY_MAX_BYTES`, `FilePolicyFailure` (plan 1) | 5 MiB limit and policy words |
| `src/file-write/types.ts` `NO_MATCHING_TEXT_REASON`, `MULTIPLE_MATCHES_REASON`, `FileEditValue` (plan 2a) | Match-failure words and the result value type |
| `src/file-write/filesystem.ts` `encodeToolText`, `writeEncoded` (plan 5) | Patterns to mirror for the text check and write; both are private, so mirror rather than import |
| `src/atomic-write.ts` `atomicWriteFile`; `src/file-navigator/file-operation-result.ts` | Atomic replacement and result shapes |

## Proposed changes

Create `src/file-write/edit.ts` exporting `editToolTextFile(root, relativePath, oldString, newString, replaceAll)` returning `FileOperationResult<FileEditValue>`. Keep it a new module rather than growing `src/file-write/filesystem.ts` (44 lines), split into small private helpers (decode, count, write) so it stays well under 200 lines and the cognitive-complexity limit. Relative imports use `.js` extensions. It resolves the existing target, checks the size, decodes with BOM preservation, counts matches, checks the result size, replaces by split and join, and writes atomically.

## Tests

Add `src/file-write/edit.test.ts` against temporary directories:

- One match replaced; zero matches refused; two matches refused without `replaceAll`; two matches both replaced with `replaceAll`; zero matches with `replaceAll` refused; overlapping candidates (`aaa` searching `aa`) count non-overlapping occurrences.
- Empty `newString` deletes; `newString` containing `$&` and `$1` is written literally.
- Untouched LF, CRLF, and mixed endings survive; a BOM-prefixed file keeps its BOM; a match spanning a CRLF works only when `oldString` contains the CRLF.
- Missing file, directory, named pipe (not opened), invalid UTF-8, NUL content, empty file (no match), and existing file over 5 MiB all refuse without change.
- A replacement that would grow the file past 5 MiB refuses and leaves the file unchanged; exactly 5 MiB result is accepted.
- Success returns `{ replacements: N }` with the correct count; a missing parent directory refuses `File not found` and creates nothing; `newString` containing NUL or a lone surrogate refuses `Not a text file`.
- Escaping path, escaping symlink, and secret paths refuse; a read-only file reports the permission reason and is unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. There is no user-facing entry point until plans 9 through 11, so `src/file-write/edit.test.ts` is the end-to-end check.

## Out of scope

- Port, remote transport, and command wiring (plans 9 through 11).
- Regex or fuzzy matching, diffs, or returning content or hashes.
- Line-ending normalization.
