# Web search 13: grant `web search` to the built-in `ask` and `tell` roles

**Complexity: 2/10** — ~2 changed lines in 1 production file, 4 requirements, 4 test scenarios (p=3.84)

The thirteenth slice of the `web search` feature (source plan: `./product/plans/complete/web-search.md`). It adds `web search` to the built-in `ask` and `tell` roles' default command grants, so a project with no roles file of its own gets agent web search out of the box, and updates the help pages, user docs, and specs that list those grants and counts. Saved roles files are not migrated.

## Dependencies

- `./product/plans/ready/web-search-12-acp-tool.md` — `'web search'` is already the last entry of `NATIVE_ACP_COMMANDS` (`src/plugins/roles/shared.ts`), with a `web` tool-table entry, so granting it has an effect. Slice 12 also already rewrote `product/specs/roles.md`: its default-roles paragraph reads "The `tell` role grants thirteen of the fourteen native commands, every one except `web search`: those eight plus …", and its Roles-tab paragraph already reads "hidden when all fourteen native commands are present". It added a `### Web search` subsection to `product/specs/acp.md` that says no built-in role grants it yet, and left `acp.md`'s grant-count sentence alone. This slice rewrites exactly those leftovers.
- `./product/plans/complete/web-search-10-typed-command.md` — `help web` exists for the help pages to point at, and `product/specs/web-search.md` exists (slice 12 added its "Agent tool" section).
- `./product/plans/complete/web-search-3-provider-tokens.md` — the `tavily-token` and `tinyfish-token` rows and the token page `documentation/user-documentation/advanced-agents/tokens.md`, which the ACP user doc links to.

All 14 web-search slices ship on one pull request; this slice lands after 1–12. Nothing in slice 14 (completion) depends on it.

## Design decisions

Carried verbatim from the source plan where they apply.

