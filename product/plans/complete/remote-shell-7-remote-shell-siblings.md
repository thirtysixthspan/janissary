# Remote shell 7 — remote siblings and the remote harness ➕

**Complexity: 5/10** — a `join` mode for `launchTab` with three refusal states, shell plugin routing for remote origins, and a new core RPC wired through seven server sites plus the harness client row.

Run order: 7 of 8 in the remote shell series. Depends on plans 4 and 5. It can land in parallel with plan 6.

A remote shell's ➕ and `Cmd+T`, and a typed `zsh` in a remote tab, are refused today with `A shell tab cannot be opened from a remote tab.` (`activate.ts:39`, `open-tab.ts:18`). The remote harness's ➕ opens a remote agent in its workspace (`newAgentAt`, `src/profile/manager.ts:95-117`). This plan makes all of them open a remote shell that joins the source tab's channel and workspace. It also absorbs the backlog request that the remote harness ➕ open a shell.

## Design decisions

Three actions open a remote sibling that joins the source's channel and workspace:

- a remote shell's ➕ (“New shell in this workspace”) and `Cmd+T`;
- the remote harness's ➕, retitled `New shell in this workspace` (it was `New agent in this workspace`);
- a typed `zsh` without `on` in any remote tab: shell, agent, or harness.

A remote agent's ➕ keeps opening an agent, and every local tab keeps `launchAgentFor`.

A typed `zsh <name>` in a remote tab honors the name under the usual clash checks, and ignores `-w`, `--workspace`, `--no-workspace`, and `--offline`. A sibling inherits the source's offline mode. It starts in the source's remote cwd when that is inside the workspace, and at the workspace root otherwise.

While the source is provisioning:

- the remote shell and remote harness ➕ are dimmed with `Waiting for the workspace` and do nothing;
- `Cmd+T` does nothing;
- a typed `zsh` answers `The remote workspace is not ready yet.`

When the source is detached, reconnecting, or gone, the request posts `The remote workspace is no longer available.` to the feed and opens nothing.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Joining a remote channel | `RemoteManager.attach`/`workspaceOf`/`reconnectingOf` in `src/remote/manager.ts`; `newAgentAt` in `src/profile/manager.ts:95-117` (including `The remote workspace is no longer available.`) |
| Remote launch branch | `src/plugins/launch-tab-remote.ts` (plan 5) |
| Containment check that works on remote absolute paths | `isInsideRoot` in `src/plugins/files.ts:15-21` (`path.resolve` only) |
| Sibling intent and local sibling | the `sibling` intent in `src/plugins/shell/activate.ts`; `openShellTab` in `src/plugins/shell/open-tab.ts` |
| `launchAgentFor` wiring | `src/protocol/core-rpc.ts`, `src/client-params/core.ts:52`, `src/client-message.ts:41`, `src/message/handler.ts:42-43`, `src/message/tabs.ts`, `src/controller/file/navigator-adapter.ts:36,68` |
| Running a plugin command on a tab's behalf | `managers.plugins.runCommand` as used in `src/profile/view-tabs.ts:107` |
| Harness ➕ rendering | `agentTabIntents` in `web/src/shared/agent-tab-intents.ts:29`; `HarnessTab.tsx:71`; ➕ in `web/src/shared/AgentTabMeta.tsx:86` |

## Proposed changes

**`launchTab` join mode.** `TabPluginLaunchRequest.remote` also accepts `{ join: true }`, which joins the origin tab's remote workspace. In `launch-tab-remote.ts`:

