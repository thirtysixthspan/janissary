# File glob 8.3 — grant `file glob` to the built-in `ask` and `tell` roles

**Complexity: 2/10** — ~2 changed lines in 1 file, 3 requirements, 5 test scenarios (p=3.75)

Run order: piece 3 of 3 of file glob subplan 8, which is 8 of 9 in the file glob series. Subplan 8 is recorded whole in `product/plans/complete/file-glob-8-acp-tool-wiring.md`; the feature's canonical plan is `product/plans/complete/file-glob.md`. Depends on piece 1 (`product/plans/complete/file-glob-8-acp-tool-wiring-1-loop-routing.md`, landed in `4149ae81`: the loops route a glob) and piece 2 (`product/plans/complete/file-glob-8-acp-tool-wiring-2-vocabulary-and-file-tool.md`, landed in `0b7affe6`: `file glob` is in `NATIVE_ACP_COMMANDS` at `src/plugins/roles/shared.ts:14`, the file tool advertises it, and the gate grants it). Both have landed on this branch. Subplan 9 (completion) does not depend on this one and is out of scope.

This piece turns `file glob` on by default for the two built-in ACP roles and updates every spec, help page, and user-doc sentence that states those defaults. After piece 2 a role that grants `file glob` already gets the primer, the extractor, the gate, and the routing; this piece only adds the grant to the built-in lists, so the default `ask` and `tell` prompts gain the glob primer and `file glob` in their allow-list line in the same commit that makes the gate pass it.

## Design decisions

From the source plan:

- The built-in `ask` and `tell` command lists in `src/plugins/roles/roles-file.ts` (the `commands:` arrays of the `name: 'ask'` and `name: 'tell'` entries of `DEFAULT_ROLES`) add `'file glob'` right after `'file read'`, so ask grants eight commands (seven today) and tell grants thirteen (twelve today), which is the whole vocabulary after piece 2 (`NATIVE_ACP_COMMANDS` has thirteen entries).
- Saved roles files are not changed: an existing roles file's `ask` or `tell` keeps the grants it lists, with or without `file glob`. Saved roles files are not migrated. This needs no code: `readRolesFile` decodes a saved role's `commands` as written, and `readRoleSettings` in `src/acp/ask-role.ts` uses built-in grants only when the role is absent from the file in effect.
- `ROLES_PAYLOAD_SCHEMA_VERSION` stays at 4.

Subplan decisions carried by this piece:

