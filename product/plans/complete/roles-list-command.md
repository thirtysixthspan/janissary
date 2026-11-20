# Add a `roles list` command

**Complexity: 4/10** — ~60 added production lines across one new command module and three edited source files, five behavioral requirements, eight test scenarios (p=5.166).

`roles` is a bundled tab plugin command that opens the roles editor and refuses every argument with `Usage: roles`. Roles themselves are named entries in `roles.json`, each carrying model choices and a list of native ACP command grants. Agents running through `ask` and `tell` read those grants to decide what they may run, but there is no way to ask the app what roles exist and what each one is allowed to do without opening the tab or reading the file by hand.

## Goal

`roles list` prints every role with its enabled model choices and native command grants as pretty-printed JSON in the transcript. It is a native ACP command that the default `ask`, `tell`, `planning`, and `research` roles grant. Bare `roles` keeps opening the tab and every other argument keeps the existing `Usage: roles` refusal. Existing roles files are never rewritten by this change.

## Approach

Follow the `search transcript` pattern: register a built-in command named `roles` whose `match` accepts only the `roles list` form, leaving the bare word free for the plugin's own claim. `resolveCommand` walks core commands before plugin claims, and the plugin claim generator yields whenever a core command matches the same input, so `roles list` reaches the built-in while `roles` still opens the tab.

The built-in reads the effective roles file without creating one, reloads the model catalog, and reduces each role's entries to those whose harness still offers that model. It appends one transcript entry containing `JSON.stringify(result, null, 2)`. A pure helper builds the result value; only the command does I/O.

`roles list` joins `NATIVE_ACP_COMMANDS` so it can be granted, shown in the Commands tab, and offered by the roles picker. The default roles grant it to `ask`, `tell`, `planning`, and `research`; saved files stay untouched.

## Implementation steps

1. In `src/plugins/roles/shared.ts`, add `'roles list'` to `NATIVE_ACP_COMMANDS` just before `'subagent'`, keeping `subagent`, `tab`, and `notify` as the trailing entries the existing tests pin.
2. In `src/plugins/roles/default-roles.ts`, add `'roles list'` to the `commands` of `planning`, `research`, `ask`, and `tell`. Leave `code review`, `implementation`, `documentation`, and `user-interface` unchanged.
3. Add `src/commands/roles.ts`: a pure `rolesListing(roles, catalog)` helper returning `{ roles: [{ name, description, models, commands }] }` where `models` holds only entries whose harness/model is in the enabled catalog, plus a `Command` named `roles` matching `/^roles\s+list\b/i`, rejecting extra arguments with `Usage: roles list`, and appending the pretty JSON via `appendCommandOutput`. The command uses `homedir()` and `managers.tab.launchDir`, calls `readRolesFile(..., { create: false })` and `managers.models.reload()`, and builds the catalog from `HARNESS_NAMES` and `managers.models.modelsFor`.
4. In `src/commands/index.ts`, import and register the built-in before the plugin-derived claims. In `src/commands/forms.ts`, declare `roles` with the `roles list` form and parent so the application command inventory still lists the built-in when the roles plugin claim is absent.
5. Update `help/commands.md` with a `roles list` row in alphabetical order and `help/roles.md` with the new form, its output description, and an example.
6. Update `product/specs/roles.md`: extend the command section with `roles list` and the JSON shape, and bring the default-grant counts in line with the new vocabulary.
7. Update `documentation/user-documentation/tab-types/roles.md`: describe `roles list` where the `roles` arguments are documented and adjust the default-grant paragraph the change makes stale.

## Tests

- New `src/commands/roles.test.ts`: `resolveCommand('roles list')` selects the built-in while bare `roles` selects the plugin claim; output is pretty JSON with one role's enabled models and commands; an entry whose model is absent from the catalog is omitted; an empty roles file yields an empty `roles` array; `roles list extra` prints `Usage: roles list`; no roles file is created.
- `src/plugins/roles/roles-file.test.ts`: update the default-grant assertions for the new vocabulary count and the four roles that now grant `roles list`.
- `web/src/plugins/roles/RolesTab.test.tsx`: update the pinned native vocabulary count.
- `src/commands.test.ts`: add `roles: ['roles list']` to the fixed-subcommand table test.
- `$janissary/scripts/run.mjs check-diff` after each step.

## Specs and docs

- `product/specs/roles.md`, `help/commands.md`, `help/roles.md`, `documentation/user-documentation/tab-types/roles.md` as described above.

## Out of scope

- No new native tool category in `APPLICATION_COMMAND_NATIVE_TOOLS`; `roles list` uses the existing default tool mapping.
- No change to the roles tab's editing intents, the roles file format, or how `ask` and `tell` consume roles.
- No command that lists roles for a different project root or that writes a roles file.
