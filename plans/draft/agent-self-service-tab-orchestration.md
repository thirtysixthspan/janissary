# Agent-Facing Local API for Self-Service Tab Orchestration

## Summary

Extend the ACP tool loop so an agent running inside Janissary can issue a small set of safe, allow-listed Janissary built-in commands — spawning a new agent tab, sending it a message, opening a schedule, opening a file — with results fed back as tool output. This turns Janissary from a tool that hosts agents into one agents can use to coordinate each other, a natural extension of the `msg`/`broadcast` primitives that already exist for human-initiated cross-tab coordination.

## Decisions (to be confirmed with user)

1. **Allow-listed commands only.** The agent may use: `agent`, `msg`, `broadcast`, `schedule`, `open`, `files`, `close`. Each runs through the existing ACP auto-execute loop (`src/acp-loop.ts`), capped at the same step limit, with results fed back as context.
2. **No new transport.** Commands are issued by the agent through the same ACP session prompt/response cycle. The agent writes a natural-language instruction containing the command; the host extracts it via the existing `extractCommand` pattern, runs it, and appends the output to the agent's transcript.
3. **ACP priming, not hardcoded system prompt.** The ACP loop's existing priming system appends an `allowed commands` block to the system prompt listing the available Janissary built-ins and their syntax. The agent learns the available surface through the prompt, not through a fixed schema.
4. **Scope gating: agent tabs only.** The agent can only orchestrate tabs that belong to its own group. A `group` scope prevents one agent from interfering with another group's agents. Cross-group `broadcast` is rejected with an error in the tool output. The owner tab (the one running the agent) is always in scope.
5. **Tab creation caps.** Agent-initiated agent creation is capped: max 5 agent tabs per group (excluding the owner). Prevents runaway fork-bomb scenarios.

## Verified codebase facts that shape the design

- **ACP auto-execute loop already handles `db` and `browser`.** `src/acp-loop.ts` (`extractCommand` / `runCommand` callbacks) is the integration point. Adding new command types extends the existing `if (cmd.startsWith('db ')) { ... } else if (cmd.startsWith('browser ')) { ... }` chain.
- **Janissary commands route through `CommandRouter`.** `src/command-router.ts` dispatches parsed commands. The ACP loop already calls into the router for `db` and `browser`. Adding more commands follows the same pattern: parse (via existing `src/commands/*.ts` modules) → validate (group scope check, cap check) → dispatch → collect output → return as tool result.
- **Group membership is already tracked.** `Tab.group` carries the group number. `TabManager` has methods to enumerate tabs by group. Scope gating is a simple filter before dispatch.
- **Prompt handlers (ACP priming).** `src/acp-loop.ts` or `src/acp-manager.ts` provides priming text to the AI. Extending the primer with allowed-builtin syntax is a low-risk change.
- **`msg`/`broadcast` already exist as user commands.** `src/commands/msg.test.ts`, `src/commands/broadcast.test.ts`. The agent uses the same commands, parsed identically; the only difference is the invocation context (agent-initiated vs. user-typed).

## Proposed changes

### 1. ACP loop extension

- In `src/acp-loop.ts` / `src/acp-manager.ts`:
  - `extractCommand` callback: extend the recognition pattern to detect `agent`, `msg`, `broadcast`, `schedule`, `open`, `files`, `close` prefixed commands. Recognition is prefix-based (same as existing `db` / `browser`).
  - `runCommand` callback: add branches for each new command.
    - For `agent <name>`: call `AgentManager.createAgent()` with group scope enforcement and cap check. Return the created agent's label and number as output.
    - For `msg <agent> <message>`, `broadcast <message>`: parse via existing `ParsedMsg`, dispatch through `MessageHandler`, return confirmation.
    - For `schedule <spec>`: parse via existing `ScheduleParseResult`, dispatch through `ScheduleManager.addEntry()`, return the scheduled entry ID.
    - For `open <path>`, `files <path>`: dispatch through existing `OpenCommand` / `FileTreeManager`, return the opened tab label.
    - For `close <label>`: dispatch through existing `CloseCommand`, return confirmation.
  - All dispatches route through the same `CommandRouter` / existing command modules — no reimplementation.
- Group scope enforcement: new helper `isTabTargetInGroup(tab, targetGroup)`. For `msg` and `close`, enforces that the target tab is in the caller's group. For `broadcast`, restricts to same-group tabs.
- Cap enforcement: `canCreateAgentInGroup(group): boolean` checks `tabs.filter(t => t.group === group && t.view === 'agent').length < 5`.

### 2. ACP priming update

- In `src/acp-manager.ts` (or wherever the system prompt is assembled): in the "Available Commands" section after the `db` / `browser` entries, add a block:

  ```
  ## Janissary Tab Commands

  You may issue these Janissary built-in commands as part of your tool loop:

  - `agent <name>` — Create a new agent tab (max 5 per group). Returns the agent's label.
  - `msg <agent> <message>` — Send a message to another agent in your group.
  - `broadcast <message>` — Broadcast a message to all agents in your group.
  - `schedule add <spec>` — Schedule a timed command. See `specs/scheduling.md` for syntax.
  - `open <path>` — Open a file in an editor tab.
  - `close <label>` — Close a tab you created (must be in your group).

  Prefix each command with the command name so the system can route it correctly.
  ```

### 3. Output capture

- Each dispatched command produces output text (stdout equivalent). The ACP loop wraps it in a `tool_output` block and appends it to the agent's transcript as the next `LogEntry`. The existing transcript rendering handles this naturally — no new UI.

### 4. Safety guards

- `close` may not target the owner tab (the tab running the agent). Attempting to close oneself returns an error tool output.
- `agent` may not reuse an existing name; the server's existing duplicate-name rejection applies.
- All scheduling through the agent uses `in <target>` implicitly scoped to the issuing tab; the agent cannot schedule commands in other agents' tabs (this restriction mirrors the human `schedule` command's `in <tab>` targeting, which defaults to the issuer).

### 5. Specs

- New `specs/agent-tool-loop.md`: allowed commands, group scoping, cap limits, priming text, output format, safety guards.
- `specs/acp.md`: cross-reference the extension for Janissary built-ins in the "Tool Loop" section.
- `specs/messaging.md`: note that agents can now originate `msg`/`broadcast` (currently only humans).

### 6. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/acp-loop.test.ts`: `extractCommand` recognizes the new prefixes; `runCommand` dispatches each correctly; group scope rejection (cross-group `msg`); cap rejection (6th agent); self-close rejection.
- `src/commands/msg.test.ts`, `src/commands/broadcast.test.ts`: existing tests unchanged — the commands are parsed identically regardless of invocation source.
- `src/commands/schedule.test.ts`: verify agent-initiated schedule entries are scoped to the issuing tab.
- Integration test: a mock ACP session issues `agent helper`, verifies a new tab appears, then issues `msg helper hello`, verifies the message lands in the target's transcript.

## Implementation order

1. ACP loop extension: `extractCommand` + `runCommand` branches for the new commands, tests.
2. Group scope + cap helpers: `isTabTargetInGroup`, `canCreateAgentInGroup`, tests.
3. ACP priming text update: system prompt block for Janissary built-ins.
4. Safety guards: self-close rejection, implicit scheduling scoping, tests.
5. Specs: new `agent-tool-loop.md` + amendments to acp, messaging.
6. Public documentation.

Run `./scripts/run.mjs check-diff` after each step.