- **Default grants (user decision).** The built-in `ask` and `tell` roles both grant `web search`: ask goes from eight commands to nine, tell from thirteen to fourteen (one more than whatever count tell has when this lands, if `file patch` lands first). Saved roles files are not changed and keep the grants they list. With no provider token configured, a granted search sends nothing anywhere.
- **Tell still grants all native commands.** With `web search` added, tell grants every native command again ("all fourteen"), and the Roles tab's **Add command** is hidden for it. Ask's **Add command** no longer offers `web search`.
- **Order.** `web search` goes at the end of each role's `commands` list, after `'file glob'` for ask and after `'file edit'` for tell. Tell's list then equals `NATIVE_ACP_COMMANDS` in its exact order (it already matches the vocabulary entry for entry today), which the test below pins.
- **Counts (checked against master, 2026-11-15).** `file patch` (`./product/plans/ready/file-patch.md`) has not landed: `NATIVE_ACP_COMMANDS` ends at `'file edit'` with thirteen entries, `src/` has no `file patch`, and the built-in tell role lists thirteen commands. So the final counts this slice writes are: ask nine, tell fourteen, native vocabulary fourteen, tell grants "all fourteen". Before editing, re-check `NATIVE_ACP_COMMANDS`; if `file patch` has landed by then (vocabulary at fifteen after slice 12, tell at fourteen of fifteen), every "fourteen" below for tell and the vocabulary is "fifteen" and the tell length assertion is 15; ask's nine is unaffected because `file patch` is not granted to ask.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this slice uses it |
| --- | --- | --- |
| Built-in roles | `src/plugins/roles/roles-file.ts` (`DEFAULT_ROLES`, the `ask` entry's `commands` ending `'question ask', 'question approve', 'file read', 'file glob',` and the `tell` entry's ending `'file glob', 'file write', 'file edit',`) | `'web search'` appended to the last line of each list, so the file's line count does not grow (227 raw lines, under the 200 counted-line limit already). |
| Default-role grant tests | `src/plugins/roles/roles-file.test.ts` (`creates seven default roles with the exact ask and tell entries and grants`), `src/acp/ask-role.test.ts` (`ASK_COMMANDS`; `uses built-in entries and command grants when the requested role is absent`, with `expect(tell).toHaveLength(13)`) | Updated lists and counts. |
| Saved-file-not-migrated test pattern | `src/plugins/roles/roles-file.test.ts` (`leaves a saved ask and tell role without file glob untouched on disk`, which compares commands and the file's bytes before and after) | Model for the new "without web search" test. |
| Home roles file creation | `readRolesFile` (`src/plugins/roles/roles-file.ts`) writes `~/.janissary/roles.json` with `DEFAULT_ROLES` when neither file exists | Why the manual check moves an existing home file aside. |

## Proposed changes

Production code:

- **`src/plugins/roles/roles-file.ts`** — `'web search'` appended as the last entry of the built-in `ask` and `tell` roles' `commands`, on each list's existing last line. No other edit.

Specs (final text; counts per Design decisions):

- **`product/specs/roles.md`** — in the default-roles paragraph, ask's list "`file read`, and `file glob`." becomes "`file read`, `file glob`, and `web search`."; slice 12's "The `tell` role grants thirteen of the fourteen native commands, every one except `web search`: those eight plus …" becomes "The `tell` role grants all fourteen native commands: those nine plus `db sqlite create`, `db sqlite delete`, `browser eval`, `file write`, and `file edit`." The following "An existing roles file is not changed, so its saved `tell` keeps the grants it lists." becomes "…so its saved `ask` and `tell` keep the grants they list." The Roles-tab "hidden when all fourteen native commands are present" sentence is already right after slice 12; leave it.
- **`product/specs/acp.md`** — the sentence "`file read` is granted by default to the built-in `ask` and `tell` roles: ask grants eight commands, including `file glob`, and tell grants thirteen, including `file glob`, `file write`, and `file edit`." becomes ask nine, including `file glob` and `web search`, and tell fourteen, every native command, including `file glob`, `file write`, `file edit`, and `web search`. In slice 12's `### Web search` subsection, replace "no built-in role grants it yet" with: the built-in `ask` and `tell` roles grant it by default, and a saved role keeps the grants it lists.
- **`product/specs/web-search.md`** — in slice 12's "Agent tool" section, one sentence: the built-in `ask` and `tell` roles grant `web search`; a saved roles file is not migrated; with no provider token configured a granted search reports `Web search: no provider configured.` and sends nothing.

Help pages:

- **`help/ask.md`** — the "default ask role can …" sentence gains "and search the web with `web search` (see `help web`)". The next bullet, "The agent has no built-in tools: no shell, file, or web tools of its own. It can only run the granted native commands.", stays, followed by: its web access is the granted `web search` command, which needs a provider token.
- **`help/tell.md`** — "The default tell role has all thirteen native commands: … and file read, glob, write, and edit." becomes "all fourteen native commands: … file read, glob, write, and edit; and web search." Add the same "its web access is the granted `web search` command" sentence after the "no built-in tools" bullet as in `help/ask.md`.
- **`help/roles.md`** — the "default `ask` role can query databases, browse pages, read files …, and ask or approve questions" sentence gains "search the web"; tell's "also starts with …" list is unchanged, since tell inherits ask's.

User docs:

- **`documentation/user-documentation/advanced-agents/acp-agent.md`** — four edits:
  1. The built-in-roles paragraph ("With the built-in roles, ask can read a file from the workspace, …, and ask or approve a question.") adds "search the web"; tell's "those same commands plus …" stays.
  2. "The agent has no built-in tools of its own, such as a shell, file editing, or web search, so it can only run the native commands its role grants." gains a following sentence: it can still search the web through the granted `web search` command, which the built-in ask and tell roles grant; a search needs a `tavily-token` or `tinyfish-token` file, linked to [the tokens page](/user-documentation/advanced-agents/tokens), and without one the step reports `Web search: no provider configured.`.
  3. "The agent can use the file, database, browser, and question tools granted to its role. By default, ask can …" becomes file, database, browser, question, and web; the default ask list adds "search the web". "Only these four tools are available in this loop" becomes five.
  4. In the remote paragraph after "A granted `file glob` searches that same workspace.", add: a granted `web search` also runs on the host running the agent, so on a remote tab it uses the remote machine's token files (forwarded tokens win), and its step carries the `[<host>] ` tag. The closing "A typed `file read`, `file glob`, `file write`, or `file edit` and a caller-side step carry no tag." adds typed `web search`.
- **`documentation/user-documentation/tab-types/roles.md`** — "When all thirteen native commands are granted, **Add command** is hidden." becomes fourteen.

## Tests

- **`src/plugins/roles/roles-file.test.ts`**:
  - `creates seven default roles with the exact ask and tell entries and grants` — ask's expected `commands` ends with `'web search'`; tell's ends with `'file edit', 'web search'`. Add `expect(file['tell'].commands).toEqual([...NATIVE_ACP_COMMANDS])` (import from `./shared.js`), pinning "tell grants every native command, in vocabulary order".
  - New, beside `leaves a saved ask and tell role without file glob untouched on disk` and in its shape: `leaves a saved ask and tell role without web search untouched on disk` — save today's pre-slice ask (eight) and tell (thirteen) lists, read, and assert the commands are returned as saved and the file's bytes are unchanged.
- **`src/acp/ask-role.test.ts`** — `ASK_COMMANDS` gains `'web search'` at the end; in `uses built-in entries and command grants when the requested role is absent`, `toHaveLength(13)` becomes 14 and the `arrayContaining` list gains `'web search'`.

Suites that pass unchanged: `src/plugins/roles/activate.test.ts` (compares against `DEFAULT_ROLES` itself), `web/src/plugins/roles/RolesTab.test.tsx` and `roles-dnd.test.tsx` (build their own role payloads; `hides Add command when all native commands are present…` spreads the vocabulary), and `src/models/catalog-file.test.ts` (reads `DEFAULT_ROLES` entries, not commands). No other test hard-codes the default grant lists (checked by grepping tests for the default ask and tell lists).

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Manual, in a scratch project with no `.janissary/roles.json`, started with `node bin/janus.mjs --no-open <project>`, with `~/.janissary/tavily-token` present. Move any existing `~/.janissary/roles.json` aside first (the app recreates it from the defaults on first read; restore yours afterwards), since a saved file is deliberately not migrated:
  1. Open the Roles tab: the `tell` card lists fourteen commands ending in `web search` and shows no **Add command**; the `ask` card lists nine ending in `web search`, and its **Add command** picker does not offer `web search`.
  2. Run `tell find the current Node.js LTS version on the web` and confirm the connection tab shows a `web search …` tool step and the answer cites a result.
  3. Restore your own `~/.janissary/roles.json` (without `web search`), restart, and run `tell find the current Node.js LTS version on the web` again. Confirm no web step runs: the role's grants build the tool table and the run snapshot together, so a saved `tell` without the grant has no web tool, no web primer, and no `web search` in its allow-list. A model-emitted `web search` line therefore stays prose in the answer instead of producing `Command not allowed for role "tell": web search.`

## Out of scope

- Migrating saved roles files (user decision).
- Any change to the vocabulary, tool table, primer, or routing (`./product/plans/ready/web-search-12-acp-tool.md`, `./product/plans/complete/web-search-11-workspace-routes.md`).
- `help web` and `help/commands.md` (`./product/plans/complete/web-search-10-typed-command.md`); the tokens page (`./product/plans/complete/web-search-3-provider-tokens.md`).
- Completion (`./product/plans/draft/web-search-14-completion.md`).
- Granting `web search` to any other built-in role (they start with no grants).
