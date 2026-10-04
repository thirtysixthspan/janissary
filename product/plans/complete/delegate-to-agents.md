# Delegate to agents skill

**Complexity: 6/10** — a new `--model` flag on the `agent` command lifted out by the parser's existing token walk, recorded as an in-memory tab field the ACP model resolver prefers, three thin entries in the ACP tool table that each delegate to a manager call the command bar already makes, and two bounds the new capability needs to be safe to expose: a delegation-depth cap and a scan of a worker's answer before it re-enters its parent's context. No new protocol message, no persistence field, no web-client work.

## Summary

Teach an agent to hand repository work to other agents running different models, follow their transcripts while they work, and collect their responses.

The repository already holds every primitive: `agent <name>` opens a disposable workspaced agent tab, `msg <agent> request <command>` runs a command in another agent tab and returns the captured output as a `response`, and `send <agent> <text>` hands a line to a tab without waiting for it. What is missing is that an **ACP agent cannot reach any of it** — the `acp` tool loop teaches exactly three commands (`browser`, `question`, `db`), so an agent driven by `acp <prompt>` can ask a question or read a database but cannot open a tab or talk to another tab. And an agent tab's ACP model is fixed: `AcpManager.resolveAcpModel` returns `google/gemini-3.1-flash-lite` from the harness catalog with no way for anyone, human or agent, to choose another.

So this feature adds the three delegation verbs to the ACP tool loop, gives `agent` a `--model` flag, writes the skill that tells an agent how to use them together, and adds the two bounds that exposing delegation safely requires: how deep a delegation tree may go, and what happens to a worker's answer before it becomes its parent's next instruction.

## Design decisions

Every decision below was reached autonomously under the instruction to work without asking; each records the answer chosen and the evidence behind it. No user answer is claimed anywhere in this plan.

1. **Extend the existing ACP tool loop; do not invent a delegation grammar.** `createAcpToolTable` in `src/acp/tool-table.ts` is already the registry that derives a tool's primer, extractor, and runner from one `AcpTool` entry — "so a new tool is one entry rather than three lists that can disagree." `question` is the exact precedent for an asynchronous tool: `runQuestionCommand` returns `string | Promise<string>` and `runAcpToolLoop` awaits it and feeds the result back as the next prompt. Delegation is the same shape, so it belongs in the same registry rather than beside it.

2. **Reuse the existing command spellings verbatim — `agent`, `send`, `msg`.** An agent that has learned Janissary's command bar should not have to learn a second dialect to delegate. Each entry's `run` calls the same manager the command bar calls, so the tool loop and the command bar cannot disagree about what `agent bekir` means. `managers.capture.run` is the whole of `msg`'s runner — it is already what `AgentCommunicationManager.handle` calls for a `request` (`src/agent/communication-manager.ts`, the `kind === 'request'` branch), and `managers.capture` is already constructed on the `Managers` registry.

3. **`send`'s runner reuses `deliverTo` rather than reimplementing delivery.** `deliverTo` in `src/commands/send.ts` already distinguishes a harness tab (type into its PTY via `typeIntoHarness`), an agent tab (`managers.command.dispatchTo`), and a tab that accepts nothing (`Tab "<label>" does not accept input.`). Export it and call it, so the tool cannot drift from the command bar on any of the three. Resolve the target with `resolveTarget` from `src/commands/resolve-target.ts`, which handles the display-alias case and the standard `No tab named "<label>".` refusal, exactly as `send`, `queue`, and `close` do.

4. **The three verbs are `agent`, `send`, and `msg`.** `agent` opens the worker. `send` hands over a task without waiting, which is what makes the work observable. `msg` returns the response. The tool loop adds no orchestration of its own.

5. **`msg` returns the worker's final reply by way of `msg <worker> request acp "<task>"`.** `acp` already registers a `capture` hook (`src/commands/acp.ts`), and `CaptureManager.run` routes a command with one straight to it — so that composition already answers the sender with the worker's complete final reply, and the tool loop turns it into the delegating agent's next prompt. That single line is the whole "receive the response" clause; nothing new computes it.

