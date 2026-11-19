# Add `notify` as a grantable native ACP command

**Complexity: 6/10** — ~28 production lines across 6 existing files, 8 requirements, 18 test scenarios, one new primer module (p=5.82)

`notify <message>` is already a typed application command that pushes a custom line into the notifications feed, but it is absent from the native ACP command vocabulary. That means a role cannot grant it, an `ask` or `tell` agent is never told it exists, and a `notify` line an agent emits is treated as prose instead of a command. This change makes `notify` a first-class native ACP command on the same footing as `subagent`: it joins the ordered vocabulary, gets its own tool owner and primer, and is granted by the built-in `ask` and `tell` roles so agents can signal the user proactively.

## Design decisions

- **Vocabulary entry.** `notify` is appended to `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` after `subagent`, making nineteen native commands. The payload shape does not change, so `ROLES_PAYLOAD_SCHEMA_VERSION` stays at 4. Adding the name gives the Commands tab a `notify` native row and the Roles tab a `notify` grant option through the existing vocabulary-driven inventory.
- **Default grants.** The built-in `ask` and `tell` roles in `src/plugins/roles/roles-file.ts` both grant `notify`: `ask` goes from eleven to twelve commands, `tell` from eighteen to nineteen and still grants every native command. Saved roles files are not migrated, so an existing `ask` or `tell` keeps exactly the grants it lists and gains no implicit `notify`.
- **Own tool owner.** `notify` is a one-word command, like `subagent`, so it needs its own native tool owner rather than folding into `question`, `file`, or another group. `APPLICATION_COMMAND_NATIVE_TOOLS` gains `notify`, and `nativeCommandTool` maps the canonical `notify` name to it. This keeps the native-recognition and tool-table matchers in parity and gives the Commands tab an accurate native tool marker.
- **Agent call grammar and primer.** A new `src/notifications/primer.ts` holds `NOTIFY_PRIMER` and a pure `isNotifyCommandLine(line)` predicate, mirroring `src/subagent/primer.ts`. The primer tells the agent to end a reply with one `notify <message>` line to push a message into the notifications feed. The predicate matches a trimmed line whose first word is `notify`, case-insensitively, and nothing else; `src/commands/notify.ts` reuses it for its command `match` so the typed and tool paths share one recognizer.
- **Tool table.** `createAcpToolTable` gains a `notify` entry with `runsOn: 'caller'` (it runs on the host that owns the tab, like `question`), `match` driven by `nativeCommandTool(command) === 'notify'`, and `isCommandLine` driven by `isNotifyCommandLine`. It is placed before the `database` fall-through so `gateCommand` resolves a `notify` line to it.
- **Authorization and behavior unchanged.** The core gate keeps granting or refusing `notify` by its native name (`Command not allowed for role "<role>": notify.` or `Command is disabled: notify.`), and the typed command keeps its existing usage error and drop-if-closed semantics. The change is about reachability and grants, not new notification behavior.
- **Agent runs.** A harness agent session (`kind: 'agent'`) still refuses `notify` through `gateAgentCommand`: the canonical command is not a file-read line, so it returns `runsOn: 'caller'` today, but this change does not grant it to agent runs. The built-in role sessions (`kind: 'core'`) are the intended callers.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How `notify` uses it |
| --- | --- | --- |
| Native vocabulary | `src/plugins/roles/shared.ts` (`NATIVE_ACP_COMMANDS`) | Gains `notify`, which drives native rows, grants, and the Commands tab. |
| Native tool union | `src/shared/application-commands.ts` (`APPLICATION_COMMAND_NATIVE_TOOLS`) | Gains the `notify` owner for the native row marker. |
| Native recognition | `src/acp/native-commands.ts` (`nativeCommandName`, `nativeCommandTool`) | Maps `notify` to its owner; membership comes from the vocabulary. |
| ACP tool table | `src/acp/tool-table.ts` (`createAcpToolTable`, `toolExtractor`, `gateCommand`) | Gains one `notify` tool entry; gating and extraction are unchanged. |
| Primer pattern | `src/subagent/primer.ts` | Model for the `notify` primer module and line predicate. |
| Typed command | `src/commands/notify.ts` | Already dispatches `notify <message>`; reuses the new line predicate for its match. |
| Default roles | `src/plugins/roles/roles-file.ts` (`DEFAULT_ROLES`) | Adds `notify` to the built-in `ask` and `tell` grants. |

## Proposed changes

- `src/plugins/roles/shared.ts`: append `notify` to `NATIVE_ACP_COMMANDS`.
- `src/shared/application-commands.ts`: add `notify` to `APPLICATION_COMMAND_NATIVE_TOOLS`.
- `src/acp/native-commands.ts`: return `notify` from `nativeCommandTool` when the canonical name is `notify`.
- `src/notifications/primer.ts` (new): export `NOTIFY_PRIMER` and `isNotifyCommandLine(line)` as above.
- `src/commands/notify.ts`: use `isNotifyCommandLine` for the command `match`, replacing the inline regex.
- `src/acp/tool-table.ts`: import the new primer and predicate, and add the `notify` tool entry ahead of `database`.
- `src/plugins/roles/roles-file.ts`: add `notify` to the `ask` and `tell` command lists.

## Tests

- `src/notifications/primer.test.ts` (new): the primer text verbatim; `isNotifyCommandLine` accepts `notify`, `notify hello`, mixed case, and leading whitespace, and rejects `notifies`, `notify-x`, a leading slash, and other command words.
- `src/acp/native-commands.test.ts`: add `notify` to the vocabulary-order assertion; map `notify` to its owner; keep the parity assertion passing (exactly one owned tool for `notify`); add `notify-x` to the near-miss rejection list.
- `src/acp/tool-table.test.ts`: a `notify`-only grant yields the notify tool with its primer; the full grant's primer includes the notify text and the allow-list line lists `notify`; `toolExtractor` pulls a trailing `notify` line and not a near-miss; `gateCommand` returns `runsOn: 'caller'` when granted, the role refusal when not granted, and the disabled refusal when its row is off.
- `src/plugins/roles/roles-file.test.ts` and `src/acp/ask-role.test.ts`: built-in `ask` grants twelve and `tell` grants nineteen native commands including `notify`; `NATIVE_ACP_COMMANDS` length is nineteen; a saved roles file is left untouched.
- `src/application-commands.test.ts`: a native `notify` row with no parent and the `notify` native tool, and typed resolution of `notify hello` to it.
- `src/commands/notify.test.ts`: typed `notify` still records the message and prints the usage line for a bare command.
- `web/src/plugins/roles/RolesTab.test.tsx`: the native vocabulary count is nineteen where pinned.

## Specs, help, and user documentation

- `product/specs/roles.md`: update the default `ask` and `tell` grant lists and counts to include `notify` and nineteen native commands.
- `product/specs/application-commands.md`: note the native `notify` row and its tool owner.
- `product/specs/acp.md`: document the `notify` native command, its primer, and its caller-side loop behavior.
- `product/specs/notifications.md`: note that an agent can push a manual notification through the granted `notify` command.
- `help/ask.md` and `help/roles.md`: list `notify` among the default grants. `help/tell.md`: update from eighteen to nineteen and name `notify`. Update `documentation/user-documentation/tab-types/roles.md` where it pins the default grants and count.

## Out of scope

- No change to notification delivery, alert defaults, or the drop-if-closed behavior of `notify`.
- No migration of existing roles files.
- No new harness function-calling tool, MCP server, or JSON argument form.
- No change to agent-run (`kind: 'agent'`) permissions or to any other native command.
