# Agent-Facing Local API for Self-Service Tab Orchestration

**Complexity: 6/10** — new subsystem (agent-issued command dispatch with group scoping and creation caps) spanning `acp-manager.ts`, a new extraction/primer module, and a genuine landmine in `ProfileManager.newAgent` (tab-creation attribution) that the implementation must work around; many touched files but the dispatch mechanism itself is reused, not built from scratch.

## Summary

Extend the ACP tool loop so an agent running inside Janissary can issue a small set of safe, allow-listed Janissary built-in commands — spawning a new agent tab, sending it a message, opening a schedule, opening a file — with results fed back as tool output. This turns Janissary from a tool that hosts agents into one agents can use to coordinate each other, a natural extension of the `msg`/`broadcast` primitives that already exist for human-initiated cross-tab coordination.

## Decisions (to be confirmed with user)

1. **Allow-listed commands only.** The agent may use: `agent`, `msg`, `broadcast`, `schedule`, `open`, `files`, `close`. Each runs through the existing ACP auto-execute loop (`src/acp-loop.ts`), capped at the same step limit (`maxSteps`, default 8, set via `AcpLoopDeps.maxSteps` — see `runAcpToolLoop` in `src/acp-loop.ts:15-21`), with results fed back as context.
2. **No new transport.** Commands are issued by the agent through the same ACP session prompt/response cycle. The agent writes a natural-language instruction containing the command; the host extracts it via the existing extraction pattern (see below), runs it, and appends the output to the agent's transcript.
3. **ACP priming, not hardcoded system prompt.** `AcpManager.run()` (`src/acp-manager.ts:104-108`) already composes the primer it hands to `runAcpToolLoop` from `this.managers.database.primer` and `BROWSER_PRIMER`. A new `JANISSARY_TAB_PRIMER` constant is added to that same string concatenation, listing the available Janissary built-ins and their syntax. The agent learns the available surface through the prompt, not through a fixed schema.
4. **Scope gating: agent tabs only.** The agent can only orchestrate tabs that belong to its own group. A `group` scope prevents one agent from interfering with another group's agents. Cross-group `broadcast` is rejected with an error in the tool output. The owner tab (the one running the agent) is always in scope.
5. **Tab creation caps.** Agent-initiated agent creation is capped: max 5 agent tabs per group (excluding the owner). Prevents runaway fork-bomb scenarios.
6. **Focus side effect of `agent`, accepted.** Dispatching an agent-issued `agent <name>` command necessarily flips `TabManager`'s active tab to the issuing tab for the duration of the call (see "Landmine: `ProfileManager.newAgent` ignores its `tab` argument" below), then restores whatever was active before. This means a human watching the UI may see a brief focus flicker to the tab whose agent just created a sub-agent. This is accepted as the cost of reusing `ProfileManager.newAgent` unmodified — rewriting it to take an explicit creator tab is out of scope for this plan (see "Out of scope").

## Verified codebase facts that shape the design

- **`src/acp-loop.ts` has no per-command chain.** `runAcpToolLoop` (`src/acp-loop.ts:15-68`) is pure and generic: it calls `dependencies.extractCommand(buffer)` and, if a command is found, `dependencies.runCommand(command)` (`src/acp-loop.ts:43,50`), awaiting the result if it's a `Promise`. There is no `startsWith('db ')`/`startsWith('browser ')` chain in this file — do not add one here.
- **The `db`/`browser` composition lives in `AcpManager.run()`, not `acp-loop.ts`.** `src/acp-manager.ts:104-108`:
  ```
  runCommand: (c) => (/^browser\b/i.test(c) ? this.managers.browser.run(label, c) : this.managers.database.runInTab(label, c)),
  extractCommand: (t) => extractBrowserCommand(t) ?? this.managers.database.extract(t) ?? null,
  ```
  This is the actual integration point. Extending to the seven new commands means adding one more branch to `runCommand` and one more `??` alternative to `extractCommand`, following this exact shape.