6. **Transcript while the worker runs is `send` plus a `state` peek, not a new streaming channel.** `send <worker> acp "<task>"` returns immediately; `msg <worker> request state` returns the worker tab's own formatted state, whose `log` field is that tab's transcript (`formatState` in `src/state-format.ts` prints the last ten lines behind a `... (N lines omitted)` marker). Polling across successive tool steps is how a delegating agent watches a worker work. No new protocol message, no per-chunk event, no web-client change — which also keeps clear of the reason the deferred `multiagent` plan refused live streaming (`product/plans/draft/multiagent.md`): every chunk is currently a whole-state broadcast.

7. **`msg … request` does not queue behind a busy worker, and that is inherited, not introduced.** `CaptureManager.runCommand` calls `managers.command.executeCommand`, which runs the command directly rather than through `dispatchTo`'s `dispatchOrRun` gate (`src/command/manager.ts`), so a messaged command bypasses the busy-tab queue. `product/specs/messaging.md` documents the capture contract without mentioning the queue. This feature does not change it; the skill tells the delegating agent that a poll against a busy worker reflects the worker's last dispatch, not a queued one.

8. **`agent <name> --model <model-id>` is validated against the harness catalog, with `harness`'s refusal wording.** `HarnessManager.run` refuses an unknown model with `Unknown model "X" for harness "Y" — add it to harness-models.json.` before it opens anything, and the ACP path refuses an empty catalog with `ACP: no opencode model is available in the harness catalog.` A worker on a model the catalog does not list would fail later and far less clearly inside the agent binary, so the check happens at launch, against `modelsFor('opencode')` — the same list `resolveAcpModel` already reads, so a project that overrides `.janissary/harness-models.json` governs worker models too.

9. **Validation applies to a remote launch too, and the model reaches the remote host.** `HarnessManager.run` validates before `open`, and `open` handles the remote case, so a remote harness already validates against the *local* catalog. The agent path should match: `agent <name> on <host> --model <id>` validates locally and records the model on the tab. It then travels in the launch environment the way it already does for remote tabs — `acpLaunchFor` puts it in `OPENCODE_CONFIG_CONTENT` (`src/acp/launch.ts`), and `createRemoteAcpSession` sends that launch across the channel — so the far host runs the model the local catalog approved. The tab field is still needed locally, because `AcpManager.run` computes the model before it knows whether the tab is remote.

10. **The model is an in-memory tab field, not a persisted one.** `AgentState` is written by `buildAgentStateFromTab` and read back only by the `state` command and `loadAllAgentStates` — nothing rebuilds a `Tab` from it, so an agent tab does not survive a relaunch and a persisted model would be read by nobody. Follow the tab fields the codebase already marks in-memory-only (`pageSnapshot`, `editorDraft` in `src/tab/types.ts`, each commented "never read when building persisted AgentState"): add the field to `Tab`, set it in `placeAgent` beside `tab.offline = offline`, and persist nothing. That keeps `buildAgentStateFromTab`, the `state` command, and the state-fields paragraph in `documentation/user-documentation/command-bar/commands.md` untouched.

11. **The model is consumed when the ACP session first connects, and `acp reset` re-reads it.** ACP chooses its model at `initialize`, and nothing in Janissary exercises a mid-session change (that is the declined `setSessionMode`/`unstable_setSessionModel` backlog entry), so a per-tab field read by `AcpManager.run` is the honest granularity. Because `AcpManager.session` only builds a launch when it has no session for the label, a reset clears the session and the next `run` resolves the tab's field again — a chosen model survives `acp reset`, and a tab with no chosen model keeps resolving through `resolveAcpModel()` and keeps the empty-catalog refusal.

