# Conversations plugin — ACP channel in an empty workspaced sandbox

**Complexity: 3/10** — the deliverable is a revision of an unimplemented draft plan (`product/plans/draft/conversations-plugin.md`). No source, test, or spec file changes: nothing in the original plan has been built, so there is no shipped behavior to alter and no functional spec to correct. The complexity that matters is analytical — working out exactly which parts of the drafted design the ACP substitution removes, which it keeps, and which it changes — not mechanical.

## Goal

`product/plans/draft/conversations-plugin.md` currently specifies that conversation responses come from provider HTTP APIs called directly by the server: a new `src/models/` subsystem, a new `@anthropic-ai/sdk` dependency, and a new `models` table in `.janissary/config.json` naming each model and the environment variable holding its key. Rewrite the plan so responses instead come from the ACP channel janissary already owns (`src/acp/index.ts`'s `connectAcp`), with each conversation's agent subprocess confined to an **empty** workspace directory by the existing Seatbelt sandbox.

The revised plan must stay a plan — it is not implemented here. It must be internally consistent after the substitution: every removed piece gone from the design decisions, the reuse table, the proposed changes, the tests, the out-of-scope list, and the verification steps, with nothing left referring to a provider SDK, an API key, or a `models` config setting.

## Approach

The plugin surface the original plan describes — the `chat` command, the singleton list tab, one tab per conversation, derived titles, home-level JSON storage, streaming into the view, the windowed backwards scroll, the confirmed delete — is independent of where responses come from and survives unchanged. The substitution is confined to the response path, model selection, and the sandbox story, and it is a net simplification: it deletes a whole subsystem and a dependency and adds one small provisioning function.

What the substitution replaces:

- **`src/models/` and `@anthropic-ai/sdk`** → `connectAcp` (`src/acp/index.ts`), already agent-agnostic, already streaming, already sandbox-aware via its `workspaceDir`/`offline` options, and already tool-denying by default (`decidePermission` in `src/acp/tools.ts` refuses every permission request when `allowedTools` is empty). No new dependency: `@agentclientprotocol/sdk` is already in `package.json`.
- **The `models` config table and its `keyEnv` availability rule** → the existing per-harness model catalog `harness-models.json`, read through `modelsFor(harness)` (`src/harness/models.ts`) and already user-overridable at `.janissary/harness-models.json`. Selection becomes a `<harness>:<model>` pair over the two ACP-capable harnesses (`claude`, `opencode`) that `spawnMonitorSession` already maps. Availability stops being computable up front — an agent binary is either installed or it is not — so the "unselectable entry" concept goes away and a missing binary surfaces the way it already does for `acp`: as a recorded failure on the turn.
- **The `AbortController` cancellation story** → `AcpSession` exposes no per-prompt abort, only `kill()`. Cancelling therefore kills the conversation's session and forgets it, which the plan must state plainly along with its consequence: the agent-side context is lost, so the next query on that conversation re-primes a fresh session by replaying the stored turns.

What the substitution adds:

- **An empty workspace.** `provisionWorkspace` (`src/workspace/index.ts`) clones the project's `origin`; a conversation must not see the project's files at all. A sibling `provisionEmptyWorkspace(name)` creates the directory and its `<name>.tmp` sibling, trusts it, and clones nothing, with a `WorkspaceManager.createEmpty(name)` entry point so the existing refcount and shutdown cleanup apply unchanged.
- **A shared ACP launch mapping.** The harness → `{command, args, env}` mapping currently lives inside `src/monitor/acp.ts`'s `spawnMonitorSession`, which takes a whole `Persona`. The conversations path has a harness directive but no persona file, so the plan extracts the mapping into `src/acp/launch.ts` and has both callers use it.

## Implementation steps

1. **Rewrite the opening summary and the complexity rating** of `product/plans/draft/conversations-plugin.md`. The rating drops from 8/10 to 7/10 — a new dependency, a new networked subsystem, and a new config setting with its decoder are all gone; the plugin surface, the persistence store, the topic-union change, and the two new tabs remain.
2. **Rewrite the Design decisions section.** Replace the three provider-API decisions (responses from HTTP APIs, one provider client behind a provider-keyed table, the `models` config table) with four: responses come from the existing ACP channel; each conversation's agent runs in an empty workspace under the existing sandbox; model selection reuses `harness-models.json` as a `<harness>:<model>` pair; and cancellation kills the session, with session loss and its replay-on-next-query consequence stated. Keep the decisions on tab layout, the `chat` grammar, derived titles, bus coalescing, failure storage, atomic per-conversation files, home-level storage, and the backwards-extending window; adjust only their wording where it names a provider.
3. **Update the reuse table.** Drop the supply-chain-gate row. Add rows for `connectAcp` and its `AcpSession`/`AcpOptions` types, the tool-denial default, `spawnMonitorSession`'s harness mapping, `isRateLimitError`, the harness model catalog, `sandboxSpawn`, and the workspace provisioning and refcounting entry points.
4. **Rewrite the Proposed changes section.** Delete the Config and Model-subsystem paragraphs. Add paragraphs for the empty-workspace provisioning function, the extracted ACP launch module, and a `src/conversations/sessions.ts` owning one ACP session per conversation (mirroring `EditorAcpManager`, and split out so `manager.ts` stays under the 200-line limit). Rewrite the Conversations-manager paragraph so sending drives `session.prompt` directly — not `runAcpToolLoop`, which is the tab path's autonomous tool loop and is deliberately not reused. Leave the plugin-API, topic-table, server-plugin, client-plugin, and markdown paragraphs intact apart from the model-dropdown wording, and rewrite Ordering to match the new module set.
5. **Rewrite the Tests section.** Drop the `src/config.test.ts`, `src/models/catalog.test.ts`, and `src/models/anthropic.test.ts` cases. Add cases for empty-workspace provisioning, the extracted launch mapping, and the session module, and rewrite the manager cases so cancellation, session loss, and replay are covered instead of `AbortController` behavior. Keep the store, plugin-activation, topic, notification, and client cases.
6. **Update Out of scope and Open questions.** Replace "a second provider client" with the ACP-shaped equivalents: no tool use (the session stays tool-denied), no remote conversations, no connections-panel row for a conversation session. Retire the `DEFAULT_MODELS` open question, which the catalog reuse answers, and keep the two that survive.
7. **Rewrite Verification.** Drop both `check-malicious-package` invocations — there is no new dependency. Rewrite the manual walkthrough so it exercises an installed ACP agent and the empty workspace rather than an exported API key.

Run `./scripts/run.mjs check-diff` after the rewrite.

## Tests

None. The change edits one markdown plan file under `product/plans/`; there is no code path to cover, and the repository has no tests over plan documents. `./scripts/run.mjs check-diff` is still run, and reports no lintable, typecheckable, or testable change.

## Out of scope

- **Implementing the conversations plugin.** The plan stays in `product/plans/draft/` — it is a draft being refined, not a plan being executed.
- **Changing any source file.** The extracted `src/acp/launch.ts`, `provisionEmptyWorkspace`, and `src/conversations/sessions.ts` are described by the revised plan, not written by it.
- **Updating `product/specs/`.** Specs describe shipped behavior; nothing in this plan is shipped.
- **Revising the other draft or deferred plans** that mention model providers.

## Verification

- `./scripts/run.mjs check-diff`.
- Read the revised `product/plans/draft/conversations-plugin.md` end to end and confirm no remaining mention of `@anthropic-ai/sdk`, `src/models/`, `ANTHROPIC_API_KEY`, a `models` config setting, `keyEnv`, or `AbortController`, and that every file path and line reference it cites still resolves in the current tree.
