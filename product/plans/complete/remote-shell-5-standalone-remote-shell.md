# Remote shell 5 — standalone `zsh … on <address>`

**Complexity: 6/10** — a remote mode for `launchTab` reusing the remote-agent name and failure flow, a provisioning payload that renders SSH prompts and then swaps to the remote zsh, an early-exit signal, and parser and routing changes in the shell plugin.

Run order: 5 of 8 in the remote shell series. Depends on plans 1, 3, and 4. Plan 6 adds its metadata row; plans 7 and 8 extend it.

`zsh [name] [-w|--workspace|--no-workspace] [--offline] [on <address>]` opens a standalone remote shell in its own remote workspace, using the same address grammar and workspace provisioning as `agent <name> on <address>`. The `on` clause implies a workspace even with `--no-workspace`. It can appear among the other arguments, and is refused from a remote tab with `Cannot launch a remote shell from a remote tab.`

## Design decisions

Established behavior:

- `on <address>` implies a workspace: `harness … --no-workspace on devbox` still provisions one (`src/harness/command-parse.ts:71-72`).
- A remote agent announces `Agent "<name>" ready on <host>. (workspace: <dir>)` and reports failures as `Failed to start "<name>" on <host>: <reason>` (`src/profile/remote-agent.ts:58-65`).
- A local provisioning shell accepts `send`/`queue` and drains them at the first prompt.

User decisions:

- The command is `zsh [name] [-w|--workspace|--no-workspace] [--offline] on <address>`, with the existing address grammar and remote provisioning rules.
- `on` wins over `--no-workspace`, and `--offline` applies the remote's offline sandbox profile.
- The name is the tab label and the remote clone folder, checked under `agent <name> on <address>`'s rules.
- A standalone remote shell gets its own channel and workspace.
- A remote shell can be launched from a local tab; a remote tab cannot launch another remote shell and reports `Cannot launch a remote shell from a remote tab.`
- The tab opens at once in a provisioning state, with SSH prompts rendered and answerable in its terminal. zsh then starts at the remote workspace root.
- The feed shows `Shell "<name>" ready on <host>. (workspace: <dir>)`, followed by the remote's isolation notice when it sends one. A remote with an inactive sandbox, which is every non-macOS remote, still launches the shell.
- Failures post `Failed to start "<name>" on <host>: <reason>`, with no local fallback.
- A remote zsh that exits before its first prompt posts `Failed to start "<name>" on <host>: zsh exited before its first prompt.` and its tab closes.
- An unknown option is refused with `Unknown option "<word>". Usage: zsh [name] [-w|--workspace|--no-workspace] [--offline] [on <address>]`.
- `zsh … on <address>` typed in a remote tab is refused with `Cannot launch a remote shell from a remote tab.`
- `send` and `queue` into a provisioning remote shell are accepted and drain at its first prompt.

Implementation decision: extend `launchTab` with a remote request rather than adding a dedicated capability. The addition is optional, so `TAB_PLUGIN_API_VERSION` stays at 1.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Host-owned plugin launch | `launchCapabilities` in `src/plugins/launch-tab.ts`; `resolveLaunchLabel` in `src/plugins/launch-tab-label.ts`; `TabPluginLaunchRequest`/`Start`/`Ready` in `src/plugins/api-launch.ts` |
| Remote launch and placeholder | `startRemoteLaunch` in `src/harness/remote-launch.ts:52-104`; `wireProvisioning` in `src/workspace/provision-wire.ts` |
| Remote name resolution and retry | `src/profile/new-agent.ts:36-56` (`workspace: false`, `skip`, `RemoteNameRetry`) |
| Remote failure funnel and reports | `failRemoteLaunch`, `reportRemoteCleanup`, `reportRemoteClone` in `src/launch-name/fail-remote.ts` |
| Address parsing | `parseRemoteAddress` in `src/remote/address.ts:41` |
| Shell parse, launch, payloads | `src/plugins/shell/parse-argument.ts`, `launch-tab.ts`, `spawn-shell.ts`, `shared.ts`, `activate.ts` |
| Client terminal attach and exit | `web/src/plugins/shell/useShellTerminal.ts`, `useShellTabTerminal.ts` |
| Provisioning check for `send`/`queue` | `awaitsTerminal` in `src/tab/plugin-terminals.ts:28` |
| Remote spawn routing | plan 4 |

## Proposed changes

**`launchTab` remote mode.** `TabPluginLaunchRequest` gains an optional `remote: { address: string }`, `TabPluginLaunchStart` an optional `connectPtyId`, and `TabPluginLaunchReady` an optional `host`. Put the branch in a new `src/plugins/launch-tab-remote.ts` and call it from `launchCapabilities`, which is at about 141 code lines. The branch runs these steps:

