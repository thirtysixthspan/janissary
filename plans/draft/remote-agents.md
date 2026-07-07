# Run Agents Beyond Your Laptops

## Summary

Allow Janissary to run agent tabs inside isolated sandboxes on a remote VM or cloud instance, connected over SSH. The user creates a remote profile that points at an SSH target; launching an agent against that profile starts the agent on the remote machine. The remote agent's output streams back to a local transcript tab, and the user interacts with it identically to a local agent — same commands, same scheduling, same monitoring. The compute location becomes transparent to the user, per the "identical control of local and remote resources" design principle.

## Decisions (to be confirmed with user)

1. **Transport: SSH.** Remote execution uses SSH as the transport, reusing the existing `ssh` infrastructure (`src/ssh.ts`, `specs/ssh-tab.md`). No new protocol or daemon required.
2. **Profile-based, not command-based.** A remote agent is created via a profile entry with a `remote` field pointing at an SSH host, rather than a one-off `agent --remote host` CLI flag. This makes remoting a persistent property of the agent, composable with scheduling, workspaces, and relaunch.
3. **Bind mount / agent state file.** The remote agent's state file (`.janissary/state/<name>.json`) lives on the remote machine. A `--pull-state` flag copies it back to the local machine for local-continuation workflows (or vice versa with `--push-state` to resync).
4. **Workspace handling.** If the profile specifies `--workspace`, the clone happens on the remote side into the remote `.janissary/workspace/<name>/`. No local clone unless `--local-workspace` is explicitly requested.
5. **Shared session scope.** Tabs using the same remote profile share one SSH connection (multiplexed via SSH's `ControlMaster`), reducing connection overhead.

## Verified codebase facts that shape the design

- **SSH handling already exists.** `src/ssh.ts` and `specs/ssh-tab.md` define SSH connection lifecycle, PTY management, and key forwarding. Remote agents would use the same connection manager.
- **Workspace cloning is already abstracted.** `src/workspace.ts` wraps `git clone` with configurable working directories. The existing `--workspace` flag on agent creation (`src/commands/agent.ts`) clones into `.janissary/workspace/` — remote agents clone into the remote filesystem via the same logic tunneled over SSH.
- **Profile entries already carry structured configuration.** `ProfileEntry = AgentState | ProfileHarnessEntry` (`src/types.ts`). A new `remote?: { host: string; user?: string; port?: number; identityFile?: string }` field on `AgentState` extends the profile model without a new profile type.
- **State persistence is file-based.** Agent state is a single JSON file written by `AgentManager` / `AgentState` in `.janissary/state/<name>.json`. Remote state lives in the same path on the remote machine.
- **The tab model is transport-agnostic.** `TabView` carries `bufferLines[]` — the client renders whatever the server produces, regardless of whether the log entries originated locally or remotely. The only requirement is timely streaming.
- **PTY management is per-tab.** `PseudoterminalManager` (`src/pseudoterminal-manager.ts`) manages PTY instances keyed by `ptyId`. Remote PTYs would be managed by a proxy that tunnels PTY I/O over SSH, reusing the existing `pty` RPC channel (`ptyInput`, `ptyData`, `ptyExit`).

## Proposed changes

### 1. Profile model

- Add `remote?: RemoteConfig` to `AgentState` (`src/types.ts`), where `RemoteConfig = { host: string; user?: string; port?: number; identityFile?: string }`.
- `ProfileManager.parseProfile()` parses a new `remote` key in profile files. The field is optional — absent means local execution (current behavior).
- Harden the field: validation rejects empty `host`, requires non-loopback host (enforced at profile load, not at launch, to fail early).

### 2. Remote PTY proxy

- New module `src/remote-pty.ts`:
  - `spawnRemotePty(config: RemoteConfig, cmd: string, cwd?: string): PtyLike` — returns an object matching the same `spawn()` shape as `node-pty` (`onData`, `write`, `resize`, `kill`, `onExit` with `{ exitCode, signal }`), so `PseudoterminalManager` can plug it in transparently.
  - Internally uses `child_process.spawn('ssh', [...flags, '--', cmd])` with `ControlMaster=auto` for connection sharing. Stdout/stderr are streamed back as PTY data.
  - Handles reconnection: if the SSH connection drops, the `onExit` fires with exit code 255 (SSH connection error), the tab closes, and the user can relaunch.
- `PseudoterminalManager.spawn()` gains a `remote?: RemoteConfig` parameter. When set, delegates to `spawnRemotePty` instead of `node-pty.spawn`.

### 3. Agent launch flow

- `src/commands/agent.ts` reads the profile entry. If `remote` is present:
  - Uses `PseudoterminalManager.spawn()` with the remote config and the agent's launch command (environment variables, workspace path, etc.) forwarded.
  - The agent's state file is initialized on the remote machine via `ssh <host> 'mkdir -p .janissary/state && echo ... > .janissary/state/<name>.json'`.
  - The workspace, if requested, clones on the remote side: `ssh <host> 'git clone <url> .janissary/workspace/<name>'`.
- `--pull-state` / `--push-state` CLI flags on the `agent` command: `agent --pull-state <name>` copies the remote state file locally via `scp`; `agent --push-state <name>` pushes a local state file to the remote.

### 4. Shared SSH connection manager

- New module `src/remote-manager.ts`:
  - Maintains a `Map<hostString, { connectionCount: number; masterPid?: number }>` — reference-counted shared connections.
  - On first agent launch against a host: opens a `ControlMaster` SSH connection as a background process.
  - On last agent close against a host: kills the master connection via `ssh -O exit <host>`.
  - Connection health check fires periodically (every 30s via the existing one-second `ScheduleManager` tick pattern, but at a reduced frequency) to detect dropped connections early.

### 5. UI indicators

- Web UI: remote agents show a small cloud/host indicator in the tab strip, appended to the tab label or as a tooltip. `TabView` gains a `remoteHost?: string` computed field derived from the tab's profile metadata.
- `connections` panel in `ConnectionsWindow` lists the remote host alongside the SSH connection. No new wire type needed — `ConnectionView` already carries `kind` and `name`.

### 6. Config and environment

- `specs/application-config.md`: no new config keys. Remote host identity is profile-scoped, not global.
- `specs/ssh-tab.md`: add a cross-reference that the same SSH infrastructure powers remote agents.

### 7. Specs

- New `specs/remote-agents.md`: profile-based remote execution, `--pull-state`/`--push-state` workflow, shared connection model, remote workspace semantics, PTY proxy architecture, UI indicators.
- `specs/agents.md`: one sentence in the agent creation section noting that agent profiles may include a `remote` key dispatching execution to a remote host.
- `specs/profiles.md`: extend the profile structure documentation to include `remote`.

### 8. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/remote-pty.test.ts`: spawns against a local SSH session (test against `localhost` with key auth), verifies stdout/stderr streaming, exit code propagation, resize passthrough, connection-drop handling.
- `src/remote-manager.test.ts`: connection sharing, ref-counting, idle cleanup.
- `src/commands/agent.test.ts`: remote profile dispatch path (lightweight unit tests with mocked `PseudoterminalManager`).
- Integration test in `src/profile-manager.test.ts`: parsing the new `remote` key, invalid-host rejection.

## Implementation order

1. Profile model: `RemoteConfig` type + `ProfileManager` parsing + validation, tests.
2. Remote PTY proxy: `src/remote-pty.ts` + integration into `PseudoterminalManager`, tests.
3. Shared connection manager: `src/remote-manager.ts`, tests.
4. Agent launch flow: `src/commands/agent.ts` remote dispatch + `--pull-state`/`--push-state`, tests.
5. UI indicators: `TabView.remoteHost` + web UI strip indicator.
6. Specs: new `remote-agents.md` + amendments to agents, profiles, ssh-tab.
7. Public documentation.

Each step leaves the app working; run `./scripts/run.mjs check-diff` after each.
