# Role native command catalog and grants

**Complexity: 4/10** — one shared vocabulary and payload schema change, role-file decoding and persistence, defaults, and two serialized edit intents.

## Goal

Define the nine native ACP subcommands once and let each role persist an explicit list of the commands it grants. Establish the server and wire contract that the roles UI and ACP tool loop will use in later subplans.

## Decisions and dependencies

- This is subplan 1 of 8 and has no feature dependency. The later plans that consume the vocabulary, payload, or command grants depend on this contract landing first.
- Put the one ordered `NATIVE_ACP_COMMANDS` tuple in the import-free roles contract at `src/plugins/roles/shared.ts`; the client needs it to render options and identify unknown stored values. Each item is one of `db sqlite create`, `db sqlite delete`, `db sqlite query`, `db sqlite list`, `browser goto`, `browser content`, `browser eval`, `question ask`, and `question approve`. Add `src/acp/native-commands.ts` with `nativeCommandTool(command)` (returning the owning tool or `undefined`) and `isNativeCommand(command)`, importing the shared tuple. The database commands belong to `database`, the browser commands to `browser`, and the question commands to `question`. Do not import this core module from the concrete roles plugin: `eslint.plugin-boundaries.mjs:18-44` restricts concrete plugins to its listed host helpers, matching `ai/guidelines/plugins-tabs.md:117` (`Import boundaries and versioning`).
- A granted subcommand runs with any trailing arguments; do not narrow it by database, URL, or SQL statement.
- `Role.commands` is a required string array in the in-memory contract. A role's JSON `commands` field follows `description` and `entries`; a missing field decodes as `[]`. A non-array value or any non-string item drops the whole role and increments the existing dropped-role count from `src/plugins/roles/roles-file.ts:125-131` (`roles.json dropped … malformed … — showing the rest of this file.`). Preserve unknown strings and duplicate strings from hand-written files. A present empty array grants nothing.
- Add `nativeCommands: string[]` to `RolesPayload`, populated from `NATIVE_ACP_COMMANDS` in order. The payload guard requires an array containing only strings. Bump `ROLES_PAYLOAD_SCHEMA_VERSION` from 2 to 3 in `src/plugins/roles/shared.ts:1`; `src/plugins/roles/manifest.ts:16` already reads that constant. Update the intentionally literal client registration `roles: clientPlugin(2, ...)` at `web/src/plugins/registry.tsx:99` to schema 3 and retain the parity assertion in `web/src/plugins/registry.test.tsx:28-36`.
- Add `tell` directly after `ask` in `DEFAULT_ROLES`, with description `When you tell a model to carry out a task via ACP.` and the same entries as `ask`, in order: `opencode` / `opencode-go/deepseek-v4.1-flash` at `medium`, `claude` / `claude-haiku-4-5` at `high`, and `codex` / `gpt-6-luna` at `high`. The default `ask` grants exactly `db sqlite list`, `db sqlite query`, `browser goto`, `browser content`, `question ask`, and `question approve`. The default `tell` grants all nine commands. The other five defaults (`planning`, `research`, `code review`, `implementation`, and `documentation`) store empty command lists. Defaults are still written only when the roles tab creates a new file; ACP reads never create a file.
- `DEFAULT_ROLES` is the built-in default read by `src/acp/ask-role.ts:16-28` (`defaultAskEntries` and `askRoleEntries`). When a role is absent, later ACP lookup may use that built-in default. When a role exists with no `commands` key, it decodes to no grants even if its model entries fall back to defaults.
- `add-command` and `remove-command` each carry only a role and a string command; neither has an expected-list precondition. Define `AddCommandIntent`, `RemoveCommandIntent`, `isAddCommandIntent`, and `isRemoveCommandIntent` in the shared contract. Their guards validate the role and string shapes, not vocabulary membership, so unknown stored strings remain editable and later ACP execution can reject non-native commands. Re-adding an existing command or removing an absent one is accepted without changing role data or writing/publishing; removing a command deletes every copy. Other refusals use the existing refusal path from `src/plugins/roles/activate.ts:100-108` (`rejectRequest` and failed write).

## Existing code to reuse

