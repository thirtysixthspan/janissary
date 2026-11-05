# Rename the `acp` command to `ask`

Issue: rename the 'acp' command to the 'ask' command

Complexity rating: 3/10

## Goal

The command a shell (or another tab plugin that requests `promptAcp`) uses to query its core ACP connection is typed `acp <prompt>`, and its reset form is `acp reset`. Rename the user-facing command to `ask <prompt>` and `ask reset`. The command word changes everywhere a user types it, sees it in usage and confirmation text, or reads it in help, specs, and user documentation. The underlying ACP service, its connection kind (`acp:<name>` in `connections`), record titles (`ACP: …`), and the `ACP …` status/error wording stay as they are, since those name the protocol and the connection, not the command.

## Approach

- The two registry entries move from `src/commands/acp.ts` / `src/commands/acp-reset.ts` to `src/commands/ask.ts` / `src/commands/ask-reset.ts`, named `ask` and `ask-reset`, matching `/^ask\b/i` and `/^ask\s+reset\b/i`. `ask-reset` still precedes `ask` in the registry so the priority check stays clean.
- No `acp` alias is kept: the issue asks for a rename, and the registry's one-definition-per-command rule (architecture principle 5) argues against a shadow name. A bare `acp` line becomes an unknown command like any other.
- `AcpManager.run` strips the command word before sending the prompt; its prefix becomes `ask`, and its usage refusal becomes `Usage: ask <prompt>.`.
- The plugin ACP capabilities (`promptAcp`, `promptAcpResult`) prefix the plugin's prompt with the command word so the manager's strip leaves the prompt intact; that prefix becomes `ask `.
- The `resetAcp` client RPC dispatches the reset command by name; it dispatches `ask-reset` / `ask reset`.
- The reset confirmation becomes `ACP session reset — next ask prompt will start fresh.`.
- The `help/acp.md` page becomes `help/ask.md`, and the `help/commands.md` row is renamed and moved to its alphabetical place.

## Implementation steps

1. Rename `src/commands/acp.ts` → `src/commands/ask.ts` (name `ask`, match `/^ask\b/i`, samples `ask`, `ask bob`) and `src/commands/acp-reset.ts` → `src/commands/ask-reset.ts` (name `ask-reset`, match `/^ask\s+reset\b/i`, samples `ask reset`, `ask reset bob`, confirmation wording). Update `src/commands/index.ts` imports, list entries, and its ordering comment.
2. `src/acp/manager.ts`: strip `^ask\b` and report `Usage: ask <prompt>.`.
3. `src/plugins/acp-capabilities.ts`: prefix prompts with `ask `.
4. `src/message/tabs.ts`: `resetAcp` executes `ask-reset` with `ask reset`.
5. `src/commands.ts`: update the comment listing the former `getOutput` names.
5a. `src/tab/background-replies.ts`: the token that decides which background replies carry their typed line (so the shell can place the reply under the echoed command) mirrors the command's match; it becomes `/^\s*\/?ask\b/i`. Found during implementation; the shell placement tests for reset caught it.
6. Tests: rename `src/commands/acp.test.ts` → `ask.test.ts` and `acp-reset.test.ts` → `ask-reset.test.ts` with the new name, matching, and wording, plus a case asserting a bare `acp` line no longer matches. Update `src/commands/commands.test.ts`, `src/commands/resolve.test.ts`, and the ACP manager/record/plugin-session tests whose inputs carry the `acp` command prefix or assert the usage text (`src/acp/manager.test.ts`, `src/acp/record-feed.test.ts`, `src/acp/plugin-session.test.ts`). Check `src/message/` tests for the reset dispatch. Update `src/tab/background-replies.test.ts` and `src/tab/view.test.ts` for the new line token, and the `acp …` fixture inputs in `src/tab/index.test.ts`, `src/tab/transcript/events.test.ts`, and a comment in `src/remote/channel/index.test.ts`.
7. Specs, help, and user documentation (below).

## Tests

- `ask` command: name, case-insensitive matching of `ask …`, no match for `acp …`, background reply behaviour unchanged.
- `ask-reset` command: name, matching of `ask reset` variants, no match for bare `ask`, `ask resume`, `ask <prompt>`, or `acp reset`; the new confirmation wording.
- `resolveCommand('ask summarize this repo')` resolves to the `ask` app command; the formerly-silent list includes `ask summarize`.
- ACP manager: bare `ask` reports `Usage: ask <prompt>.`; `ask hello` sends `hello`.
- Background replies: an `ask …` input keeps its line; a former `acp …` input does not.
- `resolveCommand` classifies `acp …` and `acp reset` as unknown commands.
- The registry priority walk (`src/commands.test.ts`) continues to pass with the renamed entries.

## Out of scope

- The `acp:<name>` connection kind, `connections close acp:<name>`, `ACP:` record titles, and `ACP …` status and error text.
- Internal names (`AcpManager`, `managers.acp`, `acpAvailable`, `resetAcp` RPC, `promptAcp` capability, file names under `src/acp/`).
- The `ask` role and model fallback, and the `harness-models.json` rename (separate backlog issues).
- Web test fixtures that use `acp …` merely as an arbitrary dispatched line; the client does not interpret the command word.
- The synthetic fixtures in `src/commands/priority.test.ts`, which test the priority walk with made-up entries.

## Specs and docs

- `product/specs/acp.md`, `product/specs/shell-tab.md`, `product/specs/connection.md`, `product/specs/connections-tab.md`, `product/specs/notifications.md`, `product/specs/remote-server.md`, `product/specs/tab-plugins.md`: the command word becomes `ask`.
- `help/commands.md` row and `help/acp.md` → `help/ask.md`.
- `documentation/user-documentation/advanced-agents/acp-agent.md`, `getting-started/tabs.md`, `advanced-agents/remote-agents.md`, `advanced-agents/markdown-rendering.md`, `advanced-agents/agent-questions.md`, `tab-types/notifications.md`, `command-bar/connections.md`, `command-bar/shell.md`: references to the command become `ask`.