- **There is no `CommandRouter` class.** `src/command-router.ts` exports only `resolveUnknownCommand`, which disambiguates an unrecognized/ambiguous typed command (e.g. a bare `db` command when multiple databases are open) into a routed one — it is not a general dispatcher and is unrelated to this plan.
- **The real reusable dispatcher is `CommandManager.dispatchTo(label, text)`** (`src/command-manager.ts:36-40`). It runs the exact same resolve → find-by-name → `run(command, {label,index}, managers)` pipeline used for human-typed commands (via `resolveCommand` in `src/resolve.ts` and the `commands` registry in `src/commands/index.ts`), and each command module writes its own output via `managers.tab.append(label, {...})`. All seven allow-listed commands (`agent`, `msg`, `broadcast`, `schedule`, `open`, `files`, `close`) are already registered there — reuse this pipeline verbatim rather than hand-parsing/dispatching each command type as the "Proposed changes" section below now describes.
- **Output capture already has a working precedent: `CaptureManager`** (`src/capture-manager.ts`), built for the remote-agent capture path. `CaptureManager.run(label, text, callback)` matches the command, calls `this.managers.command.executeCommand(c.name, trimmed, label, index)` (the same underlying primitive `dispatchTo` uses), then diffs `tab.log.length` before/after and passes the newly appended entry's `output` string to `callback` (`src/capture-manager.ts:31-45`). This is exactly the "run a Janissary command and get its output back as a string" primitive the ACP `runCommand` callback needs — reuse this pattern (or call `managers.capture.run` directly) instead of writing new per-command output plumbing.
- **Landmine: `ProfileManager.newAgent` ignores its `tab` argument.** `src/commands/agent.ts`'s `run` handler is `(command, context, managers) => { managers.profile.newAgent(command); }` — the tab `context` (which would carry the issuing label) is discarded. `ProfileManager.newAgent` (`src/profile-manager.ts:33-62`) instead uses `this.managers.tab.cur()` (the UI's globally *active* tab) as `creator`, and derives both the new tab's `group` (`creator?.group ?? 1`) and the destination of its confirmation output (`out` appends to `creator.label`) from that. Concretely: if an ACP agent running in a background (non-focused) tab issues `agent helper`, the created tab inherits the *active* tab's group (not the issuing agent's group) and its confirmation text is appended to the *active* tab's transcript (not the issuing tab's) — `CaptureManager`'s before/after log-length diff on the issuing `label` would see no new entry and return an empty string. **Decision:** before dispatching an `agent`-prefixed command, the new `runCommand` branch must snapshot `managers.tab.activeTab`, call `managers.tab.setActiveTab(managers.tab.findIndex(issuingLabel))`, run the command, then restore the previous `activeTab`. This makes `tab.cur()` resolve to the issuing tab for the duration of the call, so the new agent lands in the correct group and its confirmation output is captured correctly. `setActiveTab`/`activeTab` already exist on `TabManager` (used the same way in `profile-manager.ts:57` and `command-manager.ts:33`).
- **No group-enumeration helper exists.** `Tab.group`/`Tab.groupColor` (`src/types.ts`) are plain fields; `TabManager` has no "tabs in group N" method. Scope gating and the creation cap must filter `managers.tab.tabs` directly — e.g. `managers.tab.tabs.filter((t) => t.group === group)` — mirroring how `broadcast`'s existing target resolution already filters `managers.tab.allLabels()` (`src/commands/broadcast.ts:11`) rather than calling a group helper that doesn't exist.
- **Agent-tab identification: `view === undefined`, not `view === 'agent'`.** Per `src/types.ts:52-54`, ordinary agent tabs leave `Tab.view` **undefined**; `'agent'` is not a value `view` ever takes (the documented values are `'agent' | 'image' | 'page' | 'harness' | 'markdown' | 'editor' | 'monitor' | 'files'`, and despite `'agent'` appearing in that union, `newAgent` never sets it — `makeTab` leaves `view` unset for ordinary agent tabs). **Decision:** the cap check (`canCreateAgentInGroup`) must count `managers.tab.tabs.filter((t) => t.group === group && t.view === undefined)`, excluding the owner tab from the count as stated in Decision 5. A filter on `t.view === 'agent'` would always count zero tabs and the cap would never trigger — this must not ship as written in the original draft.
- **`msg`/`broadcast` dispatch through `AgentCommunicationManager` (`managers.communication`), not `MessageHandler`.** No `MessageHandler` type exists in the codebase; the correct name, confirmed in `src/managers.ts:25` and used directly in `src/commands/msg.ts`/`src/commands/broadcast.ts`, is `AgentCommunicationManager`. Since dispatch now goes through `CommandManager`/`CaptureManager` rather than being hand-rolled, this detail only matters if a future reader greps for `MessageHandler` and finds nothing — it does not appear anywhere in the implementation.
- **`agent`, `msg`, `broadcast`, `schedule`, `open`, `files`, `close` all already exist as user commands**, each a `Command` (`src/commands/types.ts`) registered in `src/commands/index.ts`: `src/commands/agent.ts`, `msg.ts`, `broadcast.ts`, `schedule.ts`, `open.ts`, `files.ts`, `close.ts`. `msg`/`broadcast`/`schedule`/`open`/`files`/`close` all correctly use the `tab`/`context.label` passed to `run`, so only `agent` needs the active-tab workaround above.

## Proposed changes

### 1. ACP loop extension

- New module `src/janissary-command.ts` (mirrors the shape of `src/browser-command.ts`), exporting:
  - `JANISSARY_TAB_COMMAND_PREFIXES = ['agent', 'msg', 'broadcast', 'schedule', 'open', 'files', 'close']`.
  - `extractJanissaryTabCommand(text: string): string | null` — same bottom-up, code-fence/prompt-marker-tolerant line scan as `extractBrowserCommand` (`src/browser-command.ts:86-93`), matching a line whose first word (case-insensitive) is one of the prefixes above.
  - `JANISSARY_TAB_PRIMER: string` — the primer block (content below), built the same way `BROWSER_PRIMER` is (`src/browser-command.ts:99-108`).
- In `src/acp-manager.ts:104-108`, extend the existing composition (do not touch `src/acp-loop.ts`, which is generic and command-agnostic):
  - `extractCommand`: add `extractJanissaryTabCommand(t)` as a third `??` alternative after the existing `database.extract` call.
  - `runCommand`: add a branch, checked before the existing `browser`/`database` fallback, that recognizes a Janissary-tab-prefixed command and calls a new `runJanissaryTabCommand(label, command, this.managers)` helper (new function, colocated in `src/janissary-command.ts` or a sibling `src/janissary-tab-orchestration.ts` if it grows past the 200-line file limit — see the file-size note in "Implementation order").
- `runJanissaryTabCommand(label, command, managers)` behavior, in order:
  1. **Pre-dispatch validation** (rejects without touching `CommandManager` on failure, returning an error string as the tool output):
     - For `msg <agent> <message>`: parse the target name with the existing `parseMsgCommand` (`src/messaging.ts`, already used by `src/commands/msg.ts`); look up the target tab in `managers.tab.tabs`; if its `group` differs from the issuing tab's `group`, return `Agent "<target>" is not in your group.` without dispatching.
     - For `broadcast <message>`: parse with the existing `parseBroadcastCommand`; restrict the effective target list to tabs sharing the issuing tab's `group` (same filtering shape as `broadcast.ts`'s own `targets === 'all'` case, but additionally filtered by group) before handing off — this means `runJanissaryTabCommand` cannot just forward the raw command text; it must rewrite it to an explicit same-group target list (or dispatch per-target via repeated `msg`-shaped calls) since `CommandManager`/`broadcast.ts` has no group concept of its own.
     - For `close <label>`: parse with the existing `parseClose` (`src/commands/close.ts:11-17`); reject if the resolved target is the issuing tab itself (`Cannot close your own tab.`) or if the target's `group` differs from the issuing tab's `group`.
     - For `agent <name>`: compute the issuing tab's live agent-sibling count as `managers.tab.tabs.filter((t) => t.group === issuingGroup && t.view === undefined && t.label !== issuingLabel).length` — the `t.label !== issuingLabel` filter is required because the issuing (owner) tab is itself an ordinary agent tab with `view === undefined`, so it would otherwise count itself as one of its own siblings. If the count is `>= 5`, return `Group agent limit (5) reached.` without dispatching.
     - `schedule`, `open`, `files` need no group check per Decisions — `schedule` already implicitly scopes to the issuing tab (`resolveTargetTab`'s default in `src/commands/schedule.ts:8-16`), and `open`/`files` only ever act on the issuing tab.
  2. **Active-tab workaround for `agent`** (see "Landmine" above): snapshot `managers.tab.activeTab`, `setActiveTab` to the issuing tab's index, dispatch, then restore the snapshot — only for the `agent` prefix; the other six commands already use their passed-in `label` correctly and need no such workaround.
  3. **Dispatch and capture output**: call `managers.capture.run(label, command, callback)` (`src/capture-manager.ts:9-29`) — the exact mechanism the remote-agent capture path already uses to run any registered command and get its resulting output string back — and resolve `runJanissaryTabCommand`'s return value (a `Promise<string>`, since `capture.run` is callback-based) with what the callback receives. This reuses the existing generic dispatch (`CommandManager.executeCommand` under the hood) and its output-capture diffing; no per-command result formatting is written.
- No new `isTabTargetInGroup`/`canCreateAgentInGroup` standalone exports are needed as originally proposed; the checks above are inlined into `runJanissaryTabCommand` since each has a different shape (target-tab lookup vs. count), and there is no existing multi-caller need for standalone helpers yet — extract them later if a second caller appears.

### 2. ACP priming update

- `JANISSARY_TAB_PRIMER` (in `src/janissary-command.ts`), appended into the primer string `AcpManager.run()` already builds (`src/acp-manager.ts:105`, alongside `this.managers.database.primer` and `BROWSER_PRIMER`):

  ```
  This host CLI can also orchestrate other Janissary tabs via built-in commands. Syntax:
    agent <name>            # create a new agent tab in your group (max 5 siblings)
    msg <agent> <message>   # send a message to another agent in your group
    broadcast <message>     # message every agent in your group
    schedule add <spec>     # schedule a timed command in your own tab
    open <path>             # open a file in an editor tab
    files [path]            # open a file-tree tab rooted at path (or your cwd)
    close <label>           # close a tab you created, in your group (not yourself)
  To issue one, end your reply with exactly one such command on its own final line (no code
  fence, nothing after it). The host runs it and returns the output to you, so you can issue
  further commands. When the task is done, reply with the final answer and NO trailing command.
  ```

  (Illustrative primer text only — the implementer may adjust wording as long as the documented syntax matches the parse functions in `src/messaging.ts`, `src/commands/close.ts`, `src/commands/schedule.ts`, `src/commands/open.ts`, `src/commands/files.ts`, `src/commands/agent.ts`.)

### 3. Output capture

- Handled by `managers.capture.run` as described in step 1.3 above — no new transcript/UI plumbing. `AcpManager.run()`'s existing `ranCommand` handler (`src/acp-manager.ts:112`) already appends `{ input: c, output: result, acp: true }` to the tab's log for any command the loop runs; Janissary-tab commands flow through the same path as `db`/`browser` commands today.

### 4. Safety guards

- `close` may not target the owner tab (the tab running the agent) or a tab outside its group. Attempting either returns an error tool output (see step 1.1 above) instead of dispatching.
- `agent` may not reuse an existing name; `ProfileManager.newAgent` already rejects duplicate names case-insensitively (`src/profile-manager.ts:40`) — no new guard needed, the existing error string flows back as the tool output.
- All scheduling through the agent uses `in <target>` implicitly scoped to the issuing tab; the agent cannot schedule commands in other agents' tabs. This is already true of the human `schedule` command's `in <tab>` targeting, which defaults to the issuer (`resolveTargetTab` in `src/commands/schedule.ts:8-16`) — no new restriction to add, only to confirm by test.

### 5. Specs

- New `specs/agent-tool-loop.md`: allowed commands, group scoping, cap limits, primer text, output format, safety guards, and the active-tab workaround's user-visible focus-flicker behavior (Decision 6).
- `specs/acp.md`: cross-reference the extension for Janissary built-ins in the "Tool Loop" section.
- `specs/messaging.md`: note that agents can now originate `msg`/`broadcast` (currently only humans), and that agent-originated `msg`/`broadcast` are group-scoped (human-originated ones are not).

### 6. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/janissary-command.test.ts` (new, colocated next to the new module): `extractJanissaryTabCommand` recognizes each of the seven prefixes and tolerates code fences/prompt markers, same table-driven shape as the existing `extractBrowserCommand` tests (check for a `src/browser-command.test.ts` to mirror).
- `src/acp-manager.test.ts`: extend the existing `runCommand`/`extractCommand` composition tests (see current coverage for the `db`/`browser` branches) to cover: a Janissary-tab command is recognized and dispatched; group-scope rejection for cross-group `msg`; cap rejection on the 6th same-group `agent` (using `view === undefined` tabs, not `view === 'agent'`); self-close rejection; the active-tab snapshot/restore around `agent` dispatch (assert `activeTab` is restored after the call, including on error).
- `src/commands/msg.test.ts`, `src/commands/broadcast.test.ts`, `src/commands/close.test.ts`, `src/commands/schedule.test.ts`, `src/commands/agent.test.ts` (or `src/profile-manager.test.ts`, wherever `newAgent` is currently tested — verify the exact file before adding to it): unchanged — these commands are parsed and dispatched identically regardless of invocation source, since the new code reuses `CommandManager`/`CaptureManager` rather than reimplementing dispatch.
- `src/capture-manager.test.ts`: confirm (or add if missing) a case where `capture.run` is called for each of the seven newly-allow-listed command names, to lock in that the generic capture path already handles them with no special-casing (mirroring the existing `acp`/`browser` special cases at `src/capture-manager.ts:38-39`, which do NOT apply to these seven).
- Integration test (new, in `src/acp-manager.test.ts` or a new `src/janissary-command.test.ts` integration block): a mock ACP session issues `agent helper`, verifies a new tab appears in the issuing tab's group, then issues `msg helper hello`, verifies the message lands in the target's transcript.

## Out of scope

- Changing `ProfileManager.newAgent`'s signature to take an explicit creator label instead of reading `tab.cur()`. The active-tab snapshot/restore workaround in step 1.2 above is the accepted mitigation; a signature change would be a larger, separately-reviewable refactor touching every existing caller of `newAgent`.
- Any new transport, RPC, or non-ACP invocation path for these commands. Only the ACP tool loop can issue them.
- Nested/recursive agent-of-agent orchestration limits beyond the flat per-group cap in Decision 5 (e.g. total tree depth). The flat cap is the only limit this plan implements.
- Harness tabs (`view: 'harness'`) issuing these commands. Only ACP agent tabs get the extended primer/extraction; harness tabs are unaffected.

## Implementation order

Each step must leave `./scripts/run.mjs check-diff` green before moving to the next — later steps depend on the extraction/dispatch scaffolding from step 1 existing and typechecking.

1. `src/janissary-command.ts`: `extractJanissaryTabCommand`, `JANISSARY_TAB_PRIMER`, tests. Pure, no `Managers` dependency — can be written and tested in isolation first.
2. `runJanissaryTabCommand` (in `src/janissary-command.ts` or a sibling module, per the file-size note in "Proposed changes" step 1): pre-dispatch validation (group checks, cap check, self-close check), the active-tab snapshot/restore for `agent`, and dispatch via `managers.capture.run`. Tests for each validation branch and for the active-tab restore (including on error/throw).
3. Wire into `src/acp-manager.ts:104-108`: add the `extractCommand` alternative and the `runCommand` branch. Extend `src/acp-manager.test.ts`'s existing composition coverage.
4. Priming: fold `JANISSARY_TAB_PRIMER` into the primer string in `src/acp-manager.ts:105`.
5. Integration test: `agent` → `msg` round trip through a mock ACP session.
6. Specs: new `agent-tool-loop.md` + amendments to `acp.md`, `messaging.md`.
7. Public documentation.

## Verification

- Run `./scripts/run.mjs check-diff` after each step above (lints changed files, typechecks affected projects, runs related tests — see `CLAUDE.md`).
- Manual end-to-end check: start the app, create two agent tabs in the same group (`agent alice`, then switch back and `agent bob`), connect ACP in one, and prompt it with a task that requires messaging the other (e.g. "send bob the message 'ping' using the msg command, then report what you did"). Confirm: bob's transcript receives the message, alice's transcript shows the `msg` tool-output line, and the active tab returns to alice (not bob) after the exchange. Then repeat with a third agent tab placed in a different group and confirm a cross-group `msg` attempt is rejected with the tool-output error text rather than silently succeeding.
