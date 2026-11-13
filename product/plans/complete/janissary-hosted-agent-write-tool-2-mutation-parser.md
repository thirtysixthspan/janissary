# Hosted write tool 2 — pure `file write` / `file edit` parser and primer

**Complexity: 6/10** — ~150 added lines in three new pure modules, 11 requirements, 32 parser/format scenarios (p=5.78).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 2 of 15 in the hosted write tool series. Depends on plan 1 (`./product/plans/complete/janissary-hosted-agent-write-tool-1-shared-file-policy.md`), which has landed: it reuses `FILE_POLICY_MAX_BYTES` from `src/file-read/policy.ts`. Plans 3, 5, 6, 7, 9, 11, and 12 import what this plan exports, so the export names below are fixed.

The write and edit commands take one JSON object each, so a path with spaces or multiline text fits on one command line. This plan adds the pure half: parsing, usage text, the agent primer, line recognition, the shared contract types, and the one-line result and failure formatting. Nothing here touches the filesystem, and nothing calls it yet; no existing file changes.

## Goal

A pure module that turns `file write <JSON>` and `file edit <JSON>` into a validated request or a usage error, recognizes those lines in an agent reply even when the JSON is invalid, and formats the outcome lines the later executors print.

## Design decisions and dependencies

- Source plan decision: the pure mutation parser, primer, and recognition predicates go in `src/file-write/command.ts`, and the shared port contract types in `src/file-write/types.ts`. The one-line output formatters and the path display helper go in `src/file-write/messages.ts` from the start (not as an overflow fallback), so `command.ts` stays well under the 200-line limit and plan 11 extends `messages.ts` with its own failure mapping. All three modules are pure (architecture principle 4): they return values or `{ error }` and perform no I/O. `command.ts` imports `FILE_POLICY_MAX_BYTES` from `../file-read/policy.js` (a constant; importing it performs no I/O) and the display helper from `./messages.js`; `messages.ts` imports from `./types.js` only; `types.ts` imports nothing from `src/file-navigator/` or any port implementation. All relative imports carry `.js`.
- Field names come from the backlog: write takes `path`, `content`, and optional `expectedHash`; edit takes `path`, `oldString`, `newString`, and optional `replaceAll`, defaulting to false. `path`, `content`, `oldString`, `newString`, and `expectedHash` must be strings and `replaceAll` must be a boolean.
- Argument extraction: after trimming the input, the command word `file` and the subcommand (`write` or `edit`, both case-insensitive) are followed by whitespace and the JSON argument, which is the whole remainder taken verbatim (not split on whitespace and rejoined, so runs of spaces inside JSON strings survive). The subcommand selects which field set and usage line apply. Input whose first two words are not `file write` or `file edit` returns `Usage: file write <JSON>` (the parser is only called on recognized lines, so this branch is defensive).
- Reject with the subcommand's usage line, before any effect: an empty argument (bare `file write`), malformed JSON, a non-object value (array, `null`, scalar — rejected by `isRecord`), a missing required field, a wrong field type, any key outside the subcommand's field set (checked over `Object.keys` of the parsed object, so `__proto__`, a misspelled `replaceall`, and an edit field on a write are all usage errors), an empty `path`, and an empty `oldString`. An empty `content`, an empty `newString`, and an empty `expectedHash` are valid; an empty hash is forwarded and simply fails the later hash comparison. Duplicate JSON keys follow `JSON.parse` (last wins); no custom JSON parser is added.
- The parser does not reject NUL characters or lone surrogates in `content` or `newString`; those are data rules owned by plans 5 and 6, which refuse them as `Not a text file`.
- Usage lines are exactly `Usage: file write <JSON>` and `Usage: file edit <JSON>`. `file read` keeps its own `FILE_READ_USAGE`; this plan does not change `src/file-read/command.ts`.
- The 5 MiB limit applies to the UTF-8 byte length of the extracted JSON argument text, measured with `Buffer.byteLength` and compared against `FILE_POLICY_MAX_BYTES` (exactly 5 MiB is allowed, one byte more is not). An oversized argument is still parsed and validated: if it is otherwise a valid request the parser returns `File too large (>5 MB): <path>.`, with the request's `path` passed through the display helper (the word matches `FilePolicyFailure`'s `'File too large (>5 MB)'`); if it is not a valid request it returns usage. Either way the parser returns `{ error }`, so nothing downstream runs. The separate limits on decoded file content and resulting files belong to plans 5 and 6.
- Recognition: `/^file\s+write(\s|$)/i` and `/^file\s+edit(\s|$)/i` on the line as given, exactly like `isFileReadCommandLine` in `src/file-read/command.ts`. A recognized line is a mutation command line whether or not its JSON is valid, so a malformed request reaches the parser and returns usage instead of being shown as the agent's final answer. `file write{…}` with no whitespace after the subcommand is not recognized (same as `file read` today). Callers that strip a leading `/` (plan 3) do so before calling.
- Types in `types.ts`, with these exported names: `FileWritePolicy` (the literal `'tool-text'`, named `policy` where it travels); `FileWriteRequest` (`kind: 'write'`, `path`, `content`, optional `expectedHash`); `FileEditRequest` (`kind: 'edit'`, `path`, `oldString`, `newString`, `replaceAll` always present as a boolean after defaulting); `FileMutationRequest`, the union of the two discriminated by `kind`; `FileEditValue`, the edit success value `{ replacements }` (a positive integer), used as `FileOperationResult<FileEditValue>` by plans 6, 9, and 10; and the two edit match-failure reason constants `NO_MATCHING_TEXT_REASON` (`'No matching text'`) and `MULTIPLE_MATCHES_REASON` (`'Multiple matches'`), which plan 6's helper returns as `{ ok: false, reason }` and which cross the remote protocol as plain strings. The reason words live in `types.ts`, not `command.ts`, so the filesystem helpers depend on the contract module rather than the parser.
- `command.ts` exports: `FILE_WRITE_USAGE`, `FILE_EDIT_USAGE`, `parseFileMutation(input)` returning `FileMutationRequest | { error: string }`, `FILE_MUTATION_PRIMER`, `isFileWriteCommandLine`, `isFileEditCommandLine`, and `isFileMutationCommandLine` (either). One primer covers both subcommands; plan 12 includes it whenever `file write` or `file edit` is granted.
- Primer content, joined with `\n` like `FILE_READ_PRIMER`: end the reply with one `file write {"path":…,"content":…}` or `file edit {"path":…,"oldString":…,"newString":…}` line; the JSON must stay on that one line, with newlines in strings written as `\n`; paths are relative to the workspace root; `expectedHash` is optional on write; writes create or overwrite the file and create missing parent folders; edits replace exact text that must match once unless `replaceAll` is true; files and arguments are limited to 5 MB.
- `messages.ts` exports, each taking the path as the caller typed it and escaping it itself so no caller can forget: `displayPath(path)`; `writeSuccessLine(path)` → `Wrote <path>.`; `editSuccessLine(path, replacements)` → `Edited <path> (<count> replacements).` with the actual count and the literal word `replacements` even for 1, as the source plan specifies; `matchFailureLine(reason, path)` → `No matching text: <path>.` for `NO_MATCHING_TEXT_REASON`, `Multiple matches: <path>; set replaceAll to true.` for `MULTIPLE_MATCHES_REASON`, and `undefined` for any other reason so plan 11 falls through to its own mapping. No formatter takes or prints file content.
- `displayPath` escaping: iterate code points (do not build a regex with literal control characters, which trips `no-control-regex` from `js.configs.recommended`; `web/src/shared/transcript/ansi.ts` shows the code-point approach the repo already uses). Render `\n`, `\r`, and `\t` as those two-character escapes; render every other code point in U+0000–U+001F, U+007F–U+009F, U+2028, and U+2029 as `\u` plus four lowercase hex digits; leave everything else, including backslash, unchanged. The result never contains a line break.
- Use `JSON.parse` inside a `try` with the existing `isRecord` guard from `src/value-guards.ts`, treating the parsed value as `unknown` before reading fields (keeps `no-unsafe-assignment`/`no-unsafe-member-access` clean).

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-read/command.ts` `parseFileRead`, `FILE_READ_USAGE`, `FILE_READ_PRIMER`, `isFileReadCommandLine` | Shape and wording to mirror for usage, `{ error }` return, primer, and the recognition regex |
| `src/file-read/policy.ts` `FILE_POLICY_MAX_BYTES`, `FilePolicyFailure` | The 5 MiB constant and the `File too large (>5 MB)` word |
| `src/value-guards.ts` `isRecord` | Object guard after `JSON.parse` |
| `src/file-navigator/file-operation-result.ts` `FileOperationResult` | The `{ ok, value } / { ok, reason }` shape `FileEditValue` and the match-failure reasons plug into |
| `src/file-read/tab-read.ts` `asTyped` | Precedent for answering with the path as typed; the formatters here take the typed path directly |

## Proposed changes

1. Create `src/file-write/types.ts` with the types and the two reason constants above.
2. Create `src/file-write/messages.ts` with `displayPath` and the three line formatters.
3. Create `src/file-write/command.ts` with the usage constants, `parseFileMutation`, `FILE_MUTATION_PRIMER`, and the three recognition predicates. Validate fields in small private helpers (one for the allowed-key check, one per field kind: required string, optional string, optional boolean) so `parseFileMutation` stays under the `sonarjs/cognitive-complexity` limit of 15.

Steps land in this order in one change; each module only imports the ones before it.

## Tests

Add `src/file-write/command.test.ts`:

- Valid write with and without `expectedHash`; valid edit with and without `replaceAll` (absent yields `replaceAll: false`); `FILE WRITE` uppercase; empty `content`; empty `newString`; empty `expectedHash`; a path with spaces and content with escaped newlines and runs of spaces, returned byte-for-byte.
- Usage for: bare `file write` and bare `file edit` (each with its own usage line), malformed JSON, an array, `null`, a string, a number, a missing `path`/`content`/`oldString`/`newString`, a numeric `path`, a string `replaceAll`, a numeric `expectedHash`, an unknown field, the misspelling `replaceall`, `replaceAll` on a write, an empty `path`, and an empty `oldString`.
- An argument whose UTF-8 byte length is exactly 5 MiB parses; one byte over returns `File too large (>5 MB): <path>.`; an oversized malformed argument returns usage. Multi-byte characters count by bytes, not code units (a string under 5 Mi code units but over 5 MiB in UTF-8 is too large).
- Recognition accepts `file write {not json`, `file edit`, and `FILE EDIT {}`; rejects `file read a.md`, `filewrite {}`, and `file write{}`; `isFileMutationCommandLine` accepts both subcommands. The primer mentions both command forms.

Add `src/file-write/messages.test.ts`:

- Exact success lines, including `Edited a.md (1 replacements).`; both match-failure lines; `undefined` for an unrelated reason; a path containing a newline, a tab, ESC, and U+2028 renders on one line with the stated escapes; a path with a backslash is unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. There is no manual end-to-end check for this plan because nothing calls the modules yet; plan 11 adds the first user-visible path.

## Out of scope

- Any filesystem effect, port change, or command wiring (plans 4 through 13), including `src/commands/file.ts` routing and `src/acp/tool-table.ts` recognition.
- Changing `file read` parsing, usage, or primer.
- Tab completion and `samples` for the new subcommands (plan 11 adds samples).
- The non-match failure message mapping (plan 11).
