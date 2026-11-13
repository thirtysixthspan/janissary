# Hosted write tool 6a — pure exact-text matching, replacement, and text checks

**Complexity: 5/10** — ~65 added lines in one new pure module, 0 edited files, 11 requirements, 18 matching, encoding, and size scenarios (p=5.37).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Decomposed from `./product/plans/complete/janissary-hosted-agent-write-tool-6-tool-text-edit.md` (run order 6 of 15 in the hosted write tool series); this is piece 6a of 2. Depends on plan 1 (`janissary-hosted-agent-write-tool-1-shared-file-policy.md`) for `FILE_POLICY_MAX_BYTES` and the policy words, and plan 2a (`janissary-hosted-agent-write-tool-2a-contract-and-messages.md`) for `NO_MATCHING_TEXT_REASON` and `MULTIPLE_MATCHES_REASON`. Both are complete on this branch. Plan 6b depends on this piece.

An edit has to read, match, replace, and write in one place, on the machine that owns the file. This piece holds every rule that does not touch the filesystem: checking the replacement text, decoding the existing bytes with the BOM kept, counting literal matches, refusing an oversized result, and building the replaced text. It touches no file and nothing calls it yet; plan 6b wires it into `editToolTextFile`.

## Goal

A pure, synchronous text module that decides whether an exact literal edit is allowed and, when it is, returns the replaced text and the replacement count, preserving every untouched character, including line endings and a leading BOM.

## Design decisions and dependencies

- Create `src/file-write/edit-text.ts`. It imports only `src/file-read/policy.ts`, `src/file-write/types.ts`, and `src/file-navigator/file-operation-result.ts`, and never `node:fs`, so it is testable without a temporary directory. Relative imports use `.js` extensions.
- `checkEditReplacement(newString)` returns `FileOperationResult`: containing NUL or failing `isWellFormed()` is `Not a text file`, matching `encodeToolText` in `src/file-write/filesystem.ts` (the plan 2 parser in `src/file-write/command.ts` checks neither). `encodeToolText` is private, so mirror its rule rather than import it. `oldString` is not checked; a malformed one simply finds no match.
- `decodeEditableText(bytes)` takes the raw bytes (a `Uint8Array`, as `readFileSync` returns with no encoding) and returns `FileOperationResult<string>`. It decodes with a `TextDecoder` for UTF-8 with `fatal: true` and `ignoreBOM: true`, so the BOM stays part of the text and is written back unchanged; a decode throw or any NUL in the decoded text is `Not a text file`. Do not reuse `readExistingText` in `src/file-write/filesystem.ts`: it decodes non-fatally and strips the BOM.
- `replaceExactText(text, byteLength, oldString, newString, replaceAll)` returns `FileOperationResult<EditedText>`, where the exported type `EditedText` is `{ text: string; replacements: number }` and `byteLength` is the original file's UTF-8 byte length. Keep `EditedText` local to this module; do not add `text` to `FileEditValue` in `src/file-write/types.ts` (`{ replacements: number }`), which is the value plan 6b returns.
- Matching is literal and non-overlapping, scanning left to right with `indexOf` advancing by `oldString.length`, never a regex, in a small private counting helper. An empty `oldString` cannot reach here (`src/file-write/command.ts` returns `undefined` for `oldString === ''`), but the function still refuses it defensively with `NO_MATCHING_TEXT_REASON` rather than looping.
- Zero matches return `NO_MATCHING_TEXT_REASON` (`'No matching text'`). More than one match without `replaceAll` returns `MULTIPLE_MATCHES_REASON` (`'Multiple matches'`); both are exported from `src/file-write/types.ts`, not `command.ts`. With `replaceAll`, every occurrence is replaced and zero is still refused. Empty text therefore has no match.
- Before building the result, compute its UTF-8 byte size as `byteLength` plus count times (`Buffer.byteLength(newString)` minus `Buffer.byteLength(oldString)`); refuse with `File too large (>5 MB)` when it exceeds `FILE_POLICY_MAX_BYTES` (exactly equal is accepted), without allocating the oversized string.
- Replacement uses split-and-join, so `$&`, `$1`, and similar markers in `newString` stay literal. An empty `newString` deletes the matched text. No line-ending normalization; untouched LF, CRLF, mixed endings, and a BOM survive as they are, and a match spanning a CRLF works only when `oldString` contains the CRLF.
- Check order inside `replaceExactText`: empty `oldString`, count matches, match-count rules, result size, build. `replacements` is always at least 1 on success.
- Build failures with `failureResult<T>(reason)` and successes as a literal `{ ok: true, value }`, as `encodeToolText` does at `src/file-write/filesystem.ts:8`. `'Not a text file'` and `'File too large (>5 MB)'` are `FilePolicyFailure` members in `src/file-read/policy.ts` with no named constants, so write the literals as `filesystem.ts` does.
- Keep the module well under 200 lines and each function under the cognitive-complexity limit.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-read/policy.ts` `FILE_POLICY_MAX_BYTES`, `FilePolicyFailure` (plan 1) | 5 MiB limit and policy words |
| `src/file-write/types.ts` `NO_MATCHING_TEXT_REASON`, `MULTIPLE_MATCHES_REASON` (plan 2a) | Match-failure words |
| `src/file-write/filesystem.ts` `encodeToolText` (plan 5) | Pattern to mirror for the NUL and well-formedness check; private, so mirror rather than import |
| `src/file-navigator/file-operation-result.ts` `failureResult`, `FileOperationResult` | Result shapes |

## Proposed changes

Create `src/file-write/edit-text.ts` exporting `checkEditReplacement`, `decodeEditableText`, `replaceExactText`, and the `EditedText` type, with a private match-counting helper. No existing production file changes.

## Tests

Add `src/file-write/edit-text.test.ts` (pure, no temporary directories):

- One match replaced; zero matches refused; two matches refused without `replaceAll`; two matches both replaced with `replaceAll`; zero matches with `replaceAll` refused; overlapping candidates (`aaa` searching `aa`) count non-overlapping occurrences; empty `oldString` refused with `No matching text`; empty text has no match.
- Empty `newString` deletes; `newString` containing `$&` and `$1` is kept literally.
- Untouched LF, CRLF, and mixed endings survive in the result; a match spanning a CRLF works only when `oldString` contains the CRLF.
- `decodeEditableText` keeps a leading BOM as part of the text; invalid UTF-8 bytes and decoded NUL are `Not a text file`.
- `checkEditReplacement` refuses `newString` containing NUL or a lone surrogate with `Not a text file` and accepts ordinary text.
- A replacement whose computed size exceeds 5 MiB refuses with `File too large (>5 MB)`; a result of exactly 5 MiB is accepted; the success value carries the correct `replacements` count.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. There is no caller until plan 6b, so `src/file-write/edit-text.test.ts` is the check.

## Out of scope

- Reading, stat checks, target resolution, and writing (plan 6b).
- Port, remote transport, and command wiring (plans 9 through 11).
- Regex or fuzzy matching, diffs, or returning content or hashes.
- Line-ending normalization.
