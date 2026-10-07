# Support file navigator operation on remote machines

**Complexity: 9/10** — a first-of-its-kind remote plugin tab: remote routing through the plugin terminal host, a remote `launchTab` path with join and adopt modes, a new plugin `reattach` hook, remote protocol fields and a version bump, session persistence and attach for a third process kind, remote `files` resolution, and client metadata on two tab kinds.

The file navigator should work from a bundled shell tab on a remote machine, the same way it already works from remote agent and harness tabs. Janissary already supports remote trees through remote agent and harness tabs, including filesystem mutations over their SSH channels. The bundled shell tab has a folder action, but a shell cannot be remote yet: `zsh … on <address>` is refused, and `zsh` typed in a remote tab is refused. The bare `files` command also treats a remote tab's cwd as a local path. This feature adds remote shell tabs, provisioned in a sandboxed remote workspace the way remote agents are, and routes both navigator entry points through the existing remote navigator path. It also absorbs the ready-backlog request to make the remote harness's ➕ action open a remote shell in the harness's workspace.

## Design decisions

Established behavior on master:

- A typed `zsh` is `zsh [name] [-w|--workspace|--no-workspace] [--offline]` and provisions a fresh sandboxed workspace clone by default, through the host-owned `launchTab` capability (`src/plugins/launch-tab.ts`, `src/plugins/shell/launch-tab.ts`). The tab opens at once in a provisioning state, and once the clone lands the feed shows `Shell "<name>" ready. (workspace: …)`. ➕ and `Cmd+T` open a sibling in the same place as the source shell, and do nothing while the source is still provisioning (`src/plugins/shell/open-tab.ts`, the `sibling` intent in `src/plugins/shell/activate.ts`).
- `zsh … on <address>` is refused with `Remote shell tabs are not supported yet.` (`REMOTE_SHELL_REFUSAL` in `src/plugins/shell/parse-argument.ts:6`). `zsh` typed in a remote tab, and a sibling from one, are refused with `A shell tab cannot be opened from a remote tab.` (`activate.ts:39`, `open-tab.ts:18`).
- `on <address>` implies a workspace for remote launches. `harness … --no-workspace on devbox` still provisions one (`src/harness/command-parse.ts:71-72`), and non-workspaced remote launches are out of scope in `product/specs/remote-server.md`. The remote applies its own sandbox policy (active on macOS, inactive elsewhere) and reports its own isolation notice. A remote agent announces `Agent "<name>" ready on <host>. (workspace: <dir>)` and reports failures as `Failed to start "<name>" on <host>: <reason>` (`src/profile/remote-agent.ts:58-65`).
- The ➕ on a remote agent or harness tab currently opens a remote agent that joins the source's channel and workspace, waiting while the source is still provisioning (`newAgentAt` in `src/profile/manager.ts:95-117`).
- `files in <label>` and the folder button on a remote agent or harness use that tab's remote workspace and existing SSH channel. Remote trees support the same filesystem operations as local trees, bounded to the provisioned remote workspace. A bare `files` command uses the issuing tab's cwd as a local path (`resolveCwd` in `src/file-navigator/open-command.ts:19-30`), and `files <path> in <remote>` opens a root outside the workspace unchecked. A metadata-row folder button opens or retargets at the remote workspace root. The shell's folder button calls the host `openFileNavigator` capability, which sends `openFileNavigatorFor`. The remote navigator opens and retargets from its owning tab without stealing focus, closes with that owner or when the channel is lost, and reports a dropped connection once. Remote file navigators are not restored.
- A remote agent's `cwdOf` tracks its remote cwd (`onPwd`, `src/shell/manager.ts`). A remote harness's cwd becomes its workspace root once ready and is not tracked after that (`src/harness/tab-spawn.ts`). While either is provisioning, its cwd is still the local launch directory and `RemoteManager.workspaceOf` is undefined.
- Nested remoting is out of scope per the remote-server spec, as are `files on <address>` without an existing remote tab and an alternative confinement mechanism where the remote has no sandbox.

User decisions:

**Scope.** Target the bundled shell tab, including the remote-shell capability it needs. This plan absorbs the ready-backlog entry “support shell tab to operate on remote machine…”, which is removed from `product/backlog/features.md` once the plan is complete.

