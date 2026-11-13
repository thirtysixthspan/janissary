# Hosted write tool 2c — pure `file write` / `file edit` parser

**Complexity: 5/10** — ~90 added lines extending one new pure module, 11 requirements, 33 parser scenarios (p=5.66).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Decomposed from subplan 2 (`./product/plans/complete/janissary-hosted-agent-write-tool-2-mutation-parser.md`); this is piece 2c of 3 (2a, 2b, then 2c), run order 2 of 15 in the hosted write tool series. Depends on plan 1 (`./product/plans/complete/janissary-hosted-agent-write-tool-1-shared-file-policy.md`, landed) for `FILE_POLICY_MAX_BYTES` in `src/file-read/policy.ts`; on plan 2a (`./product/plans/draft/janissary-hosted-agent-write-tool-2a-contract-and-messages.md`) for the request types in `src/file-write/types.ts` and `displayPath` in `src/file-write/messages.ts`; and on plan 2b (`./product/plans/draft/janissary-hosted-agent-write-tool-2b-recognition-and-primer.md`), which creates `src/file-write/command.ts` and its test file. Plan 11 imports what this piece exports, so the export names below are fixed.

The write and edit commands take one JSON object each, so a path with spaces or multiline text fits on one command line. This piece adds the pure parsing half: the usage text and the parser that turns a recognized line into a validated request or a `{ error }`. Nothing here touches the filesystem, and nothing calls it yet; no existing file changes outside the module plan 2b created.

## Goal

`parseFileMutation` turns `file write <JSON>` and `file edit <JSON>` into a validated `FileWriteRequest` or `FileEditRequest`, or into the subcommand's usage line or the oversized-argument error, before any effect.

## Design decisions and dependencies

