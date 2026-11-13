# Hosted write tool 2c2 — `file edit` fields, strict key sets, and the 5 MiB argument limit

**Complexity: 5/10** — ~40 added lines in one existing module (`src/file-write/command.ts`), 9 requirements, 22 edit, key-set, and size scenarios (p=5.50).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Decomposed from piece 2c (`./product/plans/complete/janissary-hosted-agent-write-tool-2c-mutation-parser.md`, itself from subplan 2 `./product/plans/complete/janissary-hosted-agent-write-tool-2-mutation-parser.md`); this is part 2c2 of 2 (2c1, then 2c2), run order 2 of 15 in the hosted write tool series. Depends on plan 2c1 (`./product/plans/draft/janissary-hosted-agent-write-tool-2c1-write-parser.md`), which added `FILE_WRITE_USAGE`, `FILE_EDIT_USAGE`, `parseFileMutation`, and the private extraction and string-field helpers to `src/file-write/command.ts`; on plan 1 (`./product/plans/complete/janissary-hosted-agent-write-tool-1-shared-file-policy.md`, landed) for `FILE_POLICY_MAX_BYTES` in `src/file-read/policy.ts`; and on plan 2a (`./product/plans/complete/janissary-hosted-agent-write-tool-2a-contract-and-messages.md`, landed) for `FileEditRequest` in `src/file-write/types.ts` and `displayPath` in `src/file-write/messages.ts`. Plan 11 imports what 2c1 exports; this piece adds no exports.

This piece completes the pure mutation parser: it replaces 2c1's interim edit branch with real edit field validation, rejects keys outside each subcommand's field set, and adds the 5 MiB limit on the JSON argument. Nothing here touches the filesystem, and nothing calls the parser yet; no existing file changes outside `src/file-write/command.ts`.

## Goal

`parseFileMutation` turns `file edit <JSON>` into a validated `FileEditRequest` or the edit usage line, rejects unknown keys on both subcommands, and turns any oversized argument into the `File too large (>5 MB): <path>.` error or usage, before any effect.

## Design decisions and dependencies

- Source plan decision: the pure mutation parser stays in `src/file-write/command.ts` and stays pure (architecture principle 4). This piece adds imports of `FILE_POLICY_MAX_BYTES` from `../file-read/policy.js` (a constant; importing it performs no I/O), `FileEditRequest` from `./types.js` if 2c1 did not already import it, and `displayPath` from `./messages.js`. All relative imports carry `.js`.
- Edit fields come from the backlog: `path`, `oldString`, `newString`, and optional `replaceAll`, defaulting to false. `path`, `oldString`, and `newString` must be strings and `replaceAll` must be a boolean. The parser returns plan 2a's `FileEditRequest` (`kind: 'edit'`, `replaceAll` always present as a boolean).
- Reject with `Usage: file edit <JSON>`: a missing required field, a wrong field type, an empty `path`, and an empty `oldString`. An empty `newString` is valid.
- Strict key sets, for both subcommands: reject with the subcommand's usage line any key outside its field set (write: `path`, `content`, `expectedHash`; edit: `path`, `oldString`, `newString`, `replaceAll`), checked over `Object.keys` of the parsed object, so `__proto__` written in the JSON text (an own key after `JSON.parse`), an unknown field, a misspelled `replaceall`, an edit field such as `replaceAll` on a write, and a write field such as `content` on an edit are all usage errors. This replaces 2c1's interim leniency toward extra keys. Duplicate JSON keys still follow `JSON.parse` (last wins).
- The parser does not reject NUL characters or lone surrogates in `newString`; those are data rules owned by plans 5 and 6, which refuse them as `Not a text file`.
- Add one private allowed-key check taking the subcommand's field set, one private optional-boolean reader beside 2c1's string readers, and an edit request builder that reuses 2c1's required-string reader; apply the allowed-key check in both the write and the edit builder. Keep `parseFileMutation` under the `sonarjs/cognitive-complexity` limit of 15.
- The 5 MiB limit applies to the UTF-8 byte length of the extracted JSON argument text (2c1's verbatim remainder), measured with `Buffer.byteLength` and compared against `FILE_POLICY_MAX_BYTES` (exactly 5 MiB is allowed, one byte more is not). An oversized argument is still parsed and validated: if it is otherwise a valid request (write or edit) the parser returns `File too large (>5 MB): <path>.`, with the request's `path` passed through plan 2a's `displayPath` (the phrase matches the `FilePolicyFailure` member `'File too large (>5 MB)'` in `src/file-read/policy.ts`; reuse that exact spelling); if it is not a valid request it returns the subcommand's usage. Either way the parser returns `{ error }`, so nothing downstream runs. The separate limits on decoded file content and resulting files belong to plans 5 and 6.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-write/command.ts` (plans 2b, 2c1) `parseFileMutation` and its private extraction and string-field helpers | The parser this piece completes |
| `src/file-read/policy.ts` `FILE_POLICY_MAX_BYTES`, `FilePolicyFailure` | The 5 MiB constant and the `File too large (>5 MB)` word |
| `src/file-write/types.ts` (plan 2a) `FileEditRequest` | The edit return shape |
| `src/file-write/messages.ts` (plan 2a) `displayPath` | Escapes the path in the too-large error |

## Proposed changes

1. In `src/file-write/command.ts`, add the allowed-key check (used by the write and edit builders), the optional-boolean reader, and the edit request builder, route the edit subcommand to it in place of 2c1's interim usage return, and add the byte-length check on the extracted argument after validation, producing the too-large error for a valid oversized request.

## Tests

Add to the `parseFileMutation` tests from plan 2c1 (in `src/file-write/command.test.ts`, or `src/file-write/command-parse.test.ts` if 2c1 put them there). If `command.test.ts` would pass 200 lines, move the whole `parseFileMutation` block to a new colocated `src/file-write/command-parse.test.ts` instead of compacting. Replace 2c1's interim "well-formed edit returns usage" case:

- Valid edit with and without `replaceAll` (absent yields `replaceAll: false`; `true` is kept); `FILE EDIT` uppercase; empty `newString`.
- Usage for: an unknown field on a write, `replaceAll` on a write, a `__proto__` key in the JSON text, a missing `path`, `oldString`, and `newString` on an edit, a string `replaceAll`, the misspelling `replaceall`, `content` on an edit, an empty `path` on an edit, and an empty `oldString`.
- An argument whose UTF-8 byte length is exactly 5 MiB parses; one byte over returns `File too large (>5 MB): <path>.` (for a write and for an edit); an oversized malformed argument returns usage. Multi-byte characters count by bytes, not code units (a string under 5 Mi code units but over 5 MiB in UTF-8 is too large). A path needing escaping appears through `displayPath` in the too-large error.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. There is no manual end-to-end check for this piece because nothing calls the parser yet; plan 11 adds the first user-visible path.

## Out of scope

- Argument extraction, usage constants, the shared JSON/object checks, and write field type validation (plan 2c1).
- The contract types, path escaping, and outcome line formatters (plan 2a).
- The primer and recognition predicates (plan 2b).
- Any filesystem effect, port change, or command wiring (plans 4 through 13), including `src/commands/file.ts` routing and `src/acp/tool-table.ts` recognition.
- Changing `file read` parsing, usage, or primer.
- Tab completion and `samples` for the new subcommands (plan 11 adds samples).
- The non-match failure message mapping (plan 11).
