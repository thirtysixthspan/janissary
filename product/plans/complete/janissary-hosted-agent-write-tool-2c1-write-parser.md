# Hosted write tool 2c1 — `file write` parser: extraction, usage, JSON checks, write fields

**Complexity: 5/10** — ~52 added lines in one existing module (`src/file-write/command.ts`), 10 requirements, 25 parser scenarios (p=5.69).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Decomposed from piece 2c (`./product/plans/complete/janissary-hosted-agent-write-tool-2c-mutation-parser.md`, itself from subplan 2 `./product/plans/complete/janissary-hosted-agent-write-tool-2-mutation-parser.md`); this is part 2c1 of 2 (2c1, then 2c2), run order 2 of 15 in the hosted write tool series. Depends on plan 2a (`./product/plans/complete/janissary-hosted-agent-write-tool-2a-contract-and-messages.md`, landed) for the request types in `src/file-write/types.ts`, and on plan 2b (`./product/plans/complete/janissary-hosted-agent-write-tool-2b-recognition-and-primer.md`, landed), which created `src/file-write/command.ts` (20 lines: `FILE_MUTATION_PRIMER`, `isFileWriteCommandLine`, `isFileEditCommandLine`, `isFileMutationCommandLine`) and `src/file-write/command.test.ts` (38 lines). Plan 2c2 (`./product/plans/draft/janissary-hosted-agent-write-tool-2c2-edit-fields-key-sets-and-size-limit.md`) finishes the parser (edit fields, the strict key-set check, and the 5 MiB argument limit); plan 11 imports what this piece exports (2c2 adds none), so the export names below are fixed. Plans 2a and 2b are already on branch `feat/acp-host-file-write`, so this piece can land immediately.

The write and edit commands take one JSON object each, so a path with spaces or multiline text fits on one command line. This piece adds the usage text and the first half of the pure parser: it extracts the JSON argument, rejects empty, malformed, and non-object arguments for both subcommands, and validates the `file write` fields. `file edit` lines pass the shared checks and then return the edit usage line until plan 2c2 adds edit field validation. Nothing here touches the filesystem, and nothing calls the parser yet; no existing file changes outside the module plan 2b created.

## Goal

`parseFileMutation` turns `file write <JSON>` into a validated `FileWriteRequest`, or into the subcommand's usage line, before any effect; every `file edit` line returns `Usage: file edit <JSON>` for now.

## Design decisions and dependencies

