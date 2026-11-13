# Stop advertising expectedHash in the agent mutation primer
**Complexity: 1/10** — ~1 changed line, 1 file, 2 requirements, 1 scenario (p=3.06)

## Goal

Remove the `"expectedHash" is optional on write` clause from `FILE_MUTATION_PRIMER`, because an agent cannot obtain the editor's private content fingerprint the value must match, and a guessed value produces a misleading changed-on-disk refusal.

## Approach

Edit the primer's fifth line in `src/file-write/command.ts` to keep only the sentence about creating or overwriting files and creating missing parent folders. Leave `parseFileMutation` and `WRITE_KEYS` unchanged, so typed and programmatic `file write` callers can still send `expectedHash`.

## Implementation steps

1. In `src/file-write/command.ts`, change the primer line to `A write creates or overwrites the file and creates missing parent folders.`

## Tests

- `src/file-write/command.test.ts`: assert the primer no longer contains `expectedHash`, still has six lines, and still mentions creating missing parent folders.
- `src/acp/tool-table.test.ts` compares against the constant and passes unchanged.

## Spec and help

- `product/specs/acp.md`: state that the mutation primer does not mention `expectedHash`, which stays available to typed writes. `help/file.md` describes the typed command only and stays unchanged.

## Out of scope

- Exposing content hashes in `file read` output.
- Removing `expectedHash` from the parser or the typed command.
