# Run Agents Beyond Your Laptops

**Complexity: 8/10** — two genuinely different remote-spawn mechanisms are needed (ACP's stdio subprocess vs. PTY-based harness/shell), a new shared-connection-lifecycle subsystem, new state semantics, and UI surface — a first-of-its-kind transport-location feature touching most of the launch path.

## Summary

Allow Janissary to run agent tabs inside isolated sandboxes on a remote VM or cloud instance, connected over SSH. The user types `agent <name> on <address>` to start an agent on the remote machine; a harness is started remotely the same way, or by a profile harness entry carrying a `remote` field. The remote agent's output streams back to a local transcript tab, and the user interacts with it identically to a local agent — same commands, same scheduling, same monitoring. The compute location becomes transparent to the user, per the "identical control of local and remote resources" design principle.

## Decisions (to be confirmed with user)

1. **Transport: SSH.** Remote execution uses SSH as the transport, reusing the existing `ssh` infrastructure (`src/ssh.ts`, `specs/ssh-tab.md`). No new protocol or daemon required.
2. **Command-based for agents.** A remote agent is created by the typed `agent <name> on <address>` command; profiles do not open agent tabs, so there is no profile route to one. The remote target is recorded on the tab (`tab.remote`), which is what makes it composable with scheduling, workspaces, and the sessions tab. A harness keeps both routes: the typed `harness … on <address>` and a profile harness entry with a `remote` field.
3. **Bind mount / agent state file.** The remote agent's state file (`.janissary/state/<name>.json`) lives on the remote machine. A `--pull-state` flag copies it back to the local machine for local-continuation workflows (or vice versa with `--push-state` to resync).
4. **Workspace handling.** If the launch is workspaced, the clone happens on the remote side into the remote `.janissary/workspace/<name>/`. No local clone unless `--local-workspace` is explicitly requested.
5. **Shared session scope.** Tabs using the same remote host share one SSH connection (multiplexed via SSH's `ControlMaster`), reducing connection overhead.

## The central fact this plan must be built around

**ACP agent tabs and harness/shell tabs use two completely different subprocess mechanisms, so "remote agents" needs two different remote-spawn implementations, not one.**

- ACP agents (agent tabs opened by the typed `agent <name> on <address>` command — the plan's primary target) never touch `node-pty`/`PseudoterminalManager` at all. `AcpManager.run()` → `AcpManager.session()` → `connectAcp()` (`src/acp.ts:25-39`) spawns the agent binary directly via `node:child_process.spawn(command, args, { stdio: ['pipe','pipe','pipe'], cwd, env })` and drives it as JSON-RPC over stdin/stdout (`ndJsonStream` from `@agentclientprotocol/sdk`). There is no PTY involved — the agent's "terminal" is a set of stdio pipes.
- Harness tabs (`ProfileHarnessEntry` profile entries) and shell tabs *do* go through `PseudoterminalManager.spawn()` (`src/pseudoterminal-manager.ts:20`), called from `HarnessManager.openFromProfile` (`src/harness-manager.ts:70`) via `managers.pty.spawn(label, program, command, cwd, workspaceDir, offline)`. This is the only place `node-pty` is actually used.

The plan's original section 2 ("Remote PTY proxy" plugged into `PseudoterminalManager.spawn()`) only covers the harness/shell case. It does nothing for ACP agents, because there is no PTY step in their launch path to intercept. Making ACP agents remote needs a change in `src/acp.ts`/`connectAcp`, not in `PseudoterminalManager`. See the redesigned Proposed changes below — this is by far the most important correction in this pass.

## What already exists (reuse, don't rebuild)

| Need | Existing mechanism | Location |
| --- | --- | --- |
| SSH connection lifecycle, PTY management, key forwarding (for the interactive `ssh` tab, a *user-facing* SSH connection, separate concern from remote spawning) | `src/ssh.ts` / `src/ssh-manager.ts`, `specs/ssh-tab.md` | — |
| Workspace cloning | `src/workspace.ts` / `WorkspaceManager` (`managers.workspace.create(name)`), used today by `ProfileManager.newAgent` (`src/profile-manager.ts:44`) for local clones only | `src/workspace.ts`, `src/profile-manager.ts:42-47` |
| Remote target parsing for agents | `parseAgentCommand` (`src/agent/commands.ts`) already parses the `on <address>` clause of `agent <name> on <address>`, and `newAgentOp` (`src/profile/new-agent.ts`) hands a remote launch to `startRemoteAgent` (`src/profile/remote-agent.ts`), which places the tab with `tab.remote` set. | `src/agent/commands.ts`, `src/profile/new-agent.ts`, `src/profile/remote-agent.ts` |
| Structured, extensible harness-entry configuration | `ProfileHarnessEntry` (`src/profile/types.ts`) — the one profile entry that launches an AI tab, already carrying a validated `remote` field (`src/profile/schema-tab-entry.ts`). | `src/profile/types.ts`, `src/profile/schema-tab-entry.ts` |
| Where launches actually become tabs | Agents: `newAgentOp` → `startRemoteAgent` for the typed command. Harnesses: `openProfileEntries` → `openHarnessEntry` (`src/profile/agent-opener.ts`, `src/profile/entry-openers.ts`) for `profile launch <name>`, and the harness manager for the typed `harness` command. |
| State persistence | Agent state is JSON, one file per agent, written via `TabManager.persist`/`buildAgentState` under `.janissary/state/<name>.json` | `src/tab-manager.ts` (`persist`, `buildAgentState`), `src/agent-state.ts` |

## Verified codebase facts that shape the design

- **The tab model is transport-agnostic on the client side.** `TabView` carries rendered log/buffer data — the client renders whatever the server produces, regardless of whether entries originated locally or remotely. The only server-side requirement is timely streaming, which differs by mechanism (see above).
- **`connectAcp` already wraps the local spawn with `sandboxSpawn`** (`src/acp.ts:27-34`), a macOS Seatbelt sandbox scoped to `workspaceDir`/`offline`. That sandboxing is local-machine-only and has no meaning for a process running on a different host — a remote `connectAcp` path must bypass `sandboxSpawn` entirely rather than try to apply it to an SSH child process (decide this explicitly rather than leaving it ambiguous).
- **PTY management is per-tab and keyed by `ptyId`.** `PseudoterminalManager` (`src/pseudoterminal-manager.ts`) is the right integration point for harness/shell remote execution specifically (see central fact above), reusing the existing `pty` RPC channel (`ptyInput`, `ptyData`, `ptyExit`) for streaming once a remote PTY is plugged in.

## Proposed changes

### 1. Remote model

- Agents: the remote target comes from the typed command's `on <address>` clause and is already stored on the tab as `tab.remote`; no profile model change is involved, since profiles do not open agent tabs.
- Harnesses: a profile harness entry's `remote` field is the only profile-side input. Validation (rejecting an empty host, requiring a non-loopback host) belongs where each launch becomes a tab — `parseAgentCommand`/`startRemoteAgent` for agents and `openHarnessEntry` for harness entries — not in a nonexistent `ProfileManager.parseProfile()`.

### 2a. Remote ACP spawn (the primary case — see "central fact" above)

- Modify `connectAcp` (`src/acp.ts:25-39`) to accept an optional `remote?: RemoteConfig` on `AcpOptions` (`src/types.ts`). When set:
  - Skip `sandboxSpawn` entirely (it's a local macOS Seatbelt wrapper with no remote meaning — see Verified codebase facts).
  - Spawn `ssh` instead of the agent binary directly: `spawn('ssh', [...sshFlags(remote), '--', options.command, ...options.args], { cwd: undefined, stdio: ['pipe','pipe','pipe'], env })` (no local `cwd` — the command's own `cd` or a remote shell wrapper handles the remote working directory instead, since `child_process.spawn`'s `cwd` only applies locally).
  - Everything downstream (`ndJsonStream`, the ACP JSON-RPC client) is unchanged — SSH transparently pipes the remote process's stdio through the local `ssh` child process's stdio, so the existing protocol plumbing needs no changes at all. This is a small, contained change, not a new proxy module.
- `AcpManager.session()`/`run()` (`src/acp-manager.ts:56,92-121`) thread the tab's `remote` config (from the `agent … on <address>` command that created it — see 2c) into the `AcpOptions` passed to `connectAcp`.

### 2b. Remote PTY proxy (harness/shell tabs only)

- New module `src/remote-pty.ts`:
  - `spawnRemotePty(config: RemoteConfig, cmd: string): PtyLike` — returns an object matching the same shape `PseudoterminalManager` already expects from `node-pty` (`onData`, `write`, `resize`, `kill`, `onExit` with `{ exitCode, signal }`).
  - Internally uses `child_process.spawn('ssh', [...flags, '--', cmd])` with `ControlMaster=auto` for connection sharing. Stdout/stderr are streamed back as PTY data.
  - Handles reconnection: if the SSH connection drops, `onExit` fires with exit code 255 (SSH connection error), the tab closes, and the user can relaunch.
- `PseudoterminalManager.spawn()` (`src/pseudoterminal-manager.ts:20`) gains a `remote?: RemoteConfig` parameter. When set, delegates to `spawnRemotePty` instead of `node-pty.spawn`.

### 2c. Agent/harness launch flow

- Agents enter through the typed command. Specifically:
  - `newAgentOp` → `startRemoteAgent` (`src/profile/new-agent.ts`, `src/profile/remote-agent.ts`): the tab is already placed with `tab.remote`. Thread that through to wherever the tab's first ACP connection is established (see 2a) — since ACP connects lazily on first prompt (`AcpManager.session`), `AcpManager.run()` reads `tab.remote` when it builds the `AcpOptions`.
- Harnesses enter through both the typed `harness` command and a profile harness entry:
  - `openHarnessEntry` (`src/profile/entry-openers.ts`): when `entry.remote` is set, pass it through to `managers.harness.openFromProfile` → `managers.pty.spawn(...)` (see 2b).
- Workspace cloning: a remote workspace clone (`ssh <host> 'git clone <url> ...'`) is new logic with no local precedent to reuse; write it as a small remote-specific helper rather than trying to force `WorkspaceManager.create` (which assumes a local filesystem) to do double duty.
- `--pull-state` / `--push-state`: since remote agents are launched by `agent <name> on <address>`, these belong on that command (`agent <name> --pull-state` / `--push-state`, parsed by `parseAgentCommand` in `src/agent/commands.ts`), acting on the named tab's `tab.remote`.

### 3. Shared SSH connection manager

- New module `src/remote-manager.ts`:
  - Maintains a `Map<hostString, { connectionCount: number; masterPid?: number }>` — reference-counted shared connections.
  - On first agent launch against a host: opens a `ControlMaster` SSH connection as a background process.
  - On last agent close against a host: kills the master connection via `ssh -O exit <host>`.
  - Connection health check fires periodically (every 30s via the existing one-second `ScheduleManager` tick pattern, but at a reduced frequency) to detect dropped connections early.

### 4. UI indicators

- Web UI: remote agents show a small cloud/host indicator in the tab strip, appended to the tab label or as a tooltip. `TabView` gains a `remoteHost?: string` computed field derived from the tab's `tab.remote`.
- The connections panel is `web/src/StatusPanels.tsx` (not a `ConnectionsWindow`, which doesn't exist) — list the remote host alongside the SSH connection there. `ConnectionView` (`src/protocol.ts:10`) carries `text` and `kind`, not `name` — reuse `text` for the display string (e.g. `acp:build-agent@my-host`) rather than adding a `name` field.

### 5. Config and environment

- `specs/application-config.md`: no new config keys. Remote host identity is per tab (the `on <address>` it was launched with), not global.
- `specs/ssh-tab.md`: add a cross-reference that the same SSH transport now also powers remote agent/harness spawning, alongside the interactive `ssh` tab.

### 6. Specs

- New `specs/remote-agents.md`: remote execution through `agent … on <address>` and remote harness launches, the ACP-vs-harness spawn distinction, the `agent --pull-state`/`--push-state` workflow, shared connection model, remote workspace semantics, PTY proxy architecture, UI indicators.
- `specs/agents.md`: document `--pull-state`/`--push-state` alongside the existing `on <address>` clause in the agent creation section.
- `specs/profiles.md`: note that a harness entry's `remote` now runs through the shared connection model.

### 7. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/acp.test.ts` (existing file): remote `AcpOptions` spawns `ssh` with the right flags/command instead of the local binary, and skips `sandboxSpawn` when `remote` is set.
- `src/remote-pty.test.ts`: spawns against a local SSH session (test against `localhost` with key auth), verifies stdout/stderr streaming, exit code propagation, resize passthrough, connection-drop handling.
- `src/remote-manager.test.ts`: connection sharing, ref-counting, idle cleanup.
- `src/profile/remote-agent.test.ts` and `src/profile/entry-openers.test.ts` (existing files): the remote agent dispatch path from the typed command and the remote `ProfileHarnessEntry` dispatch path (lightweight unit tests with mocked `AcpManager`/`PseudoterminalManager`), invalid-host rejection.
- `src/agent/commands.test.ts`: `agent --pull-state`/`--push-state` parsing.

## Out of scope

- Automatic reconnection/session resumption after a dropped SSH connection mid-turn (the connection-drop handling above treats a drop as a hard failure the user relaunches from).
- Load balancing or scheduling agents across multiple remote hosts automatically.
- Remote-to-remote agent communication concerns beyond what already works: `msg`/`broadcast` between two agents on different remote hosts needs no new code, since both tabs' output streams back through the same local server either way — not explicitly tested by this plan, but not blocked by it either.
- Non-SSH transports (a cloud provider API, containers without SSH access).

## Verification

- `./scripts/run.mjs check-diff` after each implementation step.
- Manual end-to-end check (requires SSH access to a real or loopback test host): type `agent <name> on <host>` against a reachable host, confirm the ACP agent tab connects and a prompt round-trips through the remote process; separately, a harness profile entry with `remote` set should open its tab and stream PTY output identically to a local harness tab. Kill the SSH connection mid-session and confirm the tab reports the drop rather than hanging.

## Implementation order

1. Remote model: a `RemoteConfig` type derived from the tab's `tab.remote` (agents) and a harness entry's `remote` (harnesses), tests. No dependency on later steps — both are already parsed (see "What already exists").
2. Remote ACP spawn: `connectAcp`/`AcpOptions` changes in `src/acp.ts`, threaded through `AcpManager`, tests. Depends on step 1 for the `RemoteConfig` type.
3. Remote PTY proxy: `src/remote-pty.ts` + integration into `PseudoterminalManager`, tests. Independent of step 2; can land in parallel.
4. Launch-flow wiring: validation + dispatch in `startRemoteAgent` for typed agents (uses step 2) and in `openHarnessEntry` for harness entries (uses step 3), plus a remote workspace-clone helper, tests.
5. Shared connection manager: `src/remote-manager.ts`, tests. Depends on steps 2-3 existing to have connections to share.
6. `agent --pull-state`/`--push-state`: extend `parseAgentCommand` in `src/agent/commands.ts`, tests.
7. UI indicators: `TabView.remoteHost` + `StatusPanels.tsx` + tab-strip indicator.
8. Specs: new `remote-agents.md` + amendments to agents, profiles, ssh-tab, application-config.
9. Public documentation.

Each step leaves the app working; run `./scripts/run.mjs check-diff` after each.
