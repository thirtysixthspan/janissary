# Thread the delegating tab through as the creator of a delegated worker

**Complexity: 3/10** — one optional parameter through two call sites, plus tests. The depth and group arithmetic already exists in `placeAgent` and is correct; only the choice of creator is wrong.

## Goal

A worker opened through the delegation tool takes its `agentDepth` and `group` from `managers.tab.cur()` — the tab that happened to be focused — rather than from the tab whose tool loop emitted the command. The depth counter therefore never climbs for a delegated worker, and the depth-2 cap the primer, the skill, the documentation page, and `product/specs/acp.md` all state does not engage.

Reproduced live before this change: a root tab opened `kaptan`, drove `kaptan`'s own ACP session to emit `agent mihri --no-workspace`, then drove `mihri`'s to emit `agent halil --no-workspace`. `mihri` was recorded at depth 1 because the root tab was focused, so `halil` opened and no cap message was produced, on two fresh app instances.

## Approach

`runAgent` in `src/acp/delegation.ts` already holds the delegating tab's label — it is the `label` the tool table passes in and the one it measures `agentDepth` against. Hand that label to the launch instead of letting the launch re-derive a creator from focus.

`newAgentOp` resolves its creator once, at the top, from a label when one is given and from the active tab otherwise. Every path below it — `launchAgent`, `startWorkspaceAgent`, and `startRemoteAgent` — already takes that resolved `creator` from the launch object and passes it to `placeAgent`, which derives `agentDepth` and `group` from it. So the whole fix is where the creator comes from, and the remote path needs no separate change.

The command bar's behavior is untouched: `src/commands/agent.ts` calls `newAgent` with one argument, so no label is supplied and the creator is still the active tab.

A refusal also lands on the right tab as a side effect. `out` writes to `creator.label`, so a refused delegated launch now reports to the tab that asked for it rather than to whichever tab was focused.

An unknown creator label falls back to the active tab rather than failing: the delegation tool's label always names a live tab, and a fallback keeps the launch working if that ever stops being true.

## Implementation steps

1. Add an optional `creatorLabel` parameter to `newAgentOp` in `src/profile/new-agent.ts`, and resolve `creator` as the tab it names, falling back to `managers.tab.cur()`.
2. Add the matching optional parameter to `ProfileManager.newAgent` in `src/profile/manager.ts` and pass it through.
3. Pass the delegating label from `runAgent` in `src/acp/delegation.ts`.

## Tests

`src/acp/delegation.test.ts`, whose stub already models a delegating tab with a depth and a list of targets:

- A delegating tab at depth 1, with a *different* tab focused, calls `managers.profile.newAgent` with the command and the delegating tab's label — the assertion is on the second argument, since that is what the fix changes.
- A delegating tab at `MAX_AGENT_DEPTH` is still refused with the cap message and `newAgent` is never called.
- The existing "opens a worker below the cap" and "refuses the agent verb at the cap" cases keep their meaning, updated for the new second argument where they assert the call.

`src/profile/new-agent.test.ts`, which owns the creator resolution:

- A launch naming a creator parents the new tab to it even when a different tab is active, so the child's `agentDepth` is the named tab's plus one and its `group` is the named tab's.
- A launch naming a creator that does not exist falls back to the active tab rather than throwing.
- The existing cases, which cover the focus-based default, must keep passing untouched — that is the command bar's behavior and is not what is changing.

## Out of scope

- Moving the depth check itself. It already measures the right tab and stays in the `agent` verb, so a person typing `agent` by hand remains uncapped.
- The `newAgentAt` and `newAgentInWorkspace` paths, which call `placeAgent` with their own creator and are unaffected.
- Per-worker tool allowlists, group-scoped targeting in general, and every other item the feature plan defers to `product/plans/deferred/agent-self-service-tab-orchestration.md`.