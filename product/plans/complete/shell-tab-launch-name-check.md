# Name shell tabs through the launch-name check

**Complexity: 2/10** — one pure naming helper changes its inputs, and the session rows are threaded from the tab manager through two tab-opening functions; no wire, client, or plugin-contract change.

## Goal

A new shell tab takes its name from the agent-name pool by the same rule an unnamed agent launch uses: the name must be free of every open tab and of every harness or agent session row that is provisioning, active, reconnecting, or detached. The spec already says shells are named "exactly as an unnamed agent tab is"; today they only avoid open tab labels, so a shell can take the name of a detached remote agent and block that agent from coming back under its own label.

## Context

`addPluginTab` in `src/tab/creators.ts` names an agent-named plugin tab with `unusedAgentName` from `src/tab/unique-labels.ts`, which calls `resolveAgentName('agent', labels)` with the open tab labels only. An unnamed agent goes through `resolveLocalLaunchName` in `src/launch-name/local.ts`, which calls the pure `checkLaunchName` in `src/launch-name/check.ts` with `poolCandidates()`, the open tab labels, and `managers.sessions.view()`. `checkLaunchName` rejects a candidate held by an open tab (case-insensitive) or by a harness or agent row in a clashing state, and answers `{ accepted: false }` when the pool runs out.

`addPluginTab` is pure and is reached from `openPluginTab` in `src/tab/openers.ts`, which is called from `TabOpeningState.openPluginTab` in `src/tab/opening-state.ts`. Only `TabOpeningState` holds `Managers`, so it is where the session rows are read.

## Approach

- `unusedAgentName(tabs, rows)` calls `checkLaunchName({ name: '', explicit: false, tabs: labels, rows, candidates: poolCandidates() })` and returns the accepted name, or `undefined` when the pool is exhausted. `addPluginTab` keeps falling back to `uniquePluginLabel(tabs, labelPrefix)` then, so the `shell`, `shell-2` fallback is unchanged.
- `addPluginTab` and `openPluginTab` in `openers.ts` gain a trailing `rows: readonly LaunchNameRow[] = []` parameter after `agentNamed`.
- `TabOpeningState.openPluginTab` reads `this.managers.sessions.view()` only when `agentNamed` is set, so plugins that do not ask for agent names (and test stubs without a sessions manager) never touch it.

The local workspace-running check that `resolveLocalLaunchName` adds for `-w` launches does not apply: a shell creates no workspace folder of its own. No notification is posted when the pool runs out, because a shell falls back to its prefix label rather than being refused.

Rejected alternative: calling `resolveLocalLaunchName` directly. It posts refusals to the notifications feed and handles workspace folders, neither of which a shell tab needs, and it would pull `Managers` into the pure creator.

## Implementation steps

1. In `src/tab/unique-labels.ts`, make `unusedAgentName` take the session rows and use `checkLaunchName` with `poolCandidates()`.
2. In `src/tab/creators.ts`, add the `rows` parameter to `addPluginTab` and pass it to `unusedAgentName`.
3. In `src/tab/openers.ts`, add the `rows` parameter to `openPluginTab` and pass it to `addPluginTab`.
4. In `src/tab/opening-state.ts`, pass `this.managers.sessions.view()` when `agentNamed` is true.

## Tests

- `src/tab/creators.test.ts`: with every pool name but the first two held by open tabs and a detached agent session row holding the first, the shell takes the second.
- `src/tab/creators.test.ts`: a `terminated` session row holding a name does not block it.
- `src/tab/creators.test.ts`: once every free pool name is held by a session row, the shell falls back to the `shell` prefix label.
- `src/tab/opening-state.test.ts`: an agent-named plugin open reads the sessions manager's rows and passes over a name a detached row holds.
- Existing naming tests in `src/tab/creators.test.ts` keep passing.

## Spec

`product/specs/shell-tab.md`: the naming paragraph states that a shell passes over names held by a harness or agent session that is provisioning, active, reconnecting, or detached, as an unnamed agent does, and points at the "Name clashes" section of `product/specs/agents.md`.

## Out of scope

- The `shell`, `shell-2` fallback still checks only open tab labels.
- Renaming an already-open shell tab when a session row later claims its name.
