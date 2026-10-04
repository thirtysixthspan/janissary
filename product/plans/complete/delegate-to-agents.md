# Delegate to agents skill

**Complexity: 6/10** — a model-selecting `--model` clause on `agent`, one delegation tool in the ACP loop, and the boundaries needed to keep delegation within a worker's own group, depth, and command surface. The feature also screens worker replies before they become their parent's next instruction. It adds no protocol message, persistent model field, or web-client behavior.

## Summary

An ACP agent can open a worker, give it a task, inspect its transcript while it works, and collect its answer. `agent`, `send`, and `msg` use the existing command meanings, with limits enforced by the ACP delegation runner. The `agent` command can select the worker's OpenCode model from the harness catalog.

A delegated worker is parented to the tab whose ACP tool loop opened it, regardless of which tab is focused. Its group and delegation depth therefore follow the delegating agent. A depth cap, same-group target check, and command allowlist bound the new reach; `msg` replies are screened for harness-shaped control text before they return to the parent.

## Design decisions

1. **Keep delegation in the existing ACP tool loop.** One `AcpTool` entry supplies the primer, command recognizer, and runner for `agent`, `send`, and `msg`. It is ordered after `browser` and `question` and before the database fall-through.

2. **Reuse the command bar's operations.** `agent` calls `ProfileManager.newAgent`; `send` resolves the target and uses `deliverTo`; `msg` uses `CaptureManager.run`. The ACP loop adds no separate launch, delivery, or capture implementation.

3. **Use `send` for handoff and `msg` for a returned result.** `send <worker> acp <task>` returns immediately and queues through the ordinary dispatch path. `msg <worker> request acp <task>` waits for the captured output. Polling with `msg <worker> request state` reads the worker's formatted state. A messaged command goes directly through capture and does not wait behind the worker's busy queue.

4. **Choose models at launch.** `agent` accepts `--model <model-id>` and `--model=<model-id>` in any position around the name and `on <address>` clause. The model is validated against the local OpenCode catalog before workspace work, stored on the in-memory tab, and used by its ACP session, including after `acp reset`. Remote launches carry the chosen model in the ACP launch environment. A missing value is a usage error; a model value that is another flag is checked as a model and refused when unknown.

5. **Keep command-bar creator behavior and pass the ACP creator explicitly.** A command-bar launch omits `creatorLabel` and uses the active tab as before. The delegation runner passes its own tab label through `ProfileManager.newAgent` and `newAgentOp`, so the worker inherits that tab's group and depth even if another tab is focused. If the named creator has disappeared, `newAgentOp` falls back to the active tab.

6. **Cap recursion at depth 2.** A root tab without an `agentDepth` field counts as depth 0; each agent created by `placeAgent` is one deeper than its creator. The cap is checked in the ACP `agent` runner, not in the human command bar. `msg` cannot bypass it by running `agent` in a worker because `agent` is outside the `msg` allowlist.

7. **Restrict targets to the delegator's group and commands.** `msg` may run only `acp`, `state`, and `db`; `send` may dispatch only `acp` to an agent. `send` to a harness still types literal input into its terminal. Both verbs refuse targets outside the delegator's group, missing targets, and calls whose delegating tab cannot be found.

8. **Return refusals once, as tool results.** Invalid model choices, depth limits, command restrictions, and target errors are returned to the ACP loop so the agent can respond to them. A pool-name `agent` launch omits the `msg` hint because the chosen name is not known yet. The send target resolver's transcript callback is suppressed so a missing target produces one result line rather than also appending a second line.

9. **Screen only worker answers returned by `msg`.** The scan neutralizes a fixed set of harness-shaped control tags and backslashes `Human:` or `Assistant:` turn markers. It prepends one `[harness: …]` line when it changes anything and leaves ordinary answers byte-identical. Permission-setting mentions, browser output, and database output are not rewritten.

10. **Teach the workflow in a prose skill.** The primer describes the syntax and hard limits. `skills/delegate-to-agents/SKILL.md` explains when to delegate, when to poll, how to choose a model, how to report back after `send`, and how the existing harness worker tools differ. The eight-tool-step loop cap remains unchanged.

## Design constraints

Delegation includes two safeguards alongside the workflow: a depth limit prevents an unbounded worker tree, and a narrow answer scan prevents harness-shaped control text in a worker reply from masquerading as host instructions. The implementation does not add concurrency or spend accounting, scan browser or database results, or create a general tab-orchestration surface.

## What already exists (reuse, don't rebuild)

| Need | Existing mechanism | Where |
| --- | --- | --- |
| Open an agent tab and provision its workspace | `newAgentOp`, `placeAgent`, and the launch paths | `src/profile/new-agent.ts`, `src/profile/place-agent.ts` |
| Select and validate a model | Harness catalog helpers and ACP default resolution | `src/harness/models.ts`, `src/acp/manager.ts` |
| Carry the selected model to an ACP process | `acpLaunchFor` and the launch environment | `src/acp/launch.ts` |
| Deliver input by tab kind | `deliverTo` | `src/commands/send.ts` |
| Capture a command response | `CaptureManager.run` and the `acp` capture hook | `src/capture/manager.ts`, `src/commands/acp.ts` |
| Resolve a tab target | `resolveTarget` | `src/commands/resolve-target.ts` |
| Inspect a worker transcript | `state` and `formatState` | `src/commands/state.ts`, `src/state-format.ts` |
| Register and await ACP tools | `AcpTool`, the tool table, and the async loop | `src/acp/tool-table.ts`, `src/acp/loop.ts` |
| Inherit group and other launch state | `placeAgent` | `src/profile/place-agent.ts` |

## Proposed changes

### The `agent` command's `--model` flag

The token walk in `splitAgentClauses` removes both model flag spellings from the agent name and carries the selected value on `AgentCommand`. A valueless clause carries `modelError`; a following flag is consumed as its value and then refused by the catalog check. `newAgentOp` validates against `isKnownModel('opencode', model)` before creating a workspace and shares the refusal wording with the ACP delegation runner.

`placeAgent` records a valid choice as `acpModel` on the tab. The field is in-memory only, and `AcpManager.run` prefers it to the catalog default. The model is passed through local and remote launch paths; the existing launch environment sends it to a remote ACP process.

### The ACP session's model

The ACP session uses the tab's `acpModel` when present and otherwise retains the preferred catalog model, fallback-to-first-model behavior, and empty-catalog refusal. Resetting the session causes the next prompt to resolve the same tab choice again. The connection label continues to show the model actually launched.

### The ACP tool table

`src/acp/delegation.ts` holds the shared primer, recognizers, delegation runner, depth constant, command allowlists, group check, and reply scan. `createAcpToolTable` registers it as one entry for `agent`, `send`, and `msg`, before the database catch-all.

The agent verb launches through `ProfileManager.newAgent(command, creatorLabel)`. The creator label is the delegating ACP tab, so the launch tree is independent of focus. The command bar still calls `newAgent` without a label and continues to use the active tab. The send verb uses target resolution and `deliverTo`; the msg verb parses the existing message syntax and returns captured output after screening it.

### How far delegation reaches

The runner classifies requested text through the application's command resolver before it dispatches. A `msg` may run `acp`, `state`, or `db`; `send` may dispatch `acp` to an agent, while harness targets receive the literal line. Targets must be open and share the delegating tab's group. A missing delegator fails closed.

The primer states these limits. A refusal is returned through the tool loop rather than appended separately to the delegator's transcript. A missing `send` target therefore produces one refusal result.

### The delegation depth cap

`placeAgent` sets `agentDepth` to the creator's depth plus one, defaulting to one when the creator is a root tab with no depth field. The ACP `agent` runner refuses when the delegator is already at `MAX_AGENT_DEPTH`, which is 2. Human command-bar launches remain uncapped.

### Scanning a worker's answer

