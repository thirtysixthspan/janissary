# Hosted write tool 14 — grant writes and edits to the built-in `tell` role

**Complexity: 2/10** — ~2 added lines in 1 production file (`DEFAULT_ROLES`), 3 requirements, 5 scenarios (p=3.75).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 14 of 15 in the hosted write tool series. Depends on plan 12 (`janissary-hosted-agent-write-tool-12-acp-file-mutation-tools.md`), which adds the names to the native vocabulary and makes them work as ACP tools, and plan 13 (`janissary-hosted-agent-write-tool-13-remote-loop-mutations.md`), so the default grant works on remote tabs too. Both are complete on this branch. Plan 15 owns end-to-end verification.

`tell` is the role for carrying out a task, so it is the one role that gets write access by default. `ask` stays read-only, and roles someone already saved keep exactly the grants they list.

## Goal

The built-in `tell` role's default commands include `file write` and `file edit`; the built-in `ask` role's do not; no saved role gains either name automatically.

## Design decisions and dependencies

- Source plan decision: grant `file write` and `file edit` to the built-in `tell` role only, by appending them, in that order, after `'file read'` at the end of the `tell` entry's `commands` in `DEFAULT_ROLES` (`src/plugins/roles/roles-file.ts:75`, `name: 'tell'`). This matches their order in `NATIVE_ACP_COMMANDS` (`src/plugins/roles/shared.ts`), so the default `tell` list is then exactly the twelve native names in the default order it already uses (db names first, then browser, question, file). Keep built-in `ask` grants unchanged.
- Where the defaults reach a session, and what that means for existing users (decided: no migration):
  - `readRolesFile` (`roles-file.ts`, "When neither file exists the home file is created with the default roles") writes `DEFAULT_ROLES` only when neither `~/.janissary/roles.json` nor the project `.janissary/roles.json` exists. An existing file is never merged with the defaults, so a user whose home file was created before this change keeps `tell` at ten grants until they add the two names in the Roles tab. That is intended.
  - `readRoleSettings` in `src/acp/ask-role.ts` falls back to `DEFAULT_ROLES` commands only when the roles file in effect has no role of that name (or no file exists, via `create: false`). A saved `tell` role uses `configured.commands` verbatim, even when it lacks the new names. Do not change `readRoleSettings`.
- No payload schema bump: `ROLES_PAYLOAD_SCHEMA_VERSION` in `src/plugins/roles/shared.ts` describes the payload shape, which does not change.
- `roles-file.ts` is 226 raw lines, under 200 counted. Add the two names as a new third line of the `tell` `commands` array (the existing second line is already long); no extraction is needed.
- No web change: the Roles tab's Add-command picker derives from `NATIVE_ACP_COMMANDS`, which already holds twelve names, so it is hidden for a default `tell` card automatically.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/plugins/roles/roles-file.ts` `DEFAULT_ROLES` | Built-in role definitions; the only production edit |
| `src/plugins/roles/shared.ts` `NATIVE_ACP_COMMANDS` | Already contains `file write` and `file edit` (plan 12) |
| `src/acp/ask-role.ts` `readRoleSettings` | Default-vs-saved resolution; unchanged |
| `src/plugins/roles/roles-file.test.ts` `'creates seven default roles with the exact ask and tell entries and grants'` | Exact default `tell` list to update |
| `src/plugins/roles/roles-file.test.ts` `'leaves an existing ask and tell role without file read untouched on disk'` | Pattern for the "saved role is not migrated" test |
| `src/acp/ask-role.test.ts` `ASK_COMMANDS` and `readRoleSettings(root, 'tell', home).commands).toHaveLength(10)` | Ask list stays; tell count changes to 12 |
| Gating tests in `src/acp/tool-table.test.ts`, `src/acp/run-prompt.test.ts`, `src/acp/drive-loop.test.ts` | Already prove a granted mutation runs and an ungranted one is refused with `Command not allowed for role "<role>": <command>.` (plan 12); not repeated here |

## Proposed changes

1. `src/plugins/roles/roles-file.ts`: append `'file write'`, `'file edit'` to the `tell` role's default commands as described above.
2. `product/specs/roles.md`: in the defaults paragraph ("The `tell` role grants all ten native commands: those seven plus `db sqlite create`, `db sqlite delete`, and `browser eval`"), change it to all twelve native commands, adding `file write` and `file edit`, and add one sentence that an existing roles file is not changed, so its saved `tell` keeps the grants it lists. In the Add-command paragraph, change "hidden when all ten native commands are present" to twelve. `ask` still grants seven.
3. `product/specs/acp.md`: in the file-tool paragraph under typed file writes (the sentence "a role can grant them like any other command; no built-in role grants them"), replace "no built-in role grants them" with: the built-in `tell` role grants both by default, the built-in `ask` role grants neither, and a saved role keeps the grants it lists.

## Tests

- `src/plugins/roles/roles-file.test.ts`:
  - Update the exact `file['tell']` expectation in `'creates seven default roles with the exact ask and tell entries and grants'` to end with `'file read', 'file write', 'file edit'`; the `ask` expectation stays as is and must not contain either name.
  - Add a test beside `'leaves an existing ask and tell role without file read untouched on disk'`: a home file whose `tell` lists ten commands without the new names reads back with exactly those commands and the file bytes are unchanged. Add one where a saved `ask` lists `file write` and it is kept.
- `src/acp/ask-role.test.ts`: change `toHaveLength(10)` for `tell` to assert it contains `file write` and `file edit` (length 12); keep the `ASK_COMMANDS` equality so the ask grant list is proven unchanged. Add a case: a home file with a saved `tell` lacking the names → `readRoleSettings(root, 'tell', home).commands` lacks them.
- No new run-prompt or drive-loop test: gating by grant list is covered by plan 12's tests, and this plan only changes the list.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Manually: with no `~/.janissary/roles.json` and no project `.janissary/roles.json` (move them aside temporarily), open the Roles tab and confirm the `tell` card lists twelve commands with no Add-command button and `ask` lists seven; then `tell create notes.txt containing hello` in a shell tab and confirm the file appears. Full end-to-end coverage belongs to plan 15.

## Out of scope

- Any change to `ask`, other built-in roles, or saved roles (no migration of existing `roles.json` files).
- Changes to `readRoleSettings`, gating, or the payload schema.
- Autonomous agent grants.
- End-to-end verification across local and remote tabs (plan 15).