12. **No protocol or web-client change.** `TabView.acp` and the connections panel already show `acp:<provider/model>` for whatever model a session launched with, because `AcpManager` records it at the handshake. A worker launched with `--model` therefore displays its model with no new field, no new RPC, and no client work.

13. **One `delegation` entry, placed before the database entry, rather than three.** `createAcpToolTable` resolves a run by "first match over an ordered array," and the database entry's `match` is `() => true` — it is the fall-through, so the delegation verbs must precede it. Three separate entries would satisfy that but would also repeat the delegation primer three times, since `toolPrimer` joins every entry's primer. One entry whose `match` accepts all three and whose `run` dispatches to the right handler is the smaller mechanism, keeps the primer singular, and matches how the database entry already dispatches internally.

14. **The recognizers must be tight.** `send` and `msg` carry free text as their payload, so each must demand its whole argument count — `send` needs a target and text, `msg` needs a target, a kind, and text — or a line that merely mentions one of these words would be claimed. The `msg` kind set covers every alias in `KIND_ALIASES`, which a test asserts against that exported set rather than a restated list.

15. **No total tab-count cap is added here, but delegation depth is capped.** Tab lifecycle, workspace removal, and name-clash refusal are already governed (`product/specs/AGENTS.md`, `workspaced-agent.md`); the five-per-group cap belongs to the deferred general orchestration plan (`product/plans/deferred/agent-self-service-tab-orchestration.md`), whose scope this feature deliberately does not preempt. The pool of agent names is the only natural breadth bound, and it already refuses when exhausted. Depth is different, and is this feature's own responsibility — see decision 19.

16. **The skill is `skills/delegate-to-agents/SKILL.md`, prose only, no scripts.** It follows `skills/ask-user/SKILL.md`: the primer reaches every ACP agent unconditionally, and the skill carries the workflow the primer cannot — which worker shape to pick, when to block for a response versus poll, and what to do about the loop's step cap. `diagram-design` is the only skill with a `scripts/` directory, and it needs Python importers this feature does not.

