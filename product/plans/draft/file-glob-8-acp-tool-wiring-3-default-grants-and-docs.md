# File glob 8.3 — grant `file glob` to the built-in `ask` and `tell` roles

**Complexity: 2/10** — ~2 added lines in 1 file, 3 requirements, 5 test scenarios (p=3.75)

Run order: piece 3 of 3 of file glob subplan 8, which is 8 of 9 in the file glob series. Subplan 8 is recorded whole in `product/plans/complete/file-glob-8-acp-tool-wiring.md`; the feature's canonical plan is `product/plans/complete/file-glob.md`. Depends on piece 1 (`product/plans/draft/file-glob-8-acp-tool-wiring-1-loop-routing.md`: the loops route a glob) and piece 2 (`product/plans/draft/file-glob-8-acp-tool-wiring-2-vocabulary-and-file-tool.md`: `file glob` is a native command the file tool advertises and the gate grants). Subplan 9 (completion) does not depend on this one.

This piece turns `file glob` on by default for the two built-in ACP roles and updates every spec and user-doc sentence that states those defaults. After piece 2 a role that grants `file glob` already gets the primer, the extractor, the gate, and the routing; this piece only adds the grant to the built-in lists, so the default `ask` and `tell` prompts gain the glob primer and `file glob` in their allow-list line in the same commit that makes the gate pass it.

## Design decisions

From the source plan:

- The built-in `ask` and `tell` command lists in `src/plugins/roles/roles-file.ts` (the `commands:` arrays of the `name: 'ask'` and `name: 'tell'` entries) add `'file glob'` right after `'file read'`, so ask grants eight commands (seven today) and tell grants thirteen (twelve today), which is the whole vocabulary after piece 2.
- Saved roles files are not changed: an existing roles file's `ask` or `tell` keeps the grants it lists, with or without `file glob`. Saved roles files are not migrated.
- `ROLES_PAYLOAD_SCHEMA_VERSION` stays at 4.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| Default `ask` and `tell` roles | `src/plugins/roles/roles-file.ts` | The grant lists. |
| `leaves an existing ask and tell role without file read untouched on disk` | `src/plugins/roles/roles-file.test.ts` | Pattern for the saved-role test. |
| `ASK_COMMANDS` and the `readRoleSettings` default test | `src/acp/ask-role.test.ts` | Default-grant pins. |
| Pieces 1 and 2 | `src/acp/`, `src/remote/serve-acp-loop.ts`, `src/plugins/roles/shared.ts` | Everything the grant switches on. |

## Proposed changes

Production code:

- `src/plugins/roles/roles-file.ts`: insert `'file glob'` after `'file read'` in the `ask` and `tell` lists. The file is 189 lint-counted lines, so add at most one line (wrap the tell list onto its existing third line if it gets long); do not restructure the file.

Specs:

- `product/specs/acp.md`:
  - `### File glob`: to the sentence piece 2 wrote (a native ACP command a role can grant), add that it is granted by default to the built-in `ask` and `tell` roles.
  - The `### File read` default-grant sentence ("ask grants seven commands and tell grants twelve, including `file write` and `file edit`") becomes eight and thirteen, including `file glob`, `file write`, and `file edit`.
- `product/specs/roles.md`: add `file glob` after `file read` in the `ask` grant list; "all twelve native commands: those seven plus …" becomes "all thirteen native commands: those eight plus …"; keep the note that an existing roles file is unchanged. (Piece 2 already changed the Add-command "hidden when all … native commands are present" count.)

User docs:

- `help/tell.md`: "all twelve native commands" becomes thirteen, and the file list reads "file read, glob, write, and edit".
- `help/ask.md`: the default ask role's capabilities add finding workspace files by path.
- `documentation/user-documentation/tab-types/roles.md`: Ask's default capabilities add finding files by path. (Piece 2 already changed "When all twelve native commands are granted".)

## Tests

- `src/plugins/roles/roles-file.test.ts`: the default `ask` and `tell` list expectations (the `'question ask', 'question approve', 'file read',` lines) gain `'file glob'` after `'file read'`; add a case that a saved `ask`/`tell` role without `file glob` is left untouched on disk, beside `leaves an existing ask and tell role without file read untouched on disk`.
- `src/acp/ask-role.test.ts`: `ASK_COMMANDS` gains `'file glob'` after `'file read'`; `expect(tell).toHaveLength(12)` becomes 13 and the `arrayContaining` check includes `'file glob'`.

## Verification

- `$janissary/scripts/run.mjs check-diff` after the change; it covers the server tests above.
- Manual, ACP: open an `ask` session, ask it to list the plan files under `product/plans/complete` whose names mention `editor`, and confirm it emits one `file glob` line and receives the matching paths. Then disable the `file glob` row in the Commands tab and confirm the next ask prompt's glob gets `Command is disabled: file glob.`.

## Out of scope

Completion (subplan 9). `file glob` for `agent` runs stays refused (subplan 7.1; `gateAgentCommand` is not touched). Per-pattern authorization, a resource field, and the backlog's "pattern as resource identifier" idea. Migrating saved roles files. Everything pieces 1 and 2 already delivered.
