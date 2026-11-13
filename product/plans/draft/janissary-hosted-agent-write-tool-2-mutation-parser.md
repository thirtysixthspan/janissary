# Hosted write tool 2 — pure `file write` / `file edit` parser and primer

**Complexity: 5/10** — ~120 added lines in two new pure modules, 9 requirements, 22 parser/format scenarios (p=5.47).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 2 of 15 in the hosted write tool series. Depends on no earlier subplan; it can land in parallel with plan 1.

The write and edit commands take one JSON object each, so a path with spaces or multiline text fits on one command line. This plan adds the pure half: parsing, usage text, the agent primer, line recognition, the shared contract types, and the one-line result and failure formatting. Nothing here touches the filesystem, and nothing calls it yet.

## Goal

A pure module that turns `file write <JSON>` and `file edit <JSON>` into a validated request or a usage error, recognizes those lines in an agent reply even when the JSON is invalid, and formats the outcome lines the later executors print.

## Design decisions and dependencies

- Source plan decision: put the pure mutation parser, primer, and recognition predicates in `src/file-write/command.ts`, and the shared port contract types in `src/file-write/types.ts`. Parsing stays pure (architecture principle 4): it returns a value or `{ error }` and performs no I/O.
- Field names come from the backlog: write takes `path`, `content`, and optional `expectedHash`; edit takes `path`, `oldString`, `newString`, and optional `replaceAll`, defaulting to false. Paths and text must be strings and `replaceAll` must be a boolean.
- Reject with usage text, before any effect: malformed JSON, a non-object value (array, null, scalar), a missing required field, a wrong field type, any unknown field (so a misspelled `replaceAll` is never silently ignored), and an empty `oldString`. An empty `content` and an empty `newString` are valid.
- Usage lines are exactly `Usage: file write <JSON>` and `Usage: file edit <JSON>`. `file read` keeps its own `FILE_READ_USAGE`; this module does not change `parseFileRead`.
- The 5 MiB limit applies to the UTF-8 byte length of the JSON argument text, measured with `Buffer.byteLength`. An oversized argument that is otherwise a valid request returns `File too large (>5 MB): <path>.` (reusing the read vocabulary, with the caller's path); an oversized argument that is not a valid request returns usage. Either way the parser returns an error, so nothing downstream runs. The separate limits on decoded file content and resulting files belong to plans 5 and 6.
- Recognition: a line starting with `file write` or `file edit` (case-insensitive, matching how `isFileReadCommandLine` works) is a mutation command line whether or not its JSON is valid, so a malformed request reaches the parser and returns usage instead of being shown as the agent's final answer.
- Types in `types.ts`: the tool-write policy literal `'tool-text'` (named `policy` where it travels), the parsed write and edit request shapes, and the edit success value carrying a positive integer `replacements`. Plans 5 through 10 import these for the helpers and the port contract; `types.ts` must not import any port implementation.
- Output formatting lives here because it is pure: success is `Wrote <path>.` or `Edited <path> (<count> replacements).` using the caller's root-relative spelling and the actual count; edit match failures are `No matching text: <path>.` and `Multiple matches: <path>; set replaceAll to true.`. A path display helper escapes control characters so every message stays on one line. No formatter ever includes file content.
- Use `JSON.parse` with the existing `isRecord` guard from `src/value-guards.ts`, validating the parsed value as `unknown` before reading fields.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-read/command.ts` `parseFileRead`, `FILE_READ_PRIMER`, `isFileReadCommandLine` | Shape and wording to mirror for usage, primer, and recognition |
| `src/value-guards.ts` `isRecord` | Object guard after `JSON.parse` |
| `src/file-read/tab-read.ts` `asTyped` | Precedent for answering with the path as typed |

## Proposed changes

Create `src/file-write/types.ts` with the policy literal, request types, and edit result value type.

Create `src/file-write/command.ts` with: the two usage constants; a parser that accepts the full `file write …` / `file edit …` input and returns the typed request or `{ error }`; a mutation primer telling the agent to end its reply with one `file write {"path":…,"content":…}` or `file edit {"path":…,"oldString":…,"newString":…}` line, that paths are relative to the workspace root, that JSON strings escape newlines, that edits match exact text once unless `replaceAll` is true, and that writes create missing parent folders; a recognition predicate for each subcommand plus one for either; the success and match-failure formatters; and the control-character escaping helper. Keep the module under 200 lines; if the formatters push it over, move them into `src/file-write/messages.ts`.

## Tests

Add `src/file-write/command.test.ts`:

- Valid write with and without `expectedHash`; valid edit with and without `replaceAll`; empty `content`; empty `newString`; paths with spaces and multiline escaped content.
- Usage for: bare `file write`, malformed JSON, an array, `null`, a string, a missing `path`/`content`/`oldString`/`newString`, a numeric `path`, a string `replaceAll`, an unknown field, the misspelling `replaceall`, and an empty `oldString`.
- An argument whose UTF-8 byte length is exactly 5 MiB parses; one byte over returns `File too large (>5 MB): <path>.`, and an oversized malformed argument returns usage. Multi-byte characters count by bytes, not code units.
- Recognition accepts `file write {not json` and `FILE EDIT {}` and rejects `file read a.md` and `filewrite {}`.
- Formatters: exact success lines, `1 replacements` wording kept literally as the source plan specifies, both match-failure lines, and a path containing a newline and a tab rendered on one line.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Any filesystem effect, port change, or command wiring (plans 4 through 13).
- Changing `file read` parsing or usage.
- Tab completion for the new subcommands.