1. The host validates the raw address token with `parseRemoteAddress` and rejects the request with its error. The plugin cannot import the parser across the plugin boundary.
2. It resolves the label as `src/profile/new-agent.ts:36-56` does, with `workspace: false`, a `skip` list, and a `RemoteNameRetry` whose `relaunch` re-runs this launch.
3. It opens the channel with `startRemoteLaunch` under that label, then opens the tab with a preset label, the preset `remote` target (plan 4), and the requested cwd. The factory receives the channel's SSH PTY as `connectPtyId`.
4. If the tab fails to open, the channel is closed, as `releaseClone` does for a local clone. The tab is busy until ready, as `awaitClone` makes it.
5. `ready` is wired through `wireProvisioning`. On readiness the host calls `reportRemoteCleanup`/`reportRemoteClone`, then runs the ready handler with `workspaceDir` set to the remote path, `displayDir` set to that path unshortened, the remote's notice as `sandboxNotice`, and `host`.
6. Failures go through `failRemoteLaunch` with `kind: 'agent'` (for its pool-name wording) and a `show` that posts `Failed to start "<name>" on <host>: <reason>` to the feed. This replaces the local `failLaunch` (`launch-tab.ts:72`) on this path.

**Parser and routing.** `parseShellArgument` lifts `on <address>` out of the words before lowercasing, keeping the address token's case, and returns it raw. `REMOTE_SHELL_REFUSAL` is deleted, and `SHELL_USAGE` gains `[on <address>]`. In `activate`'s `command`:

- a remote origin with `on` is rejected with `Cannot launch a remote shell from a remote tab.`;
- a local origin with `on` launches with `remote: { address }`, the parsed name, and offline mode;
- every other origin keeps today's behavior, including the existing refusal for a remote origin without `on`, until plan 7.

**Payloads.** In `src/plugins/shell/shared.ts`, the provisioning payload gains optional `connectPtyId` and `host`, and its `workspaceDir` becomes optional, since a standalone remote launch has no directory until ready. `hasTerminalShape` accepts `connectPtyId` only when `provisioning` is set. The terminal payload gains optional `host` and a `prompted` flag, which the first `cwd` intent sets.

`provisioningShell` takes the workspace optionally. The ready handler spawns through `spawnShell` with the remote workspace (routed remotely by plan 4) and `zshHooks`. It posts `Shell "<name>" ready on <host>. (workspace: <dir>)` when `host` is present, and the local line otherwise.

**Client.** `useShellTerminal` attaches a provisioning tab to `connectPtyId` with input enabled, no marker handling, no colour reporting, and no `onExit` close, so SSH's own failure text stays visible until the host closes the tab. It switches to `ptyId` when the ready payload arrives. When a remote shell's PTY exits before `prompted` is set, `useShellTabTerminal` sends a new `exited-early` intent before closing, and the plugin posts the early-exit failure line. If no browser is attached at that moment, the tab closes through `terminal-status` without the line. That is the deliberate ceiling; a host-side exit hook is the upgrade path.

**`send`/`queue`.** `awaitsTerminal` also treats a plugin tab whose payload is provisioning on a remote channel as awaiting a terminal.

**Docs.**
- `product/specs/shell-tab.md`
- `help.md`, including the `zsh` row
- `documentation/user-documentation/command-bar/shell.md`
- `documentation/user-documentation/advanced-agents/remote-agents.md`
- `product/specs/remote-server.md`
- `documentation/developer-documentation/tab-plugins.md`, for `remote.address`, `connectPtyId`, and `host`, with a changelog entry

## Tests

- `src/plugins/shell/parse-argument.test.ts`, replacing `:31-39`: `on <address>` anywhere, address case preserved, `--no-workspace on` still workspaced, and the usage line.
- `src/plugins/launch-tab-remote.test.ts`:
  - an invalid address, name resolution and retry, and `connectPtyId` reaching the factory;
  - readiness with `host` and the notice;
  - the failure line and tab close;
  - the channel released when the tab fails to open or is closed during provisioning.
- `src/plugins/shell/activate.test.ts`, replacing the refusals at `:195,203,221`: local `on` routing, the nested refusal, the remote ready line, and `exited-early` posting only before `prompted`.
- `src/plugins/shell/shared.test.ts`: `connectPtyId` is accepted only while provisioning, and a provisioning payload may omit `workspaceDir`.
- `src/tab/plugin-terminals.test.ts`: `awaitsTerminal` accepts a provisioning remote shell.
- `web/src/plugins/shell/useShellTerminal.test.ts`: attach to `connectPtyId` then `ptyId`; do not close when the SSH PTY exits during provisioning; close after the remote shell PTY exits and the early-exit intent completes.

## Out of scope

The host chip and attach/detach control in the shell tab (plan 6). Remote siblings and the remote harness ➕ (plan 7). Relaunch and attach (plan 8). Non-workspaced remote shells. Nested remoting.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then manually:

- Type `zsh docs on <address>` and answer any SSH prompt in the tab. Confirm `Shell "docs" ready on <host>. (workspace: …)` and that `pwd` prints the remote workspace.
- Repeat with `zsh docs --no-workspace --offline on <address>` and confirm `on` still provisions the remote workspace.
- While another one is provisioning, run `queue <name> pwd` from `janus` and confirm the line runs at the first prompt.
- Type `zsh --bogus on <address>` and confirm the usage line.
- On a host without zsh, confirm the early-exit failure line when a browser is attached before its first prompt; without an attached browser the tab closes without that line.
- Type `zsh x on <address>` inside the remote shell and confirm the nested refusal.
