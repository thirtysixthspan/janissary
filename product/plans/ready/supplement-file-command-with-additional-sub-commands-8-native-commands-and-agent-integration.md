# Supplement file command with additional sub commands — 8: native commands, roles, and agent integration

**Complexity: 5/10** — ~95 added lines across 4 files, 8 requirements, 10 scenarios (p=5.71)

Decomposed from `./product/plans/complete/supplement-file-command-with-additional-sub-commands.md`, the authoritative feature scope. This is subplan 8 of 8. It depends on subplans 1-3 (`./product/plans/ready/supplement-file-command-with-additional-sub-commands-1-list-stat-local.md`, `...-2-exists-local.md`, `...-3-head-tail-local.md`) for the predicates and primers and on subplan 7 (`./product/plans/ready/supplement-file-command-with-additional-sub-commands-7-dispatcher-and-completion.md`) so the commands are typed-reachable before they are granted. Subplan 9 updates the docs and runs the full manual matrix.

## Goal

Make all four new commands grantable native commands with per-subcommand settings, included in the built-in `ask` and `tell` roles, described in the file tool's primer, runnable by role sessions on their workspace, and refused in autonomous agent runs. No protocol, executor, dispatcher, or completion changes are part of this subplan.

## Design decisions

- Register five native names, one per typed spelling: `file list`, `file stat`, `file exists`, `file head`, and `file tail` in `NATIVE_ACP_COMMANDS` at `src/plugins/roles/shared.ts:3`. `file ls` stays a parser and completion alias of `file list` and does not get its own settings row, just as no separate native name exists for an alias today. The `file write` / `file edit` pair from one module being two native names is the precedent for giving head and tail separate rows. That single addition per name generates its native settings row with parent `file` through `src/application-commands.ts:48-51` (the parent is `name.split(' ').slice(0, -1).join(' ')` at line 49), so `COMMAND_FORMS` needs no edit. `nativeCommandTool` at `src/acp/native-commands.ts:15-24` maps any `file ` name to the `file` tool by prefix, so it needs no change either. Each name gets its own Enabled and Agent-access setting under the `file` parent, so disabling one refuses only that subcommand.
- The built-in `ask` and `tell` roles in `DEFAULT_ROLES` at `src/plugins/roles/roles-file.ts:27` both grant all five names by default, so both the typed command reference and the agent primer describe them. Saved roles files are not changed.
- In `src/acp/tool-table.ts`, extend the `file` tool entry at lines 62-70 so `isCommandLine` also recognizes the names from subplan 7, and extend `filePrimer` at lines 105-113 with a primer text per new name, gated on that name being in `allowed`. The new names are native commands, so the existing `allowed` filter and the `Only these commands are allowed` list in `toolPrimer` cover them.
- `gateAgentCommand` at `src/acp/tool-table.ts:162-173` already refuses file glob, grep, and mutations, leaving only `file read` runnable in an autonomous agent run. Add the five new names to that refusal so an agent run that emits one gets `Agent: command not permitted: <command>.`, exactly as for glob and grep. Echo the whole command line as sent. The new tools are for ACP sessions and typed use, not agent runs.
- Add branches for the five names to `runWorkspaceCommandIn` at `src/acp/workspace-runner.ts:10-20`, after the existing mutation, glob, and grep checks and before the `readWorkspaceCommand` fall-through at line 19, so a role session that emits one runs it against its workspace root.
- `src/acp/tool-table.ts` is 179 lines and will grow past the 200-line `max-lines` limit with the added blocks. Extract `filePrimer` (and its new primer strings) into a new pure module under `src/acp/` and import it back, rather than compacting code or stripping comments. Keep the new primer module import-light: `tool-table.ts` is loaded by the remote server and must not pull in managers.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| Native command vocabulary | `NATIVE_ACP_COMMANDS` at `src/plugins/roles/shared.ts:3` |
| Native settings rows | `src/application-commands.ts:48-51` (`COMMAND_FORMS` needs no edit) |
| Built-in role grants | `DEFAULT_ROLES` at `src/plugins/roles/roles-file.ts:27` (`ask` grants near line 71, `tell` near 84-85) |
| File tool entry and primer | `src/acp/tool-table.ts:62-70` and `src/acp/tool-table.ts:105-113` |
| Agent-run gate | `gateAgentCommand` at `src/acp/tool-table.ts:162-173` (refusal template at line 168) |
| Workspace command routing | `runWorkspaceCommandIn` at `src/acp/workspace-runner.ts:10-20` |
| Test homes | `src/application-commands.test.ts`, `src/acp/tool-table.test.ts`, `src/acp/workspace-runner.test.ts` |

## Proposed changes

- Add the four names to `NATIVE_ACP_COMMANDS` and to both built-in roles' command grants.
- Extract `filePrimer` into its own pure module under `src/acp/` and extend it with the four new primers; wire the `file` tool entry and the extraction point back to it.
- Extend the file tool's `isCommandLine`, the agent gate's refusal list, and `runWorkspaceCommandIn` with the four new names.

## Tests

- Update `src/application-commands.test.ts`: each of the five new names produces a native row with parent `file`, carries its own Enabled and Agent-access toggles, and does not require a `COMMAND_FORMS` entry; `file ls` produces no extra row.
- Update `src/acp/tool-table.test.ts`: the new names are recognized in the file tool's reply-line predicate, their primers appear only when granted, they are absent from a subagent's table, and an agent snapshot refusing them yields `Agent: command not permitted: <command>.` with the whole line echoed.
- Update `src/acp/workspace-runner.test.ts`: each new command routes to its workspace runner, and an unrecognized line still falls through to `file read`.
- Update the roles tests covering `DEFAULT_ROLES`: both `ask` and `tell` grant all five new names, and saved roles files are unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the source changes and again after the tests. Confirm `src/acp/tool-table.ts` and the extracted primer module are both under 200 lines and that imports keep the `.js` extension rule. The typed and agent manual checks are in subplan 9.

## Out of scope

Help pages, specs, the alphabetical Commands table, and the manual end-to-end matrix (subplan 9); remote protocol and executors (subplans 4-6); dispatcher and completion (subplan 7). Do not change how role grants are stored or edited beyond listing the new names among the native commands.