- Source plan decision: the pure mutation parser goes in `src/file-write/command.ts`, beside plan 2b's primer and predicates. It is pure (architecture principle 4): it returns values or `{ error }` and performs no I/O. This piece adds imports of the request types from `./types.js` and `isRecord` from `../value-guards.js`. All relative imports carry `.js`. (`FILE_POLICY_MAX_BYTES` and `displayPath` are imported by plan 2c2, which uses them.)
- Exports added by this piece: `FILE_WRITE_USAGE`, `FILE_EDIT_USAGE`, and `parseFileMutation(input)` returning `FileMutationRequest | { error: string }`. Plan 2c2 adds no further exports. Validation helpers stay private to the module.
- Usage lines are exactly `Usage: file write <JSON>` and `Usage: file edit <JSON>`. `file read` keeps its own `FILE_READ_USAGE`; this piece does not change `src/file-read/command.ts`.
- Argument extraction: after trimming the input, the command word `file` and the subcommand (`write` or `edit`, both case-insensitive) are followed by whitespace and the JSON argument, which is the whole remainder after the whitespace separating it from the subcommand, taken verbatim (not split on whitespace and rejoined, so runs of spaces inside JSON strings survive). Decision: locate the prefix with an anchored, non-nested pattern of the same shape as `isFileWriteCommandLine` in `src/file-write/command.ts` (`/^file\s+write(\s|$)/i`), capturing the subcommand, slice the remainder by the match length, then drop its leading whitespace; no pattern with nested quantifiers (`security/detect-unsafe-regex`). The subcommand must be followed by whitespace or end of input, exactly as the predicates require, so `file writer {}` and `file write{}` (no separator) are not writes and returns `Usage: file write <JSON>`. Keep the extracted remainder available to the main function, because plan 2c2 measures the 5 MiB byte limit on exactly this text. A remainder that is empty after trimming (bare `file write`, or `file write` plus spaces) is the empty-argument case. The subcommand selects which field set and usage line apply. Input whose first two words are not `file write` or `file edit` returns `Usage: file write <JSON>` (the parser is only called on lines plan 2b's predicates recognize, so this branch is defensive).
- Shared rejections, applied to both subcommands with that subcommand's usage line, before any effect: an empty argument, malformed JSON, and a non-object value (array, `null`, scalar — rejected by `isRecord`). Use `JSON.parse` inside a `try` with the existing `isRecord` guard from `src/value-guards.ts`, treating the parsed value as `unknown` before reading fields (keeps `no-unsafe-assignment`/`no-unsafe-member-access` clean). Duplicate JSON keys follow `JSON.parse` (last wins); no custom JSON parser is added.
- Interim edit behavior: after the shared checks pass, an edit argument returns `Usage: file edit <JSON>`. Plan 2c2 replaces this branch with edit field validation. Nothing calls the parser before plan 11, so the interim state is never user-visible.
- Write fields come from the backlog: `path`, `content`, and optional `expectedHash`, all strings. The parser returns plan 2a's `FileWriteRequest` (`kind: 'write'`), with `expectedHash` present only when given. Reject with `Usage: file write <JSON>`: a missing required field, a wrong field type, and an empty `path`. An empty `content` and an empty `expectedHash` are valid; an empty hash is forwarded and simply fails the later hash comparison.
- Interim key handling: this piece reads only the write fields and does not yet reject extra keys; plan 2c2 adds the check that rejects any key outside the subcommand's field set (`__proto__`, unknown fields, `replaceAll` on a write). Nothing calls the parser before plan 11, so the interim leniency is never user-visible.
- The parser does not reject NUL characters or lone surrogates in `content`; those are data rules owned by plans 5 and 6, which refuse them as `Not a text file`.
- Write the private field helpers so plan 2c2 can reuse them for edit: one required-string reader and one optional-string reader. Contract: each takes the parsed record and a key; the required reader yields the value only when it is a string (missing or non-string is a failure); the optional reader yields absent when the key is not an own property and fails when it is present but not a string. Neither reader rejects empty strings; the empty-`path` rejection lives in the write request builder, because plan 2c2 applies its own emptiness rules to edit fields. Keep `parseFileMutation` under the `sonarjs/cognitive-complexity` limit of 15 by delegating extraction, JSON parsing, and per-subcommand request building to these helpers.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-read/command.ts` `parseFileRead`, `FILE_READ_USAGE` | Shape and wording to mirror for usage and the `{ error }` return |
| `src/value-guards.ts` `isRecord` | Object guard after `JSON.parse` |
| `src/file-write/types.ts` (plan 2a) `FileWriteRequest`, `FileMutationRequest` | The parser's return shapes |
| `src/file-write/command.ts` (plan 2b) | The module this piece extends; its predicates define which lines reach the parser and its regex shape is the one to mirror |

## Proposed changes

1. Extend `src/file-write/command.ts` with `FILE_WRITE_USAGE`, `FILE_EDIT_USAGE`, `parseFileMutation`, and the private helpers: argument extraction (subcommand plus verbatim remainder), JSON-object parsing, the required-string and optional-string readers, and the write request builder. The module stays well under the 200-line limit.

## Tests

Extend the existing `src/file-write/command.test.ts` with a new `describe('parseFileMutation', ...)` block importing the new exports from `./command.js`. If the file would pass 200 lines, put the parser cases in a new colocated `src/file-write/command-parse.test.ts` instead of compacting:

- Valid write with and without `expectedHash` (absent stays absent); `FILE WRITE` uppercase; leading/trailing whitespace on the line and extra spaces between `file`, the subcommand, and the JSON; empty `content`; empty `expectedHash`; a path with spaces and content with escaped newlines and runs of spaces, returned byte-for-byte.
- Usage for: bare `file write` and bare `file edit` (each with its own usage line), `file write` plus only spaces, malformed JSON, an array, `null`, a string, a number, a missing `path`, a missing `content`, a numeric `path`, a numeric `expectedHash`, `file writer {...}` and `file write{...}` (no separator), an empty `path`, and input whose first words are not `file write`/`file edit`.
- Interim: a well-formed edit object returns `Usage: file edit <JSON>` (plan 2c2 replaces this case with real edit results); malformed JSON on `file edit` returns the edit usage line.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. There is no manual end-to-end check for this piece because nothing calls the parser yet; plan 11 adds the first user-visible path.

## Out of scope

- Edit field validation (`oldString`, `newString`, `replaceAll`), rejecting keys outside the subcommand's field set, and the 5 MiB argument limit with its `File too large (>5 MB)` error (plan 2c2).
- The contract types, path escaping, and outcome line formatters (plan 2a).
- The primer and recognition predicates (plan 2b).
- Any filesystem effect, port change, or command wiring (plans 4 through 13), including `src/commands/file.ts` routing and `src/acp/tool-table.ts` recognition.
- Changing `file read` parsing, usage, or primer.
- Tab completion and `samples` for the new subcommands (plan 11 adds samples).
- The non-match failure message mapping (plan 11).
