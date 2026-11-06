# Role native command catalog and grants

**Complexity: 4/10** — one shared vocabulary, role-file decoding and persistence, defaults, and two serialized edit intents.

## Goal

Define the nine native ACP subcommands once and let each role persist an explicit list of the commands it grants. Establish the server and wire contract that the roles UI and ACP tool loop will use in later subplans.

## Decisions and dependencies

- This is the first subplan and has no feature dependency.
- The ordered command vocabulary is `db sqlite create`, `db sqlite delete`, `db sqlite query`, `db sqlite list`, `browser goto`, `browser content`, `browser eval`, `question ask`, and `question approve`. Keep it in a pure core module at `src/acp/native-commands.ts`, with each command's owning tool and a native-command membership check.
- A granted subcommand runs with any trailing arguments; do not narrow it by database, URL, or SQL statement.
- A role's JSON `commands` field is an array of strings after `description` and `entries`. A missing field reads as no grants. A non-array value or any non-string item makes the role malformed and increments the existing dropped-role count, reported by `roles.json dropped N malformed roles or entries at <path> — showing the rest of this file.` Preserve unknown strings and duplicate strings from hand-written files.
- Add `tell` directly after `ask` in `DEFAULT_ROLES`, with description `When you tell a model to carry out a task via ACP.` and the same entries as `ask`, in order: `opencode` / `opencode-go/deepseek-v4.1-flash` at `medium`, `claude` / `claude-haiku-4-5` at `high`, and `codex` / `gpt-6-luna` at `high`. The default `ask` grants exactly `db sqlite list`, `db sqlite query`, `browser goto`, `browser content`, `question ask`, and `question approve`. The default `tell` grants all nine commands. The other five defaults (`planning`, `research`, `code review`, `implementation`, and `documentation`) store empty command lists. Defaults are still written only when the roles tab creates a new file; ACP reads never create a file.
- When a role is absent, later ACP lookup may use its built-in default. When a role exists with no `commands` key, it grants none, even if its model entries fall back to defaults.
- The import-free roles shared contract carries the vocabulary in its payload; it does not import the core module.
- `add-command` carries only a role and command; `remove-command` carries only a role and command and removes all copies. Neither intent has an expected-list precondition. Re-adding an existing command or removing an absent one is a no-op without a refusal. Other refusals use the existing single refusal line.

## Existing code to reuse

- `src/acp/tool-table.ts` is the existing source of browser, question, and database native command lines.
- `src/plugins/roles/roles-file.ts`, `role-edits.ts`, `ordered-json.ts`, and `activate.ts` own role parsing, serialized writes, and publication.
- `src/plugins/roles/shared.ts` holds the import-free payload and intent guards.
- `product/specs/roles.md` documents the roles file and its malformed-file behavior.

## Proposed changes

- Add `src/acp/native-commands.ts` with the ordered vocabulary, owning-tool lookup, and membership predicate.
- Extend the role model, strict decode, ordered JSON write, and defaults in `src/plugins/roles/`. Extract role decoding into `role-decode.ts` before `roles-file.ts` exceeds the 200-line limit.
- Extend `src/plugins/roles/shared.ts` payload and intent guards to carry the command vocabulary and validate the two new intents while keeping the module import-free.
- Add the command edit handlers in `src/plugins/roles/command-intents.ts` and register them through `activate.ts`; preserve the existing serialized write-then-publish path and refusal behavior.
- Update `product/specs/roles.md` for the persisted field, default roles and command grants, malformed values, unknown strings, duplicates, and no-op edit behavior.

## Tests

- `src/acp/native-commands.test.ts`: vocabulary order, owning-tool lookup, and native membership.
- `src/plugins/roles/shared.test.ts`: payload and intent guards accept valid command data and reject malformed values.
- `src/plugins/roles/roles-file.test.ts`: decode, write, round-trip, missing field, malformed field, unknown strings, duplicates, and exact default role order and grants.
- `src/plugins/roles/activate.test.ts`: add/remove writes and republishes, duplicate add and absent remove do nothing, and refusals remain on the existing line.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after implementation changes and tests.
- Confirm only planned server, role contract, test, and roles spec files changed.

## Out of scope

- Rendering or editing commands in the roles UI.
- Applying command grants to ACP tool execution.
- Adding the `tell` command or role-keyed ACP sessions.
