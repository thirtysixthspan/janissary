# Hosted write tool 2b — mutation line recognition and agent primer

**Complexity: 3/10** — ~20 added lines in one new pure module, 5 requirements, 8 recognition and primer scenarios (p=4.35).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Decomposed from subplan 2 (`./product/plans/complete/janissary-hosted-agent-write-tool-2-mutation-parser.md`); this is piece 2b of 3 (2a, 2b, then 2c), run order 2 of 15 in the hosted write tool series. Depends on plan 2a (`./product/plans/complete/janissary-hosted-agent-write-tool-2a-contract-and-messages.md`, already implemented as `src/file-write/types.ts` and `src/file-write/messages.ts`) only by series order: this piece imports nothing from it or from plan 1. Plan 2c extends the module this piece creates, plan 3 imports the mutation predicate, and plan 12 imports the predicates and the primer, so the export names below are fixed.

The write and edit commands take one JSON object each, so a path with spaces or multiline text fits on one command line. Before anything can run them, an agent reply's last line has to be recognized as a mutation request, and the agent has to be told the command forms. This piece adds both. Nothing here touches the filesystem, and nothing calls it yet; no existing file changes.

## Goal

`src/file-write/command.ts` exists with the three recognition predicates and the one shared agent primer for `file write` and `file edit`, recognizing those lines even when their JSON is invalid.

## Design decisions and dependencies

- Source plan decision: the pure mutation parser, primer, and recognition predicates go in `src/file-write/command.ts`. This piece creates the module with the primer and predicates; plan 2c adds the usage constants and the parser to the same module. It is pure (architecture principle 4) and performs no I/O. All relative imports carry `.js`.
- Recognition: `/^file\s+write(\s|$)/i` and `/^file\s+edit(\s|$)/i` on the line as given, exactly like `isFileReadCommandLine` in `src/file-read/command.ts`. A recognized line is a mutation command line whether or not its JSON is valid, so a malformed request reaches the parser (plan 2c) and returns usage instead of being shown as the agent's final answer. `file write{…}` with no whitespace after the subcommand is not recognized (same as `file read` today). Callers that strip a leading `/` (plan 3) do so before calling.
- Exports from this piece: `FILE_MUTATION_PRIMER`, `isFileWriteCommandLine`, `isFileEditCommandLine`, and `isFileMutationCommandLine` (either). Together with plan 2c's `FILE_WRITE_USAGE`, `FILE_EDIT_USAGE`, and `parseFileMutation`, these are the full `command.ts` export list fixed by the subplan. One primer covers both subcommands; plan 12 includes it whenever `file write` or `file edit` is granted.
- Primer content, joined with `\n` like `FILE_READ_PRIMER`: end the reply with one `file write {"path":…,"content":…}` or `file edit {"path":…,"oldString":…,"newString":…}` line; the JSON must stay on that one line, with newlines in strings written as `\n`; paths are relative to the workspace root; `expectedHash` is optional on write; writes create or overwrite the file and create missing parent folders; edits replace exact text that must match once unless `replaceAll` is true; files and arguments are limited to 5 MB. The primer is a plain string array with the `5 MB` wording written inline, the way `FILE_READ_PRIMER` writes `2000` inline; do not import `FILE_POLICY_MAX_BYTES` from `src/file-read/policy.ts` just for the text. The primer names no usage constant, so it does not depend on plan 2c.
- `file read` keeps its own `FILE_READ_PRIMER` and `isFileReadCommandLine`; this piece does not change `src/file-read/command.ts`.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-read/command.ts` `FILE_READ_PRIMER`, `isFileReadCommandLine` | Wording, `\n` joining, and the recognition regex shape to mirror |

## Proposed changes

1. Create `src/file-write/command.ts` with `FILE_MUTATION_PRIMER` and the three recognition predicates. `isFileMutationCommandLine` returns true when either subcommand predicate does.

## Tests

Add `src/file-write/command.test.ts` (plan 2c adds the parser cases to the same file):

- Recognition accepts `file write {not json`, `file edit`, and `FILE EDIT {}`; rejects `file read a.md`, `filewrite {}`, and `file write{}`, and `/file write {}` (slash stripping is the caller's job); `isFileMutationCommandLine` accepts both subcommands. The primer contains both `file write {` and `file edit {` and mentions `replaceAll` and `expectedHash`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. There is no manual end-to-end check for this piece because nothing calls the module yet; plan 12 adds the first agent-visible path.

## Out of scope

- The contract types, path escaping, and outcome line formatters (plan 2a).
- The usage constants and `parseFileMutation` (plan 2c).
- Any filesystem effect, port change, or command wiring (plans 4 through 13), including `src/commands/file.ts` routing and `src/acp/tool-table.ts` recognition.
- Changing `file read` parsing, usage, or primer.