**Standalone remote shell.** The command is `zsh [name] [-w|--workspace|--no-workspace] [--offline] on <address>`, using the existing validated address grammar and remote workspace-provisioning rules. `on` implies a workspace, so `--no-workspace on <address>` still provisions one, as `harness … on` does. `--offline` applies the remote's offline sandbox profile. The name is the tab label and the remote clone's folder, checked under the same rules as `agent <name> on <address>`. A standalone remote shell gets its own channel and workspace. Its tab opens at once in a provisioning state with SSH prompts rendered in its terminal, and zsh starts confined to the remote workspace root once it is ready. The feed shows `Shell "<name>" ready on <host>. (workspace: <dir>)`, followed by the remote's own isolation notice when it sends one. A remote whose sandbox is inactive, which is every non-macOS remote, still launches the shell and shows that notice. Failures follow the existing remote-launch failure funnel and post `Failed to start "<name>" on <host>: <reason>`, with no local fallback. A remote zsh that exits before its first prompt, for example because zsh is not installed there, posts `Failed to start "<name>" on <host>: zsh exited before its first prompt.` and its tab closes. An unknown option is refused with `Unknown option "<word>". Usage: zsh [name] [-w|--workspace|--no-workspace] [--offline] [on <address>]`. `send` and `queue` into a provisioning remote shell are accepted, and the lines drain at its first prompt, as they do for a provisioning local shell.

**Remote siblings.** Three actions open a remote sibling that joins the source tab's channel and workspace:

- a remote shell's ➕ (“New shell in this workspace”) and `Cmd+T`;
- the remote harness's repurposed ➕, retitled `New shell in this workspace` (it was `New agent in this workspace`);
- a typed `zsh` without `on` in any remote tab, whether shell, agent, or harness.

A remote agent tab's ➕ keeps opening a remote agent, and local harness and agent rows keep `launchAgentFor` unchanged.

A typed `zsh <name>` in a remote tab honors the name as the sibling's label under the usual clash checks. It ignores `-w`, `--workspace`, `--no-workspace`, and `--offline`. A sibling inherits the source's offline mode. Its zsh starts in the source tab's remote cwd when that is inside the workspace, and at the workspace root otherwise.

While the source's remote workspace is still provisioning:

- the remote harness and remote shell ➕ are dimmed with the title `Waiting for the workspace` and do nothing;
- `Cmd+T` does nothing;
- a typed `zsh` answers `The remote workspace is not ready yet.` and opens nothing.

When the source is detached, reconnecting, or its workspace is gone, the sibling request posts `The remote workspace is no longer available.` to the feed and opens nothing. `zsh … on <address>` typed in a remote tab is refused with `Cannot launch a remote shell from a remote tab.`

**File navigator.** A bare `files` from any remote tab (shell, agent, or harness) uses the tab's remote cwd while it is inside the workspace, and falls back to the workspace root when it is outside. From a remote tab whose workspace is still provisioning it answers `The remote workspace is not ready yet.` and opens nothing. `files <path>` resolves relative paths against that remote cwd, expands `~` against the remote user's home and `$root` to the remote workspace root, and refuses a result outside the provisioned workspace with `"<path>" is outside the remote workspace <workspace>.` The same check now applies to `files <path> in <remote tab>`. The folder button keeps opening or retargeting at the remote workspace root through the existing `openFileNavigator` route.

**Relaunch and profiles.** Remote shell tabs are restored after `--relaunch` and attach like remote harness tabs, reattaching the same running PTY with its last reported cwd, workspace, and offline mode. The sessions tab lists a detached remote shell as `shell`. Remote shells are not part of profile save/launch: a saved profile omits them rather than reissuing them as local shells.

Implementation decisions:

- Extend `launchTab` with a remote request rather than adding a dedicated remote-shell capability.
- Route `spawnTerminal` to the far side when its `workspace` names the opening tab's remote workspace, rather than adding a separate remote resource.
- Request zsh's status hooks through a new `zshHooks` option on `spawnTerminal`, so the host builds the startup environment on whichever machine runs zsh.
- Rebuild a reattached shell through a new optional plugin `reattach` activation handler.

Every remote spawn goes through `launchTab` or `updateTab`, where the tab's label is known before the factory runs, because the remote spawn frame and the channel refcount both need the label. Each addition to the plugin contract is optional and additive, so `TAB_PLUGIN_API_VERSION` (`src/plugins/api-capabilities.ts:6`) stays at 1, and each is recorded in the changelog of `documentation/developer-documentation/tab-plugins.md`.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Typed `zsh` parsing, launch, and sibling | `src/plugins/shell/parse-argument.ts`, `launch-tab.ts`, `open-tab.ts`, `spawn-shell.ts`, `activate.ts` |
| Host-owned plugin tab launch with preset label, clone, provisioning wiring, and ready handler | `launchCapabilities` in `src/plugins/launch-tab.ts`, `resolveLaunchLabel` in `src/plugins/launch-tab-label.ts` |
| Plugin terminal spawn, confinement, and adoption | `spawnPluginTerminal` in `src/tab/plugin-terminals.ts:49`, `terminalConfinement` in `src/tab/terminal-workspace.ts`, `withResources`/`openPluginTab`/`updatePluginTab` in `src/tab/openers.ts:56-205`, `TabManager.spawnTerminal` in `src/tab/manager.ts` |
| `originTab()` | `src/plugins/line-capabilities.ts:43`, typed in `src/plugins/api.ts:286` |
| Shell startup files and nonce-authenticated cwd hooks | `ZshStartupDirectory` in `src/plugins/shell/zsh-startup-directory.ts`; `createShellMarkerNonce`/`shellSetupScript`/`shellStartupEnvironment` in `src/plugins/shell/zsh-startup-script.ts` |
| Address parsing | `parseRemoteAddress` in `src/remote/address.ts:41` |
| Remote launch placeholder and failure flow | `startRemoteLaunch` in `src/harness/remote-launch.ts:52-104`; remote name resolution with `skip` and a `RemoteNameRetry` in `src/profile/new-agent.ts:36-56`; `failRemoteLaunch`/`reportRemoteCleanup`/`reportRemoteClone` in `src/launch-name/fail-remote.ts` |
| Joining a remote source's channel | `RemoteManager.attach`/`workspaceOf`/`readyOf`/`reconnectingOf` in `src/remote/manager.ts`, used by `newAgentAt` in `src/profile/manager.ts:95-117` |
| Remote PTY registration with a recorded id | `registerRemotePty` (and its `recordedId` adoption) in `src/pseudoterminal-manager.ts:106`; `createRemotePtySession` in `src/remote/pty-session.ts` |
| Far-side PTY spawn and sandbox | `RemoteProcesses.spawnPty` in `src/remote/serve-processes.ts:88`, `spawnPty` with `launch`/`extraEnv` in `src/pty.ts`, spawn-failure `exit` in `src/remote/serve.ts:205-210` |
| Far-side home precedent | the `home` context in `src/remote/serve-root-settle.ts:18` |
| Remote frame decoding | `decodeSpawn`/`decodeWorkspaceReady` in `src/remote/frame/decode-lifecycle.ts`, `decodeProcessState` in `src/remote/frame/decode-sessions.ts`, `spawnFrameState` in `src/remote/process-state.ts` |
| Remote session persistence and tab restoration | `RemoteSessionRecord`/`launchKind` in `src/sessions/store.ts`; `tabKind`/`processOf`/`recordOf` in `src/sessions/snapshot.ts`; `startSessionAttach` in `src/sessions/attach.ts`; `restoreSessionTabs` in `src/sessions/restore-tabs.ts`; `settleResume` in `src/remote/resume.ts`; `SessionRouter.exit` in `src/remote/channel/sessions.ts` |
| Sessions tab row kinds | `RemoteSessionKind` in `src/protocol/sessions.ts:8`; `SessionRowKind`/`KINDS` in `src/plugins/sessions/shared.ts` |
| Running a plugin command on a tab's behalf | `managers.plugins.runCommand` as used in `src/profile/view-tabs.ts:107` |
| `files` command and remote-root selection | `src/commands/files.ts`; `resolveCwd` and `openRemoteTree` in `src/file-navigator/open-command.ts`; `expandUserPath(input, { root, home })` in `src/paths.ts:14` |
| Remote filesystem port and far-side operations | `src/file-navigator/remote/port.ts` and its modules; `src/remote/filesystem/operations.ts` |
| Metadata-row ➕ wiring | `launchAgentFor` in `src/protocol/core-rpc.ts`, `src/client-params/core.ts`, `src/client-message.ts`, `src/message/handler.ts`, `src/message/tabs.ts`, `src/controller/file/navigator-adapter.ts`; `agentTabIntents` in `web/src/shared/agent-tab-intents.ts:29`; ➕ rendered in `web/src/shared/AgentTabMeta.tsx:86` via `web/src/harness/HarnessTab.tsx` |
| Remote host chip and attach/detach control | `RemoteTargetView` (including `provisioning`) and `TabView.remote` in `src/protocol/tab.ts`; `RemoteChip`, `RemoteSessionButton`, `remoteSessionControl` in `web/src/shared/`; `web/src/plugins/PluginBody.tsx` |
| Profile save skip precedent | remote navigator skip in `writePluginEntry`, `src/profile/save/entries.ts:96,130` |

## Proposed changes

**1. Host-owned zsh startup and `zshHooks`.** `src/shell/` already holds the host's pipe-mode shell, so move `ZshStartupDirectory`, `createShellMarkerNonce`, `shellSetupScript`, and `shellStartupEnvironment` into a new `src/shell/zsh-startup/` folder (`directory.ts`, `script.ts`), together with their three test files (`zsh-startup-directory.test.ts`, `zsh-startup-script.test.ts`, `zsh-startup.zsh.test.ts`).

The moved script module gets its own nonce-format check instead of importing `isShellMarkerNonce` from the plugin's `shared.ts`, which must stay import-free for the client. Publish `createShellMarkerNonce` through `src/plugins/api.ts`, next to its other host re-exports. Update the path comments in `web/src/plugins/shell/shell-prompt.ts` and `shell-command-marker.ts`.

`TabPluginTerminalOptions` gains an optional `zshHooks: { nonce }`. `spawnPluginTerminal` handles it for a local spawn by merging the host-built startup environment over the plugin's `env`. The startup directory is acquired lazily by the first such spawn and released in `TabManager.dispose`. `janus remote-serve` holds its own directory, acquired by its first shell spawn and released in `serve.ts`'s `shutdown`.

The shell plugin stops owning a directory. `spawnShell` passes `zshHooks` instead of building `ZDOTDIR`, and `activate`'s `dispose` no longer releases one. Update the `ZDOTDIR` assertions in `activate.test.ts` and `src/tab/plugin-terminals.test.ts`. Land this step first, with local shells unchanged in behavior.

**2. Remote protocol.** Make these frame changes:

- The `spawn` client frame (`src/remote/protocol-frames.ts:65-86`) gains an optional `cwd` and an optional `shell: { nonce }`.
- `workspace-ready` gains the remote user's `home`, taken from `os.homedir()` on the far side.
- `process-state` entries gain the shell fields: `shell: { nonce }`, `offline`, and the spawn `cwd`.

Then extend the code that reads and records them:

- `decodeSpawn` and `decodeWorkspaceReady` in `src/remote/frame/decode-lifecycle.ts`, `decodeProcessState` in `src/remote/frame/decode-sessions.ts`, and `spawnFrameState` in `src/remote/process-state.ts`.
- `RemoteLaunchHandlers.onReady`'s signature, and the `workspace-ready` case in `src/remote/entry-factory.ts`, which stores `home` on `RemoteEntry` (`src/remote/attach.ts`).
- `RemoteManager`, which exposes the stored value as `homeOf(label)`.

A reattach gets no `workspace-ready`, so `home` is also persisted in the session record and restored through `settleResume` (`src/remote/resume.ts`).

On the far side, `RemoteProcesses.spawnPty` treats a spawn carrying `shell` as an interactive zsh: it calls `spawnPty` with `launch = { shell: 'zsh', args: [] }`, the peer's startup environment for the nonce as `extraEnv`, and the same `{ workspaceDir, offline, tokens }` sandbox a harness PTY gets. Its cwd is the frame's `cwd` when that is inside `workspaceDir`, and `workspaceDir` otherwise.

`SessionRouter.exit` (`src/remote/channel/sessions.ts`) reports a shell process's exit to its owner as it does for a harness, so `terminateRemoteProcess` runs. Bump `REMOTE_PROTOCOL_VERSION` from 25 to 26 (`src/remote/protocol.ts:166`), with an entry in the version-history comment above it.

**3. Remote spawn routing.** `terminalConfinement` (`src/tab/terminal-workspace.ts`) gains a remote outcome. It applies when the opening tab's label (a `launchTab` preset label, or the tab an `updateTab` targets) has a remote channel entry, and `options.workspace.dir` equals that entry's workspace. The pure function takes the remote workspace as an extra input, which `withResources` reads through a new `remoteWorkspaceOf(label)` member of the `OpenTarget` it is handed. A remote workspace passed from `openOrFocusTab`, where no label exists yet, is refused like any other unknown workspace.

On the remote route, `spawnPluginTerminal` skips the local project-root check and the local `pty.spawn`. It calls `registerRemotePty` under the known label, sending a spawn frame with `cwd`, `offline`, and `shell` from `zshHooks`, and returns the same terminal handle shape. `minted.workspaceDir` is never set to a remote path (`openers.ts:150-157` would retain it in the local `WorkspaceManager`).

`openers.ts` is at about 184 code lines, so put the remote branch in a new `src/tab/remote-plugin-terminal.ts` rather than growing it. `openPluginTab` with a preset `remote` target sets `minted.remote`, which gives the tab its host chip, remote `originTab()`, and remote `files`.

For a remote tab, `originTab()` (`src/plugins/line-capabilities.ts:43`, type in `src/plugins/api.ts:286`) reports `workspace` as the remote workspace with the tab's offline mode. Its `cwd` is already the remote cwd. It gains no provisioning flag, because `join` mode rejects a provisioning origin on the host.

**4. Remote `launchTab`.** `TabPluginLaunchRequest` (`src/plugins/api-launch.ts`) gains an optional `remote` with three modes:

- `{ address: string }` starts a new channel.
- `{ join: true }` joins the origin tab's remote workspace.
- `{ adopt: … }` is used only from `reattach`; see step 7.

`TabPluginLaunchStart` gains an optional `connectPtyId`, and `TabPluginLaunchReady` an optional `host`. Put the remote branches in a new `src/plugins/launch-tab-remote.ts` and call them from `launchCapabilities`, which is at about 141 code lines.

`address` mode:

- The host validates the raw token with `parseRemoteAddress` and rejects the request with its error.
- It resolves the label as `startRemoteAgent`'s caller does (`src/profile/new-agent.ts:36-56`): `workspace: false`, a `skip` list, and a `RemoteNameRetry` whose `relaunch` re-runs this launch.
- It opens the channel with `startRemoteLaunch` under that label. Then it opens the tab with a preset label, the `remote` target, and the requested cwd, and passes the channel's SSH PTY to the factory as `connectPtyId`. If the tab fails to open, the channel is closed, as `releaseClone` does for a local clone. The tab is marked busy until ready, as `awaitClone` does.
- `ready` is wired through `wireProvisioning`. On readiness the host calls `reportRemoteCleanup`/`reportRemoteClone`, then runs the plugin's ready handler with `workspaceDir` set to the remote path, `displayDir` set to that path unshortened, the remote's notice as `sandboxNotice`, and `host`.
- Failures go through `failRemoteLaunch` with `kind: 'agent'` (for its pool-name wording) and a `show` that posts `Failed to start "<name>" on <host>: <reason>` to the notifications feed, replacing the local-only `failLaunch` (`launch-tab.ts:72`) on this path.

`join` mode:

- If the origin's remote workspace is still provisioning, the request is rejected with `The remote workspace is not ready yet.`
- If the origin is reconnecting (`RemoteManager.reconnectingOf`) or `RemoteManager.attach(label, origin)` refuses, the host posts `The remote workspace is no longer available.` to the feed and opens nothing.
- Otherwise it resolves the label (the plugin's `name` or the pool) under the same rules with `workspace: false`, attaches, opens the tab with the preset label and the origin's `remote` target, and calls the factory. A failed open releases the attachment.
- The factory gets the existing `TabPluginLaunchStart` fields with no new ones: `workspaceDir` is the origin's remote workspace, and `cwd` is the origin's remote cwd when it is inside that workspace (`isInsideRoot` in `src/plugins/files.ts:15-21` uses only `path.resolve`, so it works on remote absolute paths) and the workspace root otherwise. The plugin computes no start directory for a remote sibling.

**5. Shell plugin.** `parseShellArgument` lifts `on <address>` out of the words before lowercasing, keeping the address token's case, and returns it raw. `REMOTE_SHELL_REFUSAL` and its tests (`parse-argument.test.ts:31-39`, `activate.test.ts:195,203,221`) are replaced, and `SHELL_USAGE` gains `[on <address>]`.

`activate`'s `command` routes as follows:

- a remote origin with `on` is rejected with `Cannot launch a remote shell from a remote tab.`;
- a remote origin without `on` launches a `join` with the parsed name, ignoring workspace flags;
- a local origin with `on` launches an `address` request with the parsed name and offline mode;
- everything else is unchanged.

The `sibling` intent keeps its provisioning guard. For a remote tab it launches a `join` with no name; for a local tab it calls `openShellTab` as now, with the remote refusal deleted. The `join` factory starts zsh at `start.cwd` in `start.workspaceDir`, with the offline mode from `originTab().workspace`.

The shell payload changes in `src/plugins/shell/shared.ts`:

- The provisioning payload gains optional `connectPtyId` and `host`, and its `workspaceDir` becomes optional, since a standalone remote launch has no directory until ready.
- `hasTerminalShape` accepts `connectPtyId` only when `provisioning` is set.
- The terminal payload gains optional `host` and a `prompted` flag, set by the first `cwd` intent.

`provisioningShell` (`spawn-shell.ts:56`) takes the workspace optionally. `spawnShell` passes the remote workspace as `workspace` and `zshHooks: { nonce }`. The ready handler posts `Shell "<name>" ready on <host>. (workspace: <dir>)` when `host` is present, and keeps the local line otherwise.

On the client, `useShellTerminal` attaches a provisioning tab to `connectPtyId` with input enabled, no marker handling, no colour reporting, and no `onExit` close, so SSH's own failure text stays visible until the host closes the tab. It switches to `ptyId` when the ready payload arrives. When a remote shell's PTY exits before `prompted` is set, `useShellTabTerminal` sends a new `exited-early` intent before closing, and the plugin posts `Failed to start "<name>" on <host>: zsh exited before its first prompt.` If no browser is attached at that moment, the tab closes through `terminal-status` without the line. That is the deliberate ceiling; a host-side exit hook is the upgrade path.

`awaitsTerminal` (`src/tab/plugin-terminals.ts:28`) also treats a plugin tab whose payload is provisioning on a remote channel as awaiting a terminal, so `send` and `queue` accept it.

**6. Remote harness ➕.** Add a `launchShellFor` core RPC beside `launchAgentFor` at every site that carries it: `src/protocol/core-rpc.ts`, `src/client-params/core.ts`, the ack table in `src/client-message.ts`, the case list in `src/message/handler.ts`, the method union and dispatch in `src/message/tabs.ts`, and the controller interface and implementation in `src/controller/file/navigator-adapter.ts`. It runs `managers.plugins.runCommand('shell', 'zsh', { label, command })` with the harness as the source, as `src/profile/view-tabs.ts:107` does. The line stays out of history, and step 5's `join` routing handles the launch.

On the client:

- `agentTabIntents` (`web/src/shared/agent-tab-intents.ts`) gains `onLaunchShellHere`.
- `HarnessTab` passes it, with the title `New shell in this workspace`, when `remote` is set. While `remote.provisioning` is true it passes a disabled flag and the title `Waiting for the workspace`.
- `AgentTabMeta` gains the title and disabled props for its ➕. Every other tab keeps `onLaunchAgentHere` and its current title.

**7. Sessions, relaunch, and profiles.** Extend each piece below with `'shell'`:

- `RemoteProcessKind` and `launchKind` in `src/sessions/store.ts`, with its validator at `:100`.
- `RemoteSessionKind` in `src/protocol/sessions.ts:8`.
- `SessionRowKind` and `KINDS` in `src/plugins/sessions/shared.ts`.

`RemoteSessionRecord` gains the shell's nonce, offline mode, last reported cwd (written by `recordOf` from `tabRuntime`), and `home`. `tabKind` in `src/sessions/snapshot.ts:14-18` returns `'shell'` for a tab whose `plugin?.id` is `shell`. `recordOf` stops defaulting a plugin tab to `'harness'`. `processOf` and `src/sessions/rows.ts` list a detached shell under `shell`.

Add an optional `reattach(record, capabilities)` handler to `TabPluginActivation`. Its record carries the label, nonce, cwd, workspace, offline mode, `home`, `host`, and the recorded PTY id. The shell plugin answers it with a `launchTab` whose `remote` is `{ adopt: { ptyId } }` under the recorded label. The host then binds the PTY through `registerRemotePty`'s `recordedId` path. The far side ignores a spawn for an id it already holds, so nothing restarts.

`startSessionAttach` (`src/sessions/attach.ts:101-125`) gains a third branch for a standalone shell's channel. It opens the channel with its resume, then calls the shell plugin's `reattach`. Siblings sharing that channel are reattached from the same process-state list. `restoreSessionTabs` (`src/sessions/restore-tabs.ts:54`) stops skipping non-`pipe` processes that carry `shell`. A restored shell starts with no navigator.

Profile save skips a remote shell tab in `writePluginEntry` (`src/profile/save/entries.ts:130`), next to the remote navigator skip at `:96`.

**8. Remote metadata in the shell tab.** Publish `RemoteChip` and `RemoteSessionButton` through `web/src/plugins/api.ts`, since `ShellTabMeta` may import only `../api`. Pass `TabView.remote` and a remote-session control built with `remoteSessionControl` from both `PluginBody` callers (`PluginTabLayer.tsx:45`, `DockedPluginBody.tsx:36`). Memoize them by value, because `PluginBody` keeps its capabilities object stable on purpose. `PluginBody.tsx` is at about 165 code lines, so put the remote plumbing in a small hook beside it.

`ShellTabMeta` renders the host chip, provisioning indicator, and attach/detach control the way `HarnessTab` does, and dims ➕ while the payload is provisioning, as it already does.

**9. File navigator.** `resolveCwd` (`src/file-navigator/open-command.ts:19-30`) handles any source tab with a `remote` target, whether it is the issuing tab or one named by `in`. If `RemoteManager.workspaceOf` is undefined, it answers `The remote workspace is not ready yet.` and opens nothing. Otherwise it returns the tab's remote cwd when that is inside the workspace, and the workspace root otherwise, with `remote` set so `openRemoteTree` is used.

For `files <path>` from a remote source:

- relative paths join with `path.posix` against that cwd;
- `expandUserPath` (`src/paths.ts:14`) gets `{ root: workspace, home: RemoteManager.homeOf(label) }`;
- a result outside the workspace answers `"<path>" is outside the remote workspace <workspace>.`

`open-command.ts` is at about 164 code lines, so put the remote resolution in a new `src/file-navigator/remote-cwd.ts`. The folder button's `openRemote` route (`src/file-navigator/open.ts:52-73`) is unchanged.

**10. Documentation.** Update these files:

- `help.md`, including line 51's remote-refusal text.
- `product/specs/shell-tab.md`, `product/specs/file-navigator-tab.md`, `product/specs/sessions-tab.md`, and `product/specs/tabs.md`.
- `product/specs/remote-server.md`: its ➕ wording, the bare-`files` rule, the outside-workspace refusal, and `shell` as a remote process kind.
- `documentation/user-documentation/advanced-agents/remote-agents.md`, `documentation/user-documentation/command-bar/shell.md` (the refusal text at :131), and `documentation/user-documentation/getting-started/tabs.md` (the ➕ tooltip at :76).
- `documentation/developer-documentation/tab-plugins.md`, for `zshHooks`, the remote `launchTab` modes, `connectPtyId`/`host`, `originTab().provisioning`, `reattach`, and the published `createShellMarkerNonce`, `RemoteChip`, and `RemoteSessionButton`, with changelog entries.

Implement in the order above. Each step keeps typecheck and tests green: step 1 changes no behavior; step 2's fields are unused until step 3; steps 3 and 4 are reachable only through step 5's parser change; steps 6 to 9 build on 5; step 10 last.

## Tests

Server tests, colocated:

- `src/shell/zsh-startup/*.test.ts`: the moved tests, unchanged in substance. `src/tab/plugin-terminals.test.ts`: `zshHooks` builds the local environment; a remote route skips the root check and registers a remote PTY under the label; `awaitsTerminal` accepts a provisioning remote shell.
- `src/tab/terminal-workspace.test.ts`: the remote outcome needs a labelled remote entry and a matching workspace, and a remote workspace from `openOrFocusTab` is refused.
- `src/plugins/launch-tab.test.ts` (with a new `launch-tab-remote.test.ts`) covers:
  - `address` mode with an invalid address, name resolution and retry, `connectPtyId` reaching the factory, readiness with `host` and the notice, a failure line closing the tab, and the channel released when the tab fails to open or closes first;
  - `join` mode while the origin is provisioning, reconnecting, or gone, with a name clash, and with the origin's cwd inside and outside the workspace (the start `cwd` it hands the factory);
  - `adopt` mode binding the recorded PTY.
- `src/plugins/shell/parse-argument.test.ts`: `on <address>` anywhere, address case preserved, `--no-workspace on` still workspaced, and the extended usage line.
- `src/plugins/shell/activate.test.ts`:
  - each remote-origin routing case and the nested refusal;
  - a sibling from a remote origin launching a `join`;
  - the remote ready line;
  - `exited-early` posting the failure line only before `prompted`.
- `src/plugins/shell/shared.test.ts`: `connectPtyId` accepted only while provisioning, and an optional `workspaceDir` on a provisioning payload.
- `src/remote/serve-processes.test.ts`: a shell spawn's cwd fallback, confinement, offline mode, and environment. `src/remote/protocol.test.ts` and the frame decoder tests: the new fields and the version check. `src/remote/channel/sessions.test.ts`: a shell exit reaches its owner. `src/remote/resume.test.ts`: `home` survives a reattach.
- `src/file-navigator/open-command.test.ts` and `remote-cwd.test.ts`:
  - bare `files` from remote shell, agent, and harness tabs;
  - the provisioning refusal and the workspace-root fallback;
  - relative paths, remote `~`, and `$root`;
  - the outside-workspace refusal, including through `in`.
- `src/sessions/*.test.ts`: shell record validation and persistence, `tabKind` and the row kind `shell`, attach and `--relaunch` rebuilding the same PTY with its cwd, offline mode, and nonce and no navigator, and siblings on one channel reattached together. `src/plugins/sessions/shared.test.ts`: the `shell` kind validates. `src/profile/save/index.test.ts`: a remote shell is omitted.
- `src/message/handler.test.ts`, `src/client-params/core.test.ts`: `launchShellFor` routing and its parameter guard.

Client tests:

- `ShellTabMeta`: the chip, attach/detach control, and dimmed ➕.
- `useShellTerminal.test.ts`: attach to `connectPtyId`, then `ptyId`, with no close on the SSH PTY's exit.
- `HarnessTab.test.tsx` and `AgentTabMeta.test.tsx`: a remote harness sends `launchShellFor` with the new title and is disabled while provisioning; local tabs and remote agents keep `launchAgentFor`.
- `agent-tab-intents.test.ts`: the new handler.

## Out of scope

- Direct `files on <address>` without an existing remote tab.
- Arbitrary remote paths outside the provisioned workspace.
- Non-workspaced remote shells.
- Nested remoting: `zsh … on <address>` from a remote tab.
- An alternative confinement mechanism where the remote has no sandbox.
- Restoring remote file navigators.
- Profile save/launch of remote shells.
- A host-side early-exit hook for remote shells with no browser attached.
- Changes to ➕ on remote agent tabs, which keeps opening an agent.
- Changes to local shell launch, sibling, and file-navigator behavior.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after implementation changes. Then manually:

- Type `zsh docs on <address>` and answer any SSH prompt in the tab. Confirm the host chip, the line `Shell "docs" ready on <host>. (workspace: …)`, and that `pwd` prints the remote workspace. While it is still provisioning, run `queue docs pwd` from `janus` and confirm the line runs at the first prompt.
- In it, `cd src`. Run bare `files` and `files ~/…` inside the workspace and confirm both open remote trees at the right directory. Try a path outside the workspace and confirm `"<path>" is outside the remote workspace <workspace>.` Press the folder button and confirm it opens at the workspace root.
- Press ➕, press `Cmd+T`, and type `zsh scratch` in the remote shell. Confirm each opens a remote shell in the same workspace, starting in `src`. Type `zsh x on <address>` there and confirm the nested refusal.
- On a remote harness, confirm ➕ reads `New shell in this workspace` and opens a remote shell in its workspace. Close the harness and confirm the shell stays usable. Create and rename a file in its navigator.
- Relaunch the app. Confirm the same remote shell PTYs return with their cwd, and with their navigators closed. Detach one from the sessions tab and confirm its row reads `shell`.
- On a host without zsh, type `zsh on <host>` and confirm `Failed to start "<name>" on <host>: zsh exited before its first prompt.`
