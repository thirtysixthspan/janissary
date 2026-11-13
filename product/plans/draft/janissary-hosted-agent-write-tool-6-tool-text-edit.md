# Hosted write tool 6 — exact-text edit on the owning machine

**Complexity: 5/10** — ~90 added lines in one new module, 13 requirements, 24 matching and encoding scenarios (p=5.63).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 6 of 15 in the hosted write tool series. Depends on plan 1 (`janissary-hosted-agent-write-tool-1-shared-file-policy.md`), plan 2 (`janissary-hosted-agent-write-tool-2-mutation-parser.md`), and plan 4 (`janissary-hosted-agent-write-tool-4-contained-target.md`) for the shared target resolver. It is independent of plan 5 and can land in parallel with it.

An edit has to read, match, replace, and write in one place, on the machine that owns the file, so a remote workspace never ships the file to the caller. This plan adds that read-modify-write helper. Like plan 5, it is not wired to a port or command yet.

## Goal

A synchronous edit that replaces exact literal occurrences of `oldString` with `newString` in an existing regular UTF-8 text file, preserves every untouched byte including line endings and a BOM, and reports the replacement count or a one-word refusal.

## Design decisions and dependencies

- Source plan decision: edits require an existing regular text file. A missing target is `File not found`; a directory is `Is a directory`; any other non-regular file is `Not a text file`, classified without opening it. Containment and secret checks reuse plan 4's resolver, minus parent creation, which edits never do.
- Existing file over 5 MiB is `File too large (>5 MB)` from its `stat` size before reading. The read content is decoded with a fatal UTF-8 `TextDecoder` configured to keep the BOM (`ignoreBOM: true`), so the BOM stays part of the text and is written back unchanged; invalid UTF-8 or NUL is `Not a text file`.
- Matching is literal and non-overlapping, scanning left to right with native string search, never a regex. An empty `oldString` cannot reach here (plan 2 rejects it), but the helper still refuses it defensively as a usage-class failure rather than looping.
- Zero matches return the plan 2 `No matching text` failure. More than one match without `replaceAll` returns the `Multiple matches` failure. With `replaceAll`, every occurrence is replaced and zero is still refused. An empty file therefore has no match.
- Replacement uses split-and-join, so `$&`, `$1`, and similar markers in `newString` stay literal. An empty `newString` deletes the matched text.
- Before building the result, compute its UTF-8 byte size from the original size, the match count, and the byte lengths of both strings; refuse with `File too large (>5 MB)` when it would exceed 5 MiB, without allocating the oversized string.
- Write through `atomicWriteFile` to the resolved real path, after rechecking containment. Any refusal leaves the file unchanged. Filesystem errors map through `fileOperationReason`.
- One synchronous call with no await from validation to rename, as in plan 5.
- Result is `FileOperationResult` carrying the positive integer `replacements` value type from plan 2's `types.ts`.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-write/target.ts` (plan 4) | Containment, secret, and existing-target resolution |
| `src/file-read/policy.ts` (plan 1) | Stat classification, 5 MiB limit, policy words |
| `src/file-write/command.ts` (plan 2) | Match-failure words and the result value type |
| `src/atomic-write.ts` `atomicWriteFile`; `src/file-navigator/file-operation-result.ts` | Atomic replacement and result shapes |

## Proposed changes

Create `src/file-write/edit.ts` exporting the synchronous tool-text edit taking the root, relative path, `oldString`, `newString`, and `replaceAll`. It resolves the existing target, checks the size, decodes with BOM preservation, counts matches, checks the result size, replaces by split and join, and writes atomically.

## Tests

Add `src/file-write/edit.test.ts` against temporary directories:

- One match replaced; zero matches refused; two matches refused without `replaceAll`; two matches both replaced with `replaceAll`; zero matches with `replaceAll` refused; overlapping candidates (`aaa` searching `aa`) count non-overlapping occurrences.
- Empty `newString` deletes; `newString` containing `$&` and `$1` is written literally.
- Untouched LF, CRLF, and mixed endings survive; a BOM-prefixed file keeps its BOM; a match spanning a CRLF works only when `oldString` contains the CRLF.
- Missing file, directory, named pipe (not opened), invalid UTF-8, NUL content, empty file (no match), and existing file over 5 MiB all refuse without change.
- A replacement that would grow the file past 5 MiB refuses and leaves the file unchanged; exactly 5 MiB result is accepted.
- Escaping path, escaping symlink, and secret paths refuse; a read-only file reports the permission reason and is unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Port, remote transport, and command wiring (plans 9 through 11).
- Regex or fuzzy matching, diffs, or returning content or hashes.
- Line-ending normalization.