- Source plan decision: the pure mutation parser goes in `src/file-write/command.ts`, beside plan 2b's primer and predicates. It is pure (architecture principle 4): it returns values or `{ error }` and performs no I/O. `command.ts` imports `FILE_POLICY_MAX_BYTES` from `../file-read/policy.js` (a constant; importing it performs no I/O), the request types from `./types.js`, and the display helper from `./messages.js`. All relative imports carry `.js`.
- Exports added by this piece: `FILE_WRITE_USAGE`, `FILE_EDIT_USAGE`, and `parseFileMutation(input)` returning `FileMutationRequest | { error: string }`.
- Field names come from the backlog: write takes `path`, `content`, and optional `expectedHash`; edit takes `path`, `oldString`, `newString`, and optional `replaceAll`, defaulting to false. `path`, `content`, `oldString`, `newString`, and `expectedHash` must be strings and `replaceAll` must be a boolean. The parser returns plan 2a's `FileWriteRequest` (`kind: 'write'`) or `FileEditRequest` (`kind: 'edit'`, `replaceAll` always present as a boolean).
- Argument extraction: after trimming the input, the command word `file` and the subcommand (`write` or `edit`, both case-insensitive) are followed by whitespace and the JSON argument, which is the whole remainder taken verbatim (not split on whitespace and rejoined, so runs of spaces inside JSON strings survive). The subcommand selects which field set and usage line apply. Input whose first two words are not `file write` or `file edit` returns `Usage: file write <JSON>` (the parser is only called on lines plan 2b's predicates recognize, so this branch is defensive).
- Reject with the subcommand's usage line, before any effect: an empty argument (bare `file write`), malformed JSON, a non-object value (array, `null`, scalar — rejected by `isRecord`), a missing required field, a wrong field type, any key outside the subcommand's field set (checked over `Object.keys` of the parsed object, so `__proto__`, a misspelled `replaceall`, and an edit field on a write are all usage errors), an empty `path`, and an empty `oldString`. An empty `content`, an empty `newString`, and an empty `expectedHash` are valid; an empty hash is forwarded and simply fails the later hash comparison. Duplicate JSON keys follow `JSON.parse` (last wins); no custom JSON parser is added.
- The parser does not reject NUL characters or lone surrogates in `content` or `newString`; those are data rules owned by plans 5 and 6, which refuse them as `Not a text file`.
- Usage lines are exactly `Usage: file write <JSON>` and `Usage: file edit <JSON>`. `file read` keeps its own `FILE_READ_USAGE`; this piece does not change `src/file-read/command.ts`.
- The 5 MiB limit applies to the UTF-8 byte length of the extracted JSON argument text, measured with `Buffer.byteLength` and compared against `FILE_POLICY_MAX_BYTES` (exactly 5 MiB is allowed, one byte more is not). An oversized argument is still parsed and validated: if it is otherwise a valid request the parser returns `File too large (>5 MB): <path>.`, with the request's `path` passed through plan 2a's `displayPath` (the word matches `FilePolicyFailure`'s `'File too large (>5 MB)'`); if it is not a valid request it returns usage. Either way the parser returns `{ error }`, so nothing downstream runs. The separate limits on decoded file content and resulting files belong to plans 5 and 6.
- Use `JSON.parse` inside a `try` with the existing `isRecord` guard from `src/value-guards.ts`, treating the parsed value as `unknown` before reading fields (keeps `no-unsafe-assignment`/`no-unsafe-member-access` clean).

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-read/command.ts` `parseFileRead`, `FILE_READ_USAGE` | Shape and wording to mirror for usage and the `{ error }` return |
| `src/file-read/policy.ts` `FILE_POLICY_MAX_BYTES`, `FilePolicyFailure` | The 5 MiB constant and the `File too large (>5 MB)` word |
| `src/value-guards.ts` `isRecord` | Object guard after `JSON.parse` |
| `src/file-write/types.ts` (plan 2a) `FileWriteRequest`, `FileEditRequest`, `FileMutationRequest` | The parser's return shapes |
| `src/file-write/messages.ts` (plan 2a) `displayPath` | Escapes the path in the too-large error |
| `src/file-write/command.ts` (plan 2b) | The module this piece extends; its predicates define which lines reach the parser |

## Proposed changes

1. Extend `src/file-write/command.ts` with the usage constants and `parseFileMutation`. Validate fields in small private helpers (one for the allowed-key check, one per field kind: required string, optional string, optional boolean) so `parseFileMutation` stays under the `sonarjs/cognitive-complexity` limit of 15. The module stays well under the 200-line limit because the formatters live in plan 2a's `messages.ts`.

## Tests

Extend `src/file-write/command.test.ts`:

- Valid write with and without `expectedHash`; valid edit with and without `replaceAll` (absent yields `replaceAll: false`); `FILE WRITE` uppercase; empty `content`; empty `newString`; empty `expectedHash`; a path with spaces and content with escaped newlines and runs of spaces, returned byte-for-byte.
- Usage for: bare `file write` and bare `file edit` (each with its own usage line), malformed JSON, an array, `null`, a string, a number, a missing `path`/`content`/`oldString`/`newString`, a numeric `path`, a string `replaceAll`, a numeric `expectedHash`, an unknown field, the misspelling `replaceall`, `replaceAll` on a write, an empty `path`, and an empty `oldString`.
- An argument whose UTF-8 byte length is exactly 5 MiB parses; one byte over returns `File too large (>5 MB): <path>.`; an oversized malformed argument returns usage. Multi-byte characters count by bytes, not code units (a string under 5 Mi code units but over 5 MiB in UTF-8 is too large).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. There is no manual end-to-end check for this piece because nothing calls the parser yet; plan 11 adds the first user-visible path.

## Out of scope

- The contract types, path escaping, and outcome line formatters (plan 2a).
- The primer and recognition predicates (plan 2b).
- Any filesystem effect, port change, or command wiring (plans 4 through 13), including `src/commands/file.ts` routing and `src/acp/tool-table.ts` recognition.
- Changing `file read` parsing, usage, or primer.
- Tab completion and `samples` for the new subcommands (plan 11 adds samples).
- The non-match failure message mapping (plan 11).