- All production, test, spec, help, and doc edits land in one commit: the production change alone breaks the `roles-file.test.ts` and `ask-role.test.ts` pins.
- The user-facing phrase for the new ask capability is "find workspace files by path" (adapted to each sentence's grammar, e.g. "finding workspace files by path"), used the same way on every page below so the pages agree.
- `help/roles.md`'s tell clause omits the file write/edit defaults today; since this piece rewrites that sentence for the new default, it also adds "and writing and editing workspace files" so the sentence states the full tell default like the other pages.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| Default `ask` and `tell` roles | `src/plugins/roles/roles-file.ts`, `DEFAULT_ROLES` | The grant lists. |
| `leaves an existing ask and tell role without file read untouched on disk` | `src/plugins/roles/roles-file.test.ts` | Pattern for the saved-role test (writes the file, captures its bytes, reads, compares commands and bytes). |
| `keeps a saved tell role without file write or file edit as it is on disk` | `src/plugins/roles/roles-file.test.ts` | Same pattern with a full saved tell list. |
| `ASK_COMMANDS` and `uses built-in entries and command grants when the requested role is absent` | `src/acp/ask-role.test.ts` | Default-grant pins. |
| Pieces 1 and 2 | `src/acp/tool-table.ts`, `src/acp/run-prompt.ts`, `src/remote/serve-acp-loop.ts`, `src/plugins/roles/shared.ts` | Everything the grant switches on; no edit here. |

## Proposed changes

Production code:

- `src/plugins/roles/roles-file.ts` (189 lint-counted lines today; it must not grow, and with the placement below it does not):
  - `ask` list: the line `'question ask', 'question approve', 'file read',` becomes `'question ask', 'question approve', 'file read', 'file glob',`.
  - `tell` list: the third line `'file write', 'file edit',` becomes `'file glob', 'file write', 'file edit',` (the second line, ending in `'file read',`, is already long; do not extend it).
  - No other edit to the file; it stays at 189 lines.

Specs:

- `product/specs/acp.md`:
  - `### File glob`: the sentence piece 2 wrote, "It is also a native ACP command a role can grant; an agent run's `janissary file glob …` is still refused rather than run.", gains that the built-in `ask` and `tell` roles grant it by default (e.g. "It is also a native ACP command a role can grant, granted by default to the built-in `ask` and `tell` roles; …").
  - The `### File read` default-grant sentence ("`file read` is granted by default to the built-in `ask` and `tell` roles: ask grants seven commands and tell grants twelve, including `file write` and `file edit`.") becomes eight and thirteen, with ask including `file glob` and tell including `file glob`, `file write`, and `file edit`.
  - Leave the File write and edit tools paragraph ("the built-in `tell` role grants both by default, the built-in `ask` role grants neither") alone; it stays true.
- `product/specs/roles.md` (hard-wrapped; edit words in place, do not reflow the paragraph): in the `### The file` paragraph that starts "When neither file exists, the tab creates `~/.janissary/roles.json` holding seven default roles", the `ask` grant list ("`question approve`, and `file read`.") becomes "…`question approve`, `file read`, and `file glob`."; "The `tell` role grants all twelve native commands: those seven plus …" becomes "all thirteen native commands: those eight plus …" (the tail list `db sqlite create`, `db sqlite delete`, `browser eval`, `file write`, `file edit` is unchanged); keep "An existing roles file is not changed, so its saved `tell` keeps the grants it lists." Piece 2 already changed "hidden when all thirteen native commands are present"; do not touch it.

Help pages:

- `help/tell.md` (Notes, first bullet): "The default tell role has all twelve native commands" becomes thirteen, and "and file read, write, and edit" becomes "and file read, glob, write, and edit".
- `help/ask.md` (Notes, "The `ask` role's `commands` list grants native ACP commands." bullet): "…ask or approve a question, and read a file from the workspace." becomes "…ask or approve a question, read a file from the workspace, and find workspace files by path."
- `help/roles.md` (Use cases, "Grant native commands to roles used by `ask` and `tell`." bullet): the ask list "read files from the workspace" gains "find workspace files by path"; the tell clause "`tell` also starts with database create/delete and browser eval" becomes "…database create/delete, browser eval, and writing and editing workspace files" (decision above).

User docs:

- `documentation/user-documentation/tab-types/roles.md`:
  - The defaults paragraph ("If neither your project nor your home folder has a `roles.json` file…"): "Ask can read a file from the workspace, list and query databases, …" adds finding workspace files by path. The tell sentence ("Tell starts with those commands plus …") stays as is: it inherits the addition.
  - The paragraph "The built-in **ask** role can read a file from the workspace, read and query databases, browse to a page and read its content, and ask or approve a question." adds finding workspace files by path the same way. "Ask can read files but not change them." and the "**Tell** inherits those commands, including reading a file, …" sentence stay as is.
  - Piece 2 already changed "When all thirteen native commands are granted"; do not touch it.
- `documentation/user-documentation/advanced-agents/acp-agent.md` (orchestrator decision; hard-wrapped, edit in place without reflowing):
  - "## Which model it runs", the paragraph starting "The `tell` command uses the matching `tell` role. With the built-in roles, ask can read a file from the workspace, …": ask's list adds finding workspace files by path. "Tell starts with those same commands plus …" stays.
  - "## Let the agent look things up", the paragraph starting "The agent can use the file, database, browser, and question tools granted to its role. By default, ask can read a file from the workspace, …": ask's list adds finding workspace files by path. "Tell has those commands plus …" stays.
  - Leave the "In a workspace or on another host" sentences ("A granted `file glob` searches that same workspace.", and the typed-command no-tag sentence) alone; piece 2 wrote them and they stay true.

Verified as needing no edit: `product/specs/application-commands.md` (piece 2 already lists the four file rows), `help/file.md` (no role or default statements), web tests (`RolesTab.test.tsx` and `roles-dnd.test.tsx` spread `NATIVE_ACP_COMMANDS`; nothing in `web/src` pins the default lists), and the other `DEFAULT_ROLES` consumers (`src/plugins/roles/activate.test.ts`, `src/models/catalog-file.test.ts`, and the remaining `roles-file.test.ts` cases compare against `DEFAULT_ROLES` by reference or read only its entries).

## Tests

- `src/plugins/roles/roles-file.test.ts`:
  - `creates seven default roles with the exact ask and tell entries and grants`: the ask expectation's `'question ask', 'question approve', 'file read',` line gains `'file glob',`; the tell expectation's `'file write', 'file edit',` line becomes `'file glob', 'file write', 'file edit',` — mirroring the production placement exactly so the arrays match in order.
  - Add `leaves a saved ask and tell role without file glob untouched on disk` directly after `leaves an existing ask and tell role without file read untouched on disk`, built the same way: write a home file whose `ask` lists the seven pre-glob ask defaults and whose `tell` lists the twelve pre-glob tell defaults (each in the default order, without `file glob`), capture the file's bytes, call `readRolesFile(home, root)`, and assert `read.roles.map((role) => role.commands)` equals those two lists and the file's bytes are unchanged.
- `src/acp/ask-role.test.ts`:
  - `ASK_COMMANDS` gains `'file glob'` after `'file read'` (it is used by `uses built-in entries and command grants when the requested role is absent`).
  - In that same test, `expect(tell).toHaveLength(12)` becomes 13 and the `expect.arrayContaining(['file write', 'file edit'])` check becomes `['file glob', 'file write', 'file edit']`.
  - The other cases there use saved roles and need no change.

## Verification

- `$janissary/scripts/run.mjs check-diff` after the change; it covers the two server test files above.
- Manual, ACP: the default grant applies only when the roles file in effect has no `ask` role, so first make sure the project has no `.janissary/roles.json` and `~/.janissary/roles.json` has no `ask` role (or its `ask` grants `file glob`; a saved pre-glob `ask` correctly keeps its old grants and will not glob). Open an `ask` session, ask it to list the plan files under `product/plans/complete` whose names mention `editor`, and confirm in the connection tab that it emits one `file glob` line and receives the matching paths. Then disable the `file glob` row in the Commands tab and confirm the next ask prompt's glob gets `Command is disabled: file glob.`.

## Out of scope

Completion (subplan 9, `product/plans/draft/file-glob-9-completion-and-end-to-end.md`). `file glob` for `agent` runs stays refused (subplan 7.1; `gateAgentCommand` is not touched). Per-pattern authorization, a resource field, and the backlog's "pattern as resource identifier" idea. Migrating saved roles files. Everything pieces 1 and 2 already delivered, including the spec and doc sentences about the vocabulary size and the granted glob's behavior.
