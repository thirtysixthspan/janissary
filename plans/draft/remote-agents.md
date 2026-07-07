# Run Agents Beyond Your Laptops

**Complexity: 8/10** — two genuinely different remote-spawn mechanisms are needed (ACP's stdio subprocess vs. PTY-based harness/shell), a new shared-connection-lifecycle subsystem, new profile/state semantics, and UI surface — a first-of-its-kind transport-location feature touching most of the launch path.

## Summary

Allow Janissary to run agent tabs inside isolated sandboxes on a remote VM or cloud instance, connected over SSH. The user creates a remote profile that points at an SSH target; launching an agent against that profile starts the agent on the remote machine. The remote agent's output streams back to a local transcript tab, and the user interacts with it identically to a local agent — same commands, same scheduling, same monitoring. The compute location becomes transparent to the user, per the "identical control of local and remote resources" design principle.

## Decisions (to be confirmed with user)

1. **Transport: SSH.** Remote execution uses SSH as the transport, reusing the existing `ssh` infrastructure (`src/ssh.ts`, `specs/ssh-tab.md`). No new protocol or daemon required.
2. **Profile-based, not command-based.** A remote agent is created via a profile entry with a `remote` field pointing at an SSH host, rather than a one-off `agent --remote host` CLI flag. This makes remoting a persistent property of the agent, composable with scheduling, workspaces, and relaunch.
3. **Bind mount / agent state file.** The remote agent's state file (`.janissary/state/<name>.json`) lives on the remote machine. A `--pull-state` flag copies it back to the local machine for local-continuation workflows (or vice versa with `--push-state` to resync).
4. **Workspace handling.** If the profile specifies `--workspace`, the clone happens on the remote side into the remote `.janissary/workspace/<name>/`. No local clone unless `--local-workspace` is explicitly requested.
5. **Shared session scope.** Tabs using the same remote profile share one SSH connection (multiplexed via SSH's `ControlMaster`), reducing connection overhead.

## The central fact this plan must be built around

**ACP agent tabs and harness/shell tabs use two completely different subprocess mechanisms, so "remote agents" needs two different remote-spawn implementations, not one.**

- ACP agents (`AgentState` profile entries — the plan's stated primary target, "launching an agent against that profile") never touch `node-pty`/`PseudoterminalManager` at all. `AcpManager.run()` → `AcpManager.session()` → `connectAcp()` (`src/acp.ts:25-39`) spawns the agent binary directly via `node:child_process.spawn(command, args, { stdio: ['pipe','pipe','pipe'], cwd, env })` and drives it as JSON-RPC over stdin/stdout (`ndJsonStream` from `@agentclientprotocol/sdk`). There is no PTY involved — the agent's "terminal" is a set of stdio pipes.
- Harness tabs (`ProfileHarnessEntry` profile entries) and shell tabs *do* go through `PseudoterminalManager.spawn()` (`src/pseudoterminal-manager.ts:20`), called from `HarnessManager.openFromProfile` (`src/harness-manager.ts:70`) via `managers.pty.spawn(label, program, command, cwd, workspaceDir, offline)`. This is the only place `node-pty` is actually used.

The plan's original section 2 ("Remote PTY proxy" plugged into `PseudoterminalManager.spawn()`) only covers the harness/shell case. It does nothing for ACP agents, because there is no PTY step in their launch path to intercept. Making ACP agents remote needs a change in `src/acp.ts`/`connectAcp`, not in `PseudoterminalManager`. See the redesigned Proposed changes below — this is by far the most important correction in this pass.

## What already exists (reuse, don't rebuild)

| Need | Existing mechanism | Location |
| --- | --- | --- |
| SSH connection lifecycle, PTY management, key forwarding (for the interactive `ssh` tab, a *user-facing* SSH connection, separate concern from remote spawning) | `src/ssh.ts` / `src/ssh-manager.ts`, `specs/ssh-tab.md` | — |
| Workspace cloning | `src/workspace.ts` / `WorkspaceManager` (`managers.workspace.create(name)`), used today by `ProfileManager.newAgent` (`src/profile-manager.ts:44`) for local clones only | `src/workspace.ts`, `src/profile-manager.ts:42-47` |
| Structured, extensible profile-entry configuration | `ProfileEntry = AgentState | ProfileHarnessEntry` (`src/types.ts:221`) — profile files are plain `.json`, one per agent, parsed with a bare `JSON.parse` in `loadProfileEntries` (`src/profiles.ts:42-62`). Adding a `remote?: RemoteConfig` field to `AgentState`/`ProfileHarnessEntry` needs **no new parsing code** — `JSON.parse` already round-trips any field present in the file. | `src/profiles.ts:42-62`, `src/types.ts:221` |
| Where profile entries actually get launched into tabs | `openProfileEntries` → `openAgentEntry` (ACP) / `openHarnessEntry` (harness) in `src/profile-agent-opener.ts:40-68,93-135`, invoked from `ProfileManager.run()` (`profile launch <name>`, `src/profile-manager.ts:11-31`) — **not** `src/commands/agent.ts`, which only handles the ad-hoc `agent <name>` command (`ProfileManager.newAgent`) and never reads a profile file at all. |
| State persistence | Agent state is JSON, one file per agent, written via `TabManager.persist`/`buildAgentState` under `.janissary/state/<name>.json` | `src/tab-manager.ts` (`persist`, `buildAgentState`), `src/agent-state.ts` |

## Verified codebase facts that shape the design

- **The tab model is transport-agnostic on the client side.** `TabView` carries rendered log/buffer data — the client renders whatever the server produces, regardless of whether entries originated locally or remotely. The only server-side requirement is timely streaming, which differs by mechanism (see above).
- **`connectAcp` already wraps the local spawn with `sandboxSpawn`** (`src/acp.ts:27-34`), a macOS Seatbelt sandbox scoped to `workspaceDir`/`offline`. That sandboxing is local-machine-only and has no meaning for a process running on a different host — a remote `connectAcp` path must bypass `sandboxSpawn` entirely rather than try to apply it to an SSH child process (decide this explicitly rather than leaving it ambiguous).
- **PTY management is per-tab and keyed by `ptyId`.** `PseudoterminalManager` (`src/pseudoterminal-manager.ts`) is the right integration point for harness/shell remote execution specifically (see central fact above), reusing the existing `pty` RPC channel (`ptyInput`, `ptyData`, `ptyExit`) for streaming once a remote PTY is plugged in.

## Proposed changes

### 1. Profile model

- Add `remote?: RemoteConfig` to `AgentState` and `ProfileHarnessEntry` (`src/types.ts`), where `RemoteConfig = { host: string; user?: string; port?: number; identityFile?: string }`. No new parsing code is needed for this by itself — `loadProfileEntries`'s plain `JSON.parse` (`src/profiles.ts:50`) already round-trips any field present in the `.json` file once the type includes it.
- Validation (rejecting an empty `host`, requiring a non-loopback host) belongs in `openProfileEntries`/`openAgentEntry`/`openHarnessEntry` (`src/profile-agent-opener.ts`) — the actual point where an entry is turned into a running tab — not in a nonexistent `ProfileManager.parseProfile()` (no such method exists; profile files are validated where they're opened, not where they're loaded).

### 2a. Remote ACP spawn (the primary case — see "central fact" above)

- Modify `connectAcp` (`src/acp.ts:25-39`) to accept an optional `remote?: RemoteConfig` on `AcpOptions` (`src/types.ts`). When set:
  - Skip `sandboxSpawn` entirely (it's a local macOS Seatbelt wrapper with no remote meaning — see Verified codebase facts).
  - Spawn `ssh` instead of the agent binary directly: `spawn('ssh', [...sshFlags(remote), '--', options.command, ...options.args], { cwd: undefined, stdio: ['pipe','pipe','pipe'], env })` (no local `cwd` — the command's own `cd` or a remote shell wrapper handles the remote working directory instead, since `child_process.spawn`'s `cwd` only applies locally).
  - Everything downstream (`ndJsonStream`, the ACP JSON-RPC client) is unchanged — SSH transparently pipes the remote process's stdio through the local `ssh` child process's stdio, so the existing protocol plumbing needs no changes at all. This is a small, contained change, not a new proxy module.
- `AcpManager.session()`/`run()` (`src/acp-manager.ts:56,92-121`) thread the tab's `remote` config (from the profile entry that created it — see 2c) into the `AcpOptions` passed to `connectAcp`.

### 2b. Remote PTY proxy (harness/shell tabs only)

- New module `src/remote-pty.ts`:
  - `spawnRemotePty(config: RemoteConfig, cmd: string): PtyLike` — returns an object matching the same shape `PseudoterminalManager` already expects from `node-pty` (`onData`, `write`, `resize`, `kill`, `onExit` with `{ exitCode, signal }`).
  - Internally uses `child_process.spawn('ssh', [...flags, '--', cmd])` with `ControlMaster=auto` for connection sharing. Stdout/stderr are streamed back as PTY data.
  - Handles reconnection: if the SSH connection drops, `onExit` fires with exit code 255 (SSH connection error), the tab closes, and the user can relaunch.
- `PseudoterminalManager.spawn()` (`src/pseudoterminal-manager.ts:20`) gains a `remote?: RemoteConfig` parameter. When set, delegates to `spawnRemotePty` instead of `node-pty.spawn`.

### 2c. Agent/harness launch flow

- The integration point is `src/profile-agent-opener.ts`, not `src/commands/agent.ts` (which only handles the ad-hoc, profile-less `agent <name>` command — see "What already exists" table). Specifically:
  - `openAgentEntry` (`src/profile-agent-opener.ts:40-50`): when `state.remote` is set, thread it through to wherever the tab's first ACP connection is established (see 2a) — since ACP connects lazily on first prompt (`AcpManager.session`), this likely means storing `remote` on the `Tab`/`AgentState` so `AcpManager.run()` can read it, mirroring how `cwd`/`context`/`schedule` are already threaded from `state` onto the tab today (lines 46-48).
  - `openHarnessEntry` (`src/profile-agent-opener.ts:54-68`): when `entry.remote` is set, pass it through to `managers.harness.openFromProfile` → `managers.pty.spawn(...)` (see 2b).
  - Workspace cloning: `openAgentEntry`/`openHarnessEntry` don't clone workspaces today — cloning only happens in the ad-hoc `ProfileManager.newAgent` path (`src/profile-manager.ts:42-47`, local-only). A remote workspace clone (`ssh <host> 'git clone <url> ...'`) is new logic with no local precedent to reuse; write it as a small remote-specific helper rather than trying to force `WorkspaceManager.create` (which assumes a local filesystem) to do double duty.
- `--pull-state` / `--push-state`: since remote agents are launched via `profile launch <name>` (not `agent <name>`), these belong as new `profile` subcommands (`profile pull-state <name>` / `profile push-state <name>`, extending `PROFILE_USAGE` in `src/profiles.ts:64` and `parseProfileCommand`), not flags on `agent`. `agent --pull-state`/`--push-state` would be dead code, since `agent <name>` never has a `remote` config to pull from.

### 3. Shared SSH connection manager

- New module `src/remote-manager.ts`:
  - Maintains a `Map<hostString, { connectionCount: number; masterPid?: number }>` — reference-counted shared connections.
  - On first agent launch against a host: opens a `ControlMaster` SSH connection as a background process.
  - On last agent close against a host: kills the master connection via `ssh -O exit <host>`.
  - Connection health check fires periodically (every 30s via the existing one-second `ScheduleManager` tick pattern, but at a reduced frequency) to detect dropped connections early.

### 4. UI indicators

- Web UI: remote agents show a small cloud/host indicator in the tab strip, appended to the tab label or as a tooltip. `TabView` gains a `remoteHost?: string` computed field derived from the tab's profile metadata.
- The connections panel is `web/src/StatusPanels.tsx` (not a `ConnectionsWindow`, which doesn't exist) — list the remote host alongside the SSH connection there. `ConnectionView` (`src/protocol.ts:10`) carries `text` and `kind`, not `name` — reuse `text` for the display string (e.g. `acp:build-agent@my-host`) rather than adding a `name` field.

### 5. Config and environment

- `specs/application-config.md`: no new config keys. Remote host identity is profile-scoped, not global.
- `specs/ssh-tab.md`: add a cross-reference that the same SSH transport now also powers remote agent/harness spawning, alongside the interactive `ssh` tab.

### 6. Specs

- New `specs/remote-agents.md`: profile-based remote execution, the ACP-vs-harness spawn distinction, `profile pull-state`/`push-state` workflow, shared connection model, remote workspace semantics, PTY proxy architecture, UI indicators.
- `specs/agents.md`: one sentence in the agent creation section noting that agent profiles may include a `remote` key dispatching execution to a remote host.
- `specs/profiles.md`: extend the profile structure documentation to include `remote`, and document the new `profile pull-state`/`push-state` subcommands.

### 7. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/acp.test.ts` (existing file): remote `AcpOptions` spawns `ssh` with the right flags/command instead of the local binary, and skips `sandboxSpawn` when `remote` is set.
- `src/remote-pty.test.ts`: spawns against a local SSH session (test against `localhost` with key auth), verifies stdout/stderr streaming, exit code propagation, resize passthrough, connection-drop handling.
- `src/remote-manager.test.ts`: connection sharing, ref-counting, idle cleanup.
- `src/profile-agent-opener.test.ts` (existing file — verify before assuming): remote `AgentState`/`ProfileHarnessEntry` dispatch path (lightweight unit tests with mocked `AcpManager`/`PseudoterminalManager`), invalid-host rejection.
- `src/profiles.test.ts` (existing file, if present — verify): `profile pull-state`/`push-state` command parsing.

## Out of scope

- Automatic reconnection/session resumption after a dropped SSH connection mid-turn (the connection-drop handling above treats a drop as a hard failure the user relaunches from).
- Load balancing or scheduling agents across multiple remote hosts automatically.
- Remote-to-remote agent communication concerns beyond what already works: `msg`/`broadcast` between two agents on different remote hosts needs no new code, since both tabs' output streams back through the same local server either way — not explicitly tested by this plan, but not blocked by it either.
- Non-SSH transports (a cloud provider API, containers without SSH access).

## Verification

- `./scripts/run.mjs check-diff` after each implementation step.
- Manual end-to-end check (requires SSH access to a real or loopback test host): create a profile entry with a `remote` field pointing at a reachable host, `profile launch <name>`, confirm the ACP agent tab connects and a prompt round-trips through the remote process; separately, a harness profile entry with `remote` set should open its tab and stream PTY output identically to a local harness tab. Kill the SSH connection mid-session and confirm the tab reports the drop rather than hanging.

## Implementation order

1. Profile model: `RemoteConfig` type on `AgentState`/`ProfileHarnessEntry`, tests. No dependency on later steps — parsing is automatic via `JSON.parse` (see "What already exists").
2. Remote ACP spawn: `connectAcp`/`AcpOptions` changes in `src/acp.ts`, threaded through `AcpManager`, tests. Depends on step 1 for the `RemoteConfig` type.
3. Remote PTY proxy: `src/remote-pty.ts` + integration into `PseudoterminalManager`, tests. Independent of step 2; can land in parallel.
4. Launch-flow wiring: `src/profile-agent-opener.ts` validation + dispatch for both `openAgentEntry` (uses step 2) and `openHarnessEntry` (uses step 3), plus a remote workspace-clone helper, tests.
5. Shared connection manager: `src/remote-manager.ts`, tests. Depends on steps 2-3 existing to have connections to share.
6. `profile pull-state`/`push-state`: extend `parseProfileCommand`/`PROFILE_USAGE` in `src/profiles.ts`, tests.
7. UI indicators: `TabView.remoteHost` + `StatusPanels.tsx` + tab-strip indicator.
8. Specs: new `remote-agents.md` + amendments to agents, profiles, ssh-tab, application-config.
9. Public documentation.

Each step leaves the app working; run `./scripts/run.mjs check-diff` after each.