- The tool ownership map and command grammars already exist in `src/acp/tool-table.ts:28-48` (`createAcpToolTable`), `src/browser/command.ts:102-104` (`BROWSER_PRIMER`), `src/question-command.ts:56-58` (`QUESTION_PRIMER`), and `src/database/primer.ts:8-11` (`DB_PRIMER`). Reuse their three tool owners; do not change their execution behavior in this subplan.
- `src/plugins/roles/roles-file.ts:27-65` (`DEFAULT_ROLES`), `:82-113` (`decodeRole` and `decodeRoles`), and `:188-195` (`writeRolesFile`) own the defaults, role decoding, and file writes. `src/plugins/roles/role-edits.ts:39-45` (`addRole`) creates user-added roles; its other edits spread the existing role and will preserve `commands`. `src/plugins/roles/ordered-json.ts:47-53` (`serializeRoles`) owns field serialization.
- `src/plugins/roles/activate.ts:59-80` (`payloadFrom` and `publish`) builds the payload; `:83-119` (`edit`) serializes write-then-publish edits; and `:136-180` registers the existing intents. Keep the new handlers on this edit path.
- `src/plugins/roles/shared.ts:1-35` holds the import-free payload, role, and intent types; `:125-141` (`isRolesPayload`) holds the payload guard. Keep this module import-free, as required by `ai/guidelines/plugins-tabs.md`.
- `product/specs/roles.md:17-39` documents the roles file, `:45-52` the current defaults, and `:140-148` partial decode and malformed-file behavior.

## Proposed changes

- Add `src/acp/native-commands.ts` with the owning-tool lookup and membership predicate over the vocabulary declared in `src/plugins/roles/shared.ts`. Keep relative imports in `src/` NodeNext form with `.js` extensions.
- Extend the role model, strict decode, ordered JSON write, and defaults in `src/plugins/roles/`. Initialize `commands: []` in `src/plugins/roles/role-edits.ts:39-45` (`addRole`). The configured `max-lines` rule at `eslint.config.mjs:62` skips blank lines and comments: `src/plugins/roles/roles-file.ts` currently has 159 counted lines and `src/plugins/roles/activate.ts` 161, so these additions fit without extraction; keep both under 200 counted lines rather than splitting modules preemptively.
- Extend `src/plugins/roles/shared.ts` with the ordered command tuple, role and payload fields, schema version 3, and guards for the payload and two new intents while keeping the module import-free. `activate.ts` reads the vocabulary from its sibling shared contract; it must not import the core native-command module.
- Register the two command edit handlers in the existing `activate.ts` intent map through its `edit` callback. Implement `addRoleCommand` and `removeRoleCommand` in `role-edits.ts`; return the original role-list reference for an already-satisfied request, and have `edit` skip write and publication only when the mutation returns that same list. All other changes preserve the serialized write-then-publish path and existing refusal behavior. No extra handler module is needed at the current counted line totals.
- Update typed fixtures for the required role and payload fields in `src/plugins/roles/roles-file.test.ts`, `src/plugins/roles/ordered-json.test.ts`, `src/plugins/roles/activate.test.ts`, `src/plugins/roles/shared.test.ts`, `web/src/plugins/roles/RolesTab.test.tsx`, and `web/src/plugins/roles/roles-dnd.test.tsx`.
- Update `product/specs/roles.md` for the persisted field, default roles and command grants, malformed values, unknown strings, duplicates, and no-op edit behavior.

## Tests

- `src/acp/native-commands.test.ts`: vocabulary order, owning-tool lookup, and native membership.
- `src/plugins/roles/shared.test.ts`: role and payload guards accept valid command data and reject non-string role command lists/items, non-array payload vocabularies, payload vocabularies containing non-strings, and malformed command intents; retain its check that `shared.ts` has no imports.
- `src/plugins/roles/roles-file.test.ts` and `src/plugins/roles/ordered-json.test.ts`: decode, write, and round-trip commands; verify missing field becomes `[]`, malformed field drops the role and increments the existing count, unknown strings and duplicates survive, serialization places `commands` after `entries`, and default role order, entries, and grants are exact.
- `src/plugins/roles/activate.test.ts`: published payload carries the vocabulary, added roles start with no grants, add/remove command intents write and republish through the existing queue, duplicate add and absent remove are accepted without a write, publication, or role-data change, remove deletes every copy, and refusal remains on the existing line.
- `web/src/plugins/registry.test.tsx`: the roles client schema literal remains equal to the shared version 3 constant.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after implementation changes and tests.
- Manual check with a fresh home directory: open `roles`, confirm the created `roles.json` has the seven default roles in order, with `tell` after `ask`, each role's `commands` after `entries`, and the specified ask/tell grants. Add a role and edit an existing role's description, then confirm the new role has `commands: []` and the existing grants survive the write. Hand-edit one role to give `commands` an invalid value, reopen `roles`, and confirm the malformed-role warning from `src/plugins/roles/roles-file.ts:130` appears and edits are refused through `src/plugins/roles/activate.ts:100-101` until the file is fixed.
- Confirm only the native-command helper, roles contract/persistence/intents, affected fixtures and tests, client schema literal/parity test, and roles spec are changed; no role UI or ACP execution behavior is implemented by this subplan.

## Out of scope

- Rendering or editing commands in the roles UI.
- Applying command grants to ACP tool execution.
- Adding the `tell` command or role-keyed ACP sessions.