- If the origin's `workspaceOf` is undefined, the request is rejected with `The remote workspace is not ready yet.`
- If the origin is reconnecting, or `RemoteManager.attach(label, origin)` refuses, the host posts `The remote workspace is no longer available.` and opens nothing.
- Otherwise it resolves the label (the plugin's `name` or the pool) under the remote name rules with `workspace: false`, attaches, opens the tab with the preset label and the origin's `remote` target, and calls the factory. A failed open releases the attachment.
- The factory gets the existing `TabPluginLaunchStart` fields with no new ones. `workspaceDir` is the origin's remote workspace. `cwd` is the origin's remote cwd when `isInsideRoot` holds, and the workspace root otherwise. The plugin computes no start directory.

**Shell plugin.** In `activate`'s `command`, a remote origin without `on` launches a `join` with the parsed name and ignores workspace flags. The `sibling` intent keeps its provisioning guard; for a remote tab it launches a `join` with no name, and for a local tab it calls `openShellTab` as now. The remote refusals in `activate.ts:39` and `open-tab.ts:18` are deleted. The `join` factory spawns through `spawnShell` at `start.cwd` in `start.workspaceDir`, with the offline mode from `originTab().workspace` (plan 4), so plan 4 routes the spawn remotely.

**`launchShellFor`.** Add the RPC beside `launchAgentFor` at every site that carries it:

- the method in `src/protocol/core-rpc.ts`;
- the parameter guard in `src/client-params/core.ts`;
- the ack table in `src/client-message.ts`;
- the case list in `src/message/handler.ts`;
- the method union and dispatch in `src/message/tabs.ts`;
- the interface and implementation in `src/controller/file/navigator-adapter.ts`.

It runs `managers.plugins.runCommand('shell', 'zsh', { label, command })` with the harness as source, as `view-tabs.ts:107` does, so the line stays out of history and the join routing handles it.

**Client.** `agentTabIntents` gains `onLaunchShellHere`. When `remote` is set, `HarnessTab` passes it with the title `New shell in this workspace`. While `remote.provisioning` is true, it passes a disabled flag and the exact UI title `Waiting for the workspace`. `AgentTabMeta` gains title and disabled props for its ➕. Remote agent tabs and every local tab keep `onLaunchAgentHere` and their current titles.

**Docs.**
- `product/specs/shell-tab.md`, replacing the remote-tab refusal paragraph
- `product/specs/remote-server.md`, for the harness ➕ wording
- `help.md`
- `documentation/user-documentation/getting-started/tabs.md:76`, for the ➕ tooltip
- `documentation/user-documentation/advanced-agents/remote-agents.md`
- `documentation/developer-documentation/tab-plugins.md`, for `remote.join`, with a changelog entry

## Tests

- `src/plugins/launch-tab-remote.test.ts`:
  - `join` while the origin is provisioning, reconnecting, or gone;
  - a name clash;
  - the start `cwd` with the origin's cwd inside and outside the workspace;
  - the attachment released on a failed open.
- `src/plugins/shell/activate.test.ts`: a typed `zsh` and `zsh <name>` from remote shell, agent, and harness origins launch `join`, with flags ignored; the `sibling` intent from a remote tab launches `join`; local siblings are unchanged.
- `src/message/handler.test.ts` and `src/client-params/core.test.ts`: `launchShellFor` routing and its guard.
- Client tests in `HarnessTab.test.tsx`, `AgentTabMeta.test.tsx` (`:113,121`), `agent-tab-intents.test.ts`, `InactiveAgentTabBody.test.tsx`, and `App.test.tsx`: a remote harness sends `launchShellFor` with the new title and is disabled while provisioning; the test asserts the exact `Waiting for the workspace` tooltip. Remote agents and local tabs keep `launchAgentFor`.

## Out of scope

Changes to ➕ on remote agent tabs. Nested `on` from a remote tab, which stays refused (plan 5). Relaunch of siblings (plan 8).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then manually:

- In a remote shell, `cd src`, then press ➕, press `Cmd+T`, and type `zsh scratch`. Confirm each opens a remote shell in the same workspace, starting in `src`.
- On a remote harness, confirm ➕ reads `New shell in this workspace`, is dimmed while provisioning, and then opens a remote shell in the harness's workspace.
- Close the harness and confirm the shell stays usable. Create and rename a file in its navigator.
- Type `zsh` in a remote agent tab and confirm a remote shell opens in its workspace.