`scanWorkerAnswer` is applied to the text returned by `msg`'s capture callback. It breaks recognized harness control tags and turn-marker prefixes while preserving the worker's wording, and prepends a single marker line naming matches. If there are no matches, the original text is returned unchanged. The scan does not process browser or database results.

### The skill

`skills/delegate-to-agents/SKILL.md` teaches the blocking `msg … request acp` path and the nonblocking `send` plus `msg … request state` path, model selection, the group/command/depth bounds, screened replies, and failure handling. It also describes the existing harness capture/transcript options without adding harness capabilities or scripts.

### Specs

`product/specs/acp.md` documents the chosen model, delegation verbs, the depth and reach limits, answer screening, and the local tool-loop boundary for remote ACP sessions. `product/specs/agents.md` documents both model flag spellings, placement, catalog validation, refusals, and remote launch behavior. `product/specs/messaging.md` distinguishes capture requests from queued sends. `product/specs/agent-guidance.md` names the new skill; `product/specs/sandbox.md` records that delegated workspace clones use the ordinary sandbox; and `product/specs/tabs.md` states that a delegated worker inherits its creator's group even when another tab is focused.

### Help and documentation

The `agent` row in `help.md` describes `--model`; existing `send` and `msg` rows remain. The advanced-agent delegation page describes both worker shapes, model choice, limits, screening, and failure cases, and is linked from the documentation sidebar. The feature's ready backlog entry is removed.

## Tests

- `src/agent/commands.test.ts` covers both model spellings, positions around names and remote clauses, missing values, flag-looking values, name resolution, and unchanged workspace/remote clauses.
- `src/profile/new-agent.test.ts` covers model validation before workspace creation, local and remote model propagation, default model behavior, depth inheritance, and selecting the named creator instead of the focused tab.
- `src/profile/manager.test.ts` covers creator-label pass-through and the unchanged active-tab default.
- `src/acp/manager.test.ts` covers the selected model, fallback resolution, empty catalog, connection label, and persistence across `acp reset`.
- `src/acp/tool-table.test.ts` covers tool ordering, matching, and the single delegation primer.
- `src/acp/delegation.test.ts` covers recognizers and aliases, each verb, model and depth refusals, group and command boundaries, the creator label when focus differs, reply scanning, and single-line send errors.

## Out of scope

- A harness-specific delegation tool. Existing `harness --model`, `harness capture`, and `harness transcript` remain available to people and are described by the skill.
- A general agent-facing tab-orchestration surface, cross-group targeting, per-worker tool allowlists, or spawn scoping.
- Concurrency, total delegated-tab, cost, or usage limits beyond the depth cap.
- Fan-out across multiple models, central model selection, or changing the model of an already-running session.
- Scanning browser or database results, exposing commands as MCP tools, or adding a harness tool to the ACP table.
- New protocol messages, web-client behavior, or persisted model/depth fields.
- Changing the existing queue semantics: `send` dispatches through the busy queue, while a messaged command uses the capture path directly.
- Scripts or Python in the skill.

## Verification

The implementation was developed with `./scripts/run.mjs check-diff`.

Manual behavior to verify in a running app:

1. `agent scout --model <catalog-model>` and `agent scout --model=<catalog-model>` open tabs whose ACP connection row names the selected model; `acp reset` retains that choice.
2. An unknown model and a valueless `--model` each refuse before a tab or workspace is created. `--model --offline` treats `--offline` as the model value and refuses it.
3. A delegating agent can open a worker, send it a task, poll its state, or block for its `acp` answer. The worker is in the delegator's group even if another tab is focused.
4. A depth-2 worker cannot delegate further, while a person can still type `agent` at any depth.
5. `msg` refuses a command outside `acp`, `state`, and `db`, a `send` to an agent refuses anything except `acp`, and cross-group or missing targets are refused. `send` to a same-group harness types literal input.
6. A worker reply containing a recognized harness control tag or turn marker returns with the relevant text neutralized and one `[harness: …]` line; ordinary text is unchanged.
7. Existing `harness capture` and `harness transcript` behavior remains available for harness workers.