17. **The skill documents both worker shapes, and the plan adds nothing to the harness half.** A harness tab already takes `--model` and already exposes `harness capture <name>` (a point-in-time screen snapshot) and `harness transcript <name>` (the harness's own normalized session transcript, including subagent activity). Those are the better tools for a long unattended playbook; the ACP half is the better tool for a bounded task whose answer should come back as command output. `harness` is not in the tool table, so an ACP delegating agent reaches the harness shape only through the human — the skill says so rather than implying otherwise.

18. **Two independent limits are documented rather than removed.** `runAcpToolLoop` caps a turn at eight tool steps, which bounds how many polls a delegating agent can make per turn; and the tool table is built per `run` (`src/acp/manager.ts`, `const tools = createAcpToolTable(this.managers)`) with the joined primer prepended to the first prompt only, so a reused session keeps the syntax in front of it the same way the existing three tools do.

19. **Delegation is capped at depth 2, because this feature is what makes recursion possible.** Claude Code bounds its subagent tree three ways — nesting depth, concurrent subagents, and total spend (`code.claude.com/docs/en/agent-sdk/subagents`), and documents `maxTurns` per subagent in its agent frontmatter — because "a subagent can spawn subagents of its own, so one prompt can grow into a tree of agents." Janissary has the same exposure the moment `agent` enters the tool table: every agent tab is an ACP agent with the same table, so a delegated worker can delegate, and each `agent -w` is a whole git clone plus a live subprocess with its own model spend. Nothing in the repository bounds that. Two levels is the smallest cap that still allows the coordinator → worker → verifier shape the research describes as legitimate ("a review subagent dispatching verifier subagents per finding") while making a runaway tree impossible: a tab at depth 2 is refused.

    The counter rides the tab as an in-memory field, incremented in `placeAgent` from the creator's (which is 0 for the root tab), exactly as `group` already propagates there — the same code path, the same inheritance, one more number. The refusal is enforced in the `agent` tool's runner, not in `newAgentOp`: a human typing `agent` by hand is a deliberate act and is not capped, matching how a person may always open tabs by hand. A tab at the cap is refused with a line naming the cap, so the delegating agent learns the boundary rather than retrying.

20. **A worker's answer is scanned before it becomes its parent's next instruction.** This is the sharpest edge the feature introduces. `msg <worker> request acp "<task>"` makes a worker model free text the delegating agent reads as its next prompt, and that text is the only channel by which one agent instructs another — so a worker that has been misled by a file, a page, or its own output can aim words at its parent's tool use. Claude Code treats this as a real class: it scans a subagent's final message for control-tag imitation (neutralizing a tag only the harness emits, such as `<system-reminder>`), permission-configuration mentions (kept verbatim), and turn markers (`Human:`/`Assistant:`, backslashed so they cannot imitate a boundary), prepending a `[harness: …]` marker line naming what matched and never rewording the worker's text otherwise. There are filed reports of exactly this failure, including a depth-2 subagent fabricating a complete `<system-reminder>` + `<task-notification>` block with a payload inside it.

    The scan is a pure function in the new delegation module, applied to the text the `msg` tool returns, mirroring that three-category treatment: neutralize a harness-shaped control tag by breaking its opening bracket, backslash a `Human:`/`Assistant:` line prefix, and prepend a `[harness: …]` line naming the matches. It never deletes or rewrites the worker's own sentences, so the answer stays usable. Web and database tool results are **not** scanned — that is a separate, larger surface with its own tradeoffs, and scoping this to the one channel this feature creates is what keeps it small enough to be correct.

## Gaps this plan adds (Step 2 research)

Research against Claude Code's subagent system — the category leader for delegation to another agent on a chosen model — surfaced two capabilities the plan did not originally have. Both are consequences of the delegation path itself rather than adjacent features, so both were added:

| Gap | What the leader has | Complexity |
| --- | --- | --- |
| Depth/concurrency bound on the delegation tree | Caps nesting depth, concurrency, and spend; `maxTurns` per subagent | medium |
| Scanning a worker's answer before it re-enters its parent's context | Three-category scan of a subagent's final message with a `[harness: …]` marker | medium |

Considered and **declined**, recorded here so no later phase proposes them again: a per-invocation model override on an already-running session (the launch-time `--model` covers the feature's clause, and mid-session switching is the already-declined `setSessionModel` backlog entry); a workflow/fan-out tool for coordinating many agents at once (already `product/plans/draft/multiagent.md`, and the declined "acting on a set of tabs in one command" backlog entry); resuming a worker with its history intact (already inherent — a worker's ACP session persists across prompts in its tab); per-worker git-worktree isolation (`agent -w` gives a stronger whole clone); a background-execution flag (`send` already is it); and viewing what a worker changed (the already-declined `workspace diff <label>` backlog entry). Per-worker tool allowlists — Claude Code's `tools:` frontmatter and `Agent(worker, researcher)` spawn scoping — are declined as belonging to the deferred orchestration plan's group-scoped surface, and are listed under Out of scope.

## What already exists (reuse, don't rebuild)

| Need | Existing mechanism | Where |
| --- | --- | --- |
| Open a workspaced agent tab | `agent <name>`, name pool and clash refusal, clone provisioning | `newAgentOp` in `src/profile/new-agent.ts`, `placeAgent` in `src/profile/place-agent.ts` |
| Create the tab, local or remote | `placeAgent`, already called by both `newAgentOp` and `startRemoteAgent` | `src/profile/place-agent.ts`, `src/profile/remote-agent.ts` |
| Lift a value-taking flag out of a command | the token walk in `splitAgentClauses`; `findFlagValue` is the harness precedent | `src/agent/commands.ts`, `src/harness/command-parse.ts` |
| Report a parse failure without a new channel | the `remoteError` field and the `out(...)` that reports it | `AgentCommand` in `src/agent/types.ts`, `newAgentOp` in `src/profile/new-agent.ts` |
| Choose a model on a spawned tab, validated | `harness --model` + `isKnownModel`, validated before `open` | `HarnessManager.run` in `src/harness/manager.ts` |
| Resolve a model against the catalog | `modelsFor`, `isKnownModel`, project override | `src/harness/models.ts` |
| Pick the ACP model's default | `resolveAcpModel` preferring `PREFERRED_ACP_MODEL` | `src/acp/manager.ts` |
| Carry a model into the launch | `acpLaunchFor` → `OPENCODE_CONFIG_CONTENT` | `src/acp/launch.ts` |
| Run a command in another tab and get text back | `managers.capture.run` — what a `request` already uses | `src/capture/manager.ts`, `src/agent/communication-manager.ts` |
| Return a worker's final reply | the `capture` hook on the `acp` command | `src/commands/acp.ts` |
| Deliver a line to a tab, by tab kind | `deliverTo` (harness PTY / agent dispatch / refusal) | `src/commands/send.ts` |
| Resolve a target by label or alias | `resolveTarget` | `src/commands/resolve-target.ts` |
| Ask a tab for its transcript | `state` → `formatState`, whose `log` is the tab transcript | `src/commands/state.ts`, `src/state-format.ts` |
| Agent-to-agent messages and responses | `msg`/`broadcast`, FIFO queue, `response` kind, `KIND_ALIASES` | `src/commands/msg.ts`, `src/messaging.ts` |
| Register a new ACP tool | `AcpTool`, `createAcpToolTable`, `toolPrimer`/`toolRunner`/`toolExtractor` | `src/acp/tool-table.ts` |
| Await an async tool result | `runAcpToolLoop` awaiting `runCommand` | `src/acp/loop.ts` |
| Host a tool's primer and recognizers | `src/question-command.ts` (usage text, parser, `is…CommandLine`, primer) | `src/question-command.ts` |
| An agent-facing skill | `skills/ask-user/SKILL.md` shape and tone | `skills/ask-user/` |
| Inherit a property from the creating tab | `group`/`groupColor` inheritance in `placeAgent` | `src/profile/place-agent.ts` |
| Refuse a command with a line the agent reads | the tool's return value, fed back as the next prompt | `src/acp/loop.ts` |
| A pure text transform with its own tests | `isRateLimitError`, `cleanCommandLine`, `parseQuestionCommand` | `src/acp/rate-limit.ts`, `src/acp/command-line.ts` |
| Show the launched model | `AcpManager.label` → `TabView.acp`, connections panel | `src/acp/manager.ts`, `src/protocol/tab.ts` |
| An in-memory-only tab field | `pageSnapshot` / `editorDraft` | `src/tab/types.ts` |

## Proposed changes

### The `agent` command's `--model` flag

Extend the token walk in `splitAgentClauses` (`src/agent/commands.ts`) so `--model <value>` and `--model=<value>` are lifted out alongside the `-w`/`--no-workspace`/`--offline` flags and the `on <address>` clause, never becoming part of the tab name. The walk already indexes forward past a consumed token for `on`, so this is the same shape extended to a flag that carries a value; carry the result on the local `AgentClauses` type as an optional model and on `AgentCommand` as `model`.

A `--model` with no value is a usage error, reported through a `modelError` field mirroring the existing `remote`/`remoteError` pair, and surfaced by `newAgentOp`'s existing `out(...)` early return. This is the `parseHarnessCommand` behavior of refusing a valueless `--model`, expressed with the shape this command already has rather than introducing a second error channel.

A `--model` immediately followed by another flag (`agent scout --model --offline`) takes `--offline` as its value, exactly as `findFlagValue` does for `harness`. The catalog check is the backstop: `--offline` is not a model, so the launch is refused with the unknown-model wording.

Validate in `newAgentOp` before any workspace work begins, with `isKnownModel('opencode', model)`, refusing with `Unknown model "<model>" for harness "opencode" — add it to harness-models.json.` — `harness`'s wording with the harness name the ACP path actually uses. Refusing before `managers.workspace.create` means a bad flag never leaves a half-provisioned workspace behind.

Thread the value into `placeAgent`'s options and set it on the tab beside `tab.offline = offline`. `placeAgent` is the single creation point for both the local and the remote agent paths (`startRemoteAgent` in `src/profile/remote-agent.ts` calls it too), so one call site covers both.

Extend `resolveAgentName` only insofar as it already runs `splitAgentClauses`; the flag is lifted out before `nameFrom` sees the words, so the typed name is unchanged.

### The ACP session's model

Add an optional model field to the agent tab shape, in-memory only, and have `AcpManager.run` prefer `managers.tab.byLabel(label)`'s field over `resolveAcpModel()`, keeping the empty-catalog refusal for tabs that named no model. The session already records whatever model it launched with, so the connections panel needs no change.

`AcpManager.session` builds its launch only when the label has no session, which is what makes a chosen model survive `acp reset` (decision 11).

### The ACP tool table

Add one new module, `src/acp/delegation.ts`, holding the delegation primer, the line recognizers, the depth constant, and the answer scan, in the shape `src/question-command.ts` uses for a tool's grammar. Keeping them out of `tool-table.ts` leaves that file's registry a flat list of entries and keeps both files well inside the 200-line limit.

Register one entry in `createAcpToolTable`, ordered `browser`, `question`, `delegation`, then the database entry — delegation must precede the database fall-through (decision 13), and `browser` and `question` before it is harmless because each claims only its own command name.

Its `match` accepts `agent`, `send`, and `msg`; its `run` dispatches to the manager call the command bar makes for whichever verb was emitted: `managers.profile.newAgent` for `agent`; `resolveTarget` plus the exported `deliverTo` for `send`; `managers.capture.run` wrapped in a `Promise` for `msg`, with the parsed recipient and text taken from `parseMsgCommand` in `src/messaging.js`.

For `send`, the tool's "append" callback appends to the delegating tab's own transcript, which is what the loop already does for a command it ran (`ranCommand` in `src/acp/manager.ts`).

`src/acp/delegation.ts` also holds the depth constant and the answer scan (decisions 19 and 20), so the tool table's registry, the primer, the recognizers, the bound, and the scan all live in one module beside each other rather than spread across `tool-table.ts` and `manager.ts`.

### The delegation depth cap

Add an in-memory depth field to the tab shape and set it in `placeAgent` from the creator's, the same way `group` is inherited there — the root tab has no creator and is depth 0. Nothing reads it except the `agent` tool's runner, which refuses when the delegating tab is already at `MAX_AGENT_DEPTH`.

Keep the constant next to the check rather than in a config file: it is a property of the delegation design, not a user setting, and `AGENTS.md`'s config surface is `.janissary/config.json`, which this does not need to grow.

The refusal is the tool's return value, so it reaches the delegating agent as its next prompt — the same path every other tool error takes — rather than as a notification nobody is watching.

### Scanning a worker's answer

Add a pure function to `src/acp/delegation.ts` that takes a worker's returned text and returns the text safe to hand back as an instruction, and apply it to the `msg` tool's resolved answer only.

Three categories, each mirroring the leader's treatment: a harness-shaped control tag opening (`<system-reminder>`, `<task-notification>`, `<system>`, and the `</` closing form) is neutralized by inserting a backslash after the opening angle bracket, which breaks the tag without deleting the worker's sentence; a line beginning `Human:` or `Assistant:` gets a backslash before its colon so it cannot imitate a turn boundary; and a permission-configuration mention (`.claude/settings.json`, `bypassPermissions`, `--dangerously-skip-permissions`) is left verbatim, as the leader leaves it, since naming a setting is not impersonating the harness.

When anything was neutralized, prepend one `[harness: …]` line naming the categories matched. When nothing matched, return the text untouched, so the common case is byte-identical to today.

Keep the patterns as module-level constants in the same file — an array of tag names and a small set of markers — rather than a regex that grows to swallow prose, and give the tag list a fixed vocabulary so the check cannot be widened by a worker choosing an unfamiliar tag name.

### The skill

Add `skills/delegate-to-agents/SKILL.md` with frontmatter `name` matching its directory and a `description` that names the capability and when to reach for it, in the folded style `skills/agent-merge-changes/SKILL.md` uses.

The body teaches, in order: what delegation is for and when not to use it; the three-command shape of one delegation (open, hand over, collect) with a worked example for a bounded task answered inline and one for a long playbook polled while it runs; how to choose a model (`--model` against the catalog, and `harness --model` for the harness shape, with the note that a human opens a harness tab since `harness` is not in the tool table); the transcript-as-it-works loop (`send` then `msg … request state`), including that each poll costs one of the turn's eight tool steps and that a long watch belongs in `harness capture`/`harness transcript`; that a messaged command bypasses the worker's busy queue, so a poll shows the last dispatch rather than a queued one; that delegation is capped at depth 2, so a worker asked to delegate further must be given the work itself rather than a new worker; that a worker's answer is scanned before it is handed back, so a `[harness: …]` line at the top of a result is the host reporting neutralized harness-shaped text and the worker's own words are still there underneath; the failure modes — an unknown model, a name already taken, a worker that dies mid-prompt, a still-connecting remote tab, which already answers `ACP: the remote session is still connecting.` — and what the agent should do about each; and the rule that a worker handed a task with `send` must be told to report back with `msg <sender> response <text>`, because the delegating agent will not be blocking on the reply.

The skill names `harness capture <name>` and `harness transcript <name>` for the harness worker shape without adding anything to either.

### Specs

`product/specs/acp.md` gains the delegation tools in its tool-loop section — which currently names three tools and says "an ACP agent's entire tool surface is the three commands its primer teaches it" in the declined `features.md` entry — and a note in "Which model runs" that a tab may be launched on a chosen model.

`product/specs/AGENTS.md` documents `--model` on the `agent` command under `### agent <name> command`, its catalog validation and refusal wording, and that the model travels to a remote host in the launch environment.

`product/specs/messaging.md` records that a messaged `agent` or `send` issued from the ACP tool loop follows the same capture contract as a typed one, and notes the queue bypass as inherited behavior rather than a change.

`product/specs/agent-guidance.md` gains a skills section naming the delegation skill, since the file currently documents only `AGENTS.md` and `CLAUDE.md`.

`product/specs/sandbox.md` records that a delegated worker's tab is confined by the same Seatbelt profile as any other workspaced agent tab — delegation hands over a clone that is already sandboxed, and the spec should say so where it enumerates what a workspaced tab may reach.

### Help and documentation

`help.md`'s `agent` row gains `--model`. No new command rows: `agent`, `send`, and `msg` already have them.

Add `documentation/user-documentation/advanced-agents/delegating-to-agents.md` covering the workflow, both worker shapes, the model choice, the depth cap, and the answer scan, and link it in the Advanced Agents section of `documentation/.vitepress/config.mts`.

No change to the state-fields paragraph in `documentation/user-documentation/command-bar/commands.md`, because the model is not persisted (decision 10).

## Tests

Server, colocated as `src/**/*.test.ts`:

- `src/agent/commands.test.ts` — **new file** (the directory has `names`, `state`, and `communication-manager` tests only). `--model <value>` and `--model=<value>` are lifted out of the tab name in every position — before the name, after it, after `on <address>`; a valueless `--model` yields `modelError`; `resolveAgentName` returns the name without the flag; `-w`, `--offline`, and `on` behavior is unchanged.
- `src/profile/new-agent.test.ts` — **new file**. A model reaches the created tab through `placeAgent`; an unknown model is refused with the catalog wording and never reaches `managers.workspace.create`; the default path sets no model; the remote path carries it into `startRemoteAgent`; a created tab inherits its creator's depth plus one, and a root tab's child is depth 1.
- `src/acp/manager.test.ts` — **extend**. A tab's chosen model is what `acp` launches with and what `AcpManager.label` reports; a tab without one still resolves through `resolveAcpModel`; an empty catalog with no chosen model still refuses; a model survives `acp reset`.
- `src/acp/tool-table.test.ts` — **extend**. The delegation entry matches all three verbs and resolves ahead of the database fall-through; a `send`/`msg` line is claimed by delegation and a `browser`/`db` line by its own tool; the joined primer contains the delegation section exactly once.
- `src/acp/delegation.test.ts` — **new file**. Each recognizer against its own valid shapes, the `KIND_ALIASES` spellings, and its near-misses; the depth refusal at the cap and its absence below it; the scan neutralizing a control-tag opener, backslashing a turn-marker prefix, leaving a permission-config mention verbatim, prepending exactly one `[harness: …]` line when anything matched, and returning ordinary prose byte-identical.

No web tests: nothing under `web/src/` changes.

## Out of scope

- Harness tabs as a new capability. `harness --model`, `harness capture`, and `harness transcript` already exist; the skill documents them and nothing is added.
- The general agent-facing tab-orchestration surface (`open`, `files`, `close`, `schedule`, `broadcast`, group-scoped targets, a `JANUSSARY_TAB_PRIMER`) in `product/plans/deferred/agent-self-service-tab-orchestration.md`. This feature adds the three verbs delegation needs and stops there.
- Per-worker tool allowlists and spawn scoping — Claude Code's `tools:` frontmatter and `Agent(worker, researcher)` — which shape a worker's role rather than bound a tree, and belong to that deferred surface.
- Concurrency and spend caps on the delegation tree, alongside the depth cap this plan does add. A spend figure needs usage accounting, which is a separate deferred backlog entry.
- `fanout` — N models in one tab — in `product/plans/draft/multiagent.md`.
- A per-invocation model override on an already-running session; mid-session switching is the already-declined `setSessionModel` backlog entry.
- Scanning `browser` and `db` tool results for injection, which is a separate and larger surface than the one channel this feature creates.
- Exposing commands as MCP tools, the other half of the ACP integration, already declined in `product/backlog/features.md`.
- A cap on total delegated tabs, which belongs to the deferred orchestration plan.
- New protocol messages, RPCs, tab-view fields, persistence fields, or web-client changes.
- Changing the busy-queue bypass for messaged commands, or changing `msg`'s FIFO semantics.
- A `scripts/` directory in the skill, and any Python.
- Model cost or usage accounting, and central model selection (a separate deferred backlog entry).

## Verification

`./scripts/run.mjs check-diff` after the implementation changes.

Manual, in a running app with an attached E2E browser:

1. `agent scout --model google/gemini-3.1-pro-preview` opens a workspaced tab whose connections-panel row reads `acp:google/gemini-3.1-pro-preview` once a prompt connects.
2. `agent scout --model not/a-model` is refused with the catalog wording and opens no tab.
3. `agent scout --model` is a usage error and opens no tab.
4. `agent scout --model --offline` is refused as an unknown model.
5. From an ACP agent, one delegation round: a reply ending in `agent scout --model <id>`, then a reply ending in `msg scout request acp "<task>"`, returns the worker's answer as the next prompt.
6. A fire-and-forget delegation: `send scout acp "<task>"` returns at once, and a following `msg scout request state` returns the worker's transcript.
7. A depth-2 tab asked to delegate is refused with the cap named; the same command from the root tab opens a tab.
8. A worker whose answer contains `<system-reminder>` comes back with the tag neutralized and one `[harness: …]` line at the top; an ordinary answer comes back unchanged.
9. `harness capture scout` and `harness transcript scout` still behave as documented for a harness worker.