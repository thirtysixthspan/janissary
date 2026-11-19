# Add `tab` as a native ACP command with a default `user-interface` role, and limit `help` to the commands table

**Complexity: 6/10** — ~60 added lines, 8 existing production files, 5 requirements, 18 scenarios, 2 new units (p=5.79); extends the existing native-command and help-page patterns rather than adding architecture.

`tab <form>` is an ordinary application command that arranges tabs, but it is not in the native ACP command vocabulary: no role can grant it, an agent is never told it exists, and a `tab` line an agent emits is read as prose instead of a command. This change makes `tab` a first-class native command on the same footing as `notify` — its own vocabulary entry, native tool owner, primer and line recognizer — and adds a built-in `user-interface` role that grants it by default so an agent can be asked to arrange the interface. Separately, bare `help` and `help commands` currently print the whole `help/commands.md` file, which includes trailing prose and a detailed `commands` section; the spec says they print only the alphabetical commands table, so this change makes the output match.

## Design decisions

- **Vocabulary entry.** `'tab'` is appended to `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts`, making twenty native commands. The payload shape is unchanged, so `ROLES_PAYLOAD_SCHEMA_VERSION` stays at 4. The vocabulary drives the Commands tab's native row and the Roles tab's grant picker.
- **Own tool owner.** `tab` is a one-word command with subcommands and arguments, like `subagent` and `notify`, so it needs its own native tool owner rather than folding into `question`, `file`, or the database fall-through. `APPLICATION_COMMAND_NATIVE_TOOLS` gains `'tab'` and `nativeCommandTool` maps the canonical name to it, keeping native recognition and the tool table in parity.
- **Agent call grammar and primer.** A new `src/commands/tab-primer.ts` holds `TAB_PRIMER` and a pure `isTabCommandLine(line)` predicate, mirroring `src/notifications/primer.ts`. The predicate matches a trimmed line whose first word is `tab`, case-insensitively, so a bare or malformed form is extracted as one tool step and answered by the command's own usage line rather than being mistaken for a final answer. `src/commands/tab.ts` reuses the predicate for its `match`.
- **Tool table.** `createAcpToolTable` gains a `tab` entry with `runsOn: 'caller'` (executed on the host that owns the tab, like `question`), `match` driven by `nativeCommandTool(command) === 'tab'`, and `isCommandLine` driven by `isTabCommandLine`. It is placed before the `database` fall-through so `gateCommand` resolves a `tab` line to it. Authorization text and command behavior are unchanged.
- **Preserve built-in `tab` forms.** Adding a native row named `tab` would otherwise suppress the built-in `tab` command's fixed-form rows (`tab focus` … `tab undock`) in the application-command inventory. `buildApplicationCommands` keeps those child rows and drops only the colliding parent row, so the Commands table, completion, and the spec's one-row-per-form contract stay intact.
- **New default role.** `DEFAULT_ROLES` in `src/plugins/roles/roles-file.ts` gains `user-interface` after `tell`, with the same three model entries as `ask` and `tell` and a `commands` list granting `tab`. This makes eight default roles. Saved roles files are not migrated: an existing file gains no new role, and an existing `tell` keeps exactly the grants it lists (now up to twenty native commands rather than nineteen). No ACP role code changes: a stored role is resolved by name through the existing reader and can be launched with `subagent --role user-interface`.
- **Help output.** A new pure `readCommandTable(directory)` in `src/help-pages.ts` reads the `commands` page and returns only its markdown table (from `### Commands` through the last table row), dropping trailing prose and the `### commands` section. `src/commands.ts` uses it for bare `help` and `help commands`; named pages and the unreadable/missing fallbacks are untouched.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this change uses it |
| --- | --- | --- |
| Native vocabulary | `src/plugins/roles/shared.ts` | Gains `tab`, driving rows, grants, and the Roles picker. |
| Native tool union | `src/shared/application-commands.ts` | Gains the `tab` owner for the native row marker. |
| Native recognition | `src/acp/native-commands.ts` | Maps `tab` to its owner. |
| ACP tool table | `src/acp/tool-table.ts` | Gains one `tab` tool entry; gating and extraction are unchanged. |
| Primer pattern | `src/notifications/primer.ts`, `src/subagent/primer.ts` | Model for the `tab` primer module and line predicate. |
| Default roles | `src/plugins/roles/roles-file.ts` | Gains the `user-interface` role with a `tab` grant. |
| Help-page reader | `src/help-pages.ts`, `src/commands.ts` | Gains one table-only reader; the existing reader still serves named pages. |

## Proposed changes

- `src/plugins/roles/shared.ts`: append `'tab'` to `NATIVE_ACP_COMMANDS`.
- `src/shared/application-commands.ts`: add `'tab'` to `APPLICATION_COMMAND_NATIVE_TOOLS`.
- `src/acp/native-commands.ts`: return `'tab'` from `nativeCommandTool` for the canonical `tab` name.
- `src/commands/tab-primer.ts` (new): export `TAB_PRIMER` and `isTabCommandLine`.
- `src/commands/tab.ts`: use `isTabCommandLine` for the command `match`.
- `src/acp/tool-table.ts`: import the new primer and predicate; add the `tab` tool entry ahead of `database`.
- `src/application-commands.ts`: keep built-in fixed-form rows of a command whose bare name is native, dropping only the parent row.
- `src/plugins/roles/roles-file.ts`: add the `user-interface` default role with the `tab` grant. The extra role pushes the file past the 200-line limit, so the existing `DEFAULT_ROLES` data moves unchanged into a new `src/plugins/roles/default-roles.ts` and the handful of importers are pointed at its defining module.
- `src/help-pages.ts`: add `readCommandTable`.
- `src/commands.ts`: route bare `help` and `help commands` through `readCommandTable`.

## Tests

- `src/commands/tab-primer.test.ts` (new): the primer text and `isTabCommandLine` accepting bare, argument-bearing, mixed-case, and leading-whitespace forms while rejecting near misses and other command words.
- `src/acp/native-commands.test.ts`: add `tab` to the vocabulary-order assertion; map `tab` to its owner; keep the one-owned-tool parity assertion passing; add `tabs` to the near-miss list.
- `src/acp/tool-table.test.ts`: import `TAB_PRIMER`; add it to the full-primer order and caller-side `runsOn` order; assert a `tab`-only grant yields the tab tool; `toolExtractor` pulls a trailing `tab` line; `gateCommand` returns `caller` when granted, the role refusal when not, and the disabled refusal when its row is off.
- `src/application-commands.test.ts` and `src/application-commands.claims.test.ts`: a parentless native `tab` row with tool `tab` while the built-in `tab focus`…`tab undock` rows remain, and typed resolution of `tab focus notes`.
- `src/plugins/roles/roles-file.test.ts` and `src/acp/ask-role.test.ts`: eight default roles including `user-interface` with a `tab` grant; `NATIVE_ACP_COMMANDS` length is twenty; `tell` grants every native command; a saved roles file is left untouched.
- `web/src/plugins/roles/RolesTab.test.tsx`: update the pinned native vocabulary count to twenty.
- `src/help-pages.test.ts`: `readCommandTable` returns only the table, leaves a table-only page unchanged, and propagates the unreadable result.
- `src/commands.test.ts`: bare `help` and `help commands` are identical, start with `### Commands`, contain table rows, and contain neither the trailing prose nor the `### commands` section; existing page, missing-page, and ordering tests still pass.

## Specs, help, and user documentation

- `product/specs/roles.md`: twenty native commands, the new eighth default role and its `tab` grant, and the updated `tell` count.
- `product/specs/application-commands.md`: twenty native commands and the `tab` native row/owner, plus an explicit statement that bare `help` prints only the commands table.
- `product/specs/acp.md`: the `tab` native command, its primer, caller-side loop behavior, and the `user-interface` role.
- `help/roles.md`, `help/tell.md`, `help/ask.md`, `help/tab.md`: mention the new role, the twenty-command default, and the agent-callable `tab` form.
- `documentation/user-documentation/tab-types/roles.md`: eight defaults including `user-interface`, and twenty native commands where the count is pinned.

## Out of scope

- No change to tab arrangement behavior, its usage lines, or its notifications.
- No migration of existing roles files and no change to `ask`/`tell` default grants beyond the vocabulary size.
- No new harness function-calling tool or JSON argument form for `tab`.
- No change to named help pages, key bindings, or the disabled-command policy.
