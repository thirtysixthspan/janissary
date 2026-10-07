# Remote shell 4 — route plugin terminals to a remote channel

**Complexity: 5/10** — a third confinement outcome in the plugin terminal host, a remote spawn path that must run under an already-known label, and a remote target preset on plugin tabs; correctness depends on the open/update ordering in `openers.ts`.

Run order: 4 of 8 in the remote shell series. Depends on plans 1 and 3. Plans 5, 7, and 8 use it.

A plugin can only start a process through `spawnTerminal`, which starts a local PTY inside the local project root (`spawnPluginTerminal`, `src/tab/plugin-terminals.ts:49`). This plan lets the host send that spawn over the opening tab's SSH channel instead, when the requested workspace is that tab's remote workspace. The plugin keeps one spawn helper, and the host decides the machine. The remote route preserves the plugin's shell, arguments, and environment overrides.

## Design decisions

- User decision: route `spawnTerminal` to the far side when its `workspace` names the opening tab's remote workspace, rather than adding a separate remote resource.
- The remote spawn frame and the channel refcount both need the tab's label. `spawnTerminal` normally runs before `openPluginTab` mints that label (`src/tab/openers.ts:96-168`), so the remote route is allowed only where the label is already known: an `openPluginTab` with a preset label (which `launchTab` always passes), or an `updatePluginTab`. A remote workspace passed from `openOrFocusTab`, which has no preset label, is refused like any other unknown workspace.
- A remote path is never written to `tab.workspaceDir`, because `openers.ts:150-157` would retain it in the local `WorkspaceManager`.
- The remote spawn frame carries optional launch settings and environment overrides. The protocol version is bumped to 28 so an older peer cannot silently ignore them.
- For zsh hooks, host-managed startup values take precedence over plugin environment values; the host restores the plugin's `ZDOTDIR` as `JANUS_USER_ZDOTDIR` for the user's startup files.
- The additions are optional, so `TAB_PLUGIN_API_VERSION` stays at 1.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Confinement rule | `terminalConfinement` in `src/tab/terminal-workspace.ts` |
| Resource window and adoption | `withResources`, `openPluginTab`, `updatePluginTab` in `src/tab/openers.ts`; `PluginTabPreset` |
| Local spawn and root check | `spawnPluginTerminal` in `src/tab/plugin-terminals.ts` |
| Remote PTY registration | `registerRemotePty` in `src/pseudoterminal-manager.ts`; `createRemotePtySession` in `src/remote/pty-session.ts` |
| Channel and workspace lookup | `RemoteManager.get`/`workspaceOf` in `src/remote/manager.ts` |
| `originTab()` | `src/plugins/line-capabilities.ts`, typed in `src/plugins/api.ts` |
| Shell spawn frame | `spawn` with `cwd`/`shell` (plan 3) |

## Proposed changes

`terminalConfinement` gains a remote outcome, which it takes when both of these hold:

- the opening tab's label (the preset label, or the tab an update targets) has a remote channel entry;
- `options.workspace.dir` equals that entry's workspace.

It stays pure and takes that remote workspace as an extra input. `withResources` reads it through a `remoteWorkspaceOf(label)` member of `OpenTarget`, which `TabManager` implements with `RemoteManager.workspaceOf`.

`openers.ts` delegates remote spawning to `src/tab/remote-plugin-terminal.ts`. On the remote route it skips the local project-root check and local `pty.spawn`, registers a remote PTY under the known label, and returns the same terminal handle shape as a local spawn. The spawn frame carries cwd, offline mode, optional zsh hook metadata, shell selection, the plugin's arguments (defaulting to an empty list), and its environment overrides.

The remote protocol decoder validates the optional launch object and string-valued environment map before accepting a spawn frame. On the far side, `RemoteProcesses.spawnPty` uses the requested shell and arguments and merges the plugin environment with the harness environment. With zsh hooks enabled, host-managed startup values override plugin values. Existing remote PTY callers that omit the fields keep their current defaults.

Adoption and recording proceed as for a local terminal, with nothing to relabel. `PluginTabPreset` gains an optional remote target (`{ address, host }`). `openPluginTab` sets `minted.remote` from it, which gives the tab the host chip data in `TabView.remote`, remote `files` (plan 2), and remote `originTab()`. For a remote tab, `originTab()` reports the remote workspace with the tab's offline mode, and its cwd is the tab's remote cwd.

Document the remote route, launch options, protocol compatibility, and remote `originTab().workspace` in the product spec and developer documentation, with a changelog entry.

## Tests

- `src/tab/terminal-workspace.test.ts`: the remote outcome requires a labelled remote entry and a matching workspace, and a non-matching remote directory is refused.
- `src/tab/remote-plugin-terminal.test.ts`: remote registration uses the label and forwards cwd, offline mode, shell, arguments, environment, and optional zsh hook metadata; invalid hook nonces are refused.
- `src/tab/opening-state.test.ts`: remote preset metadata is routed and a remote workspace without a preset label is refused; remote paths are not retained as local workspace directories.
- `src/plugins/launch-origin.test.ts`: remote `originTab()` reports the remote workspace and current cwd.
- `src/remote/protocol.test.ts`: protocol v28 spawn frames round-trip valid launch and environment fields and reject malformed launch values, non-string arguments, and invalid environment maps.
- `src/remote/pty-session.test.ts`: remote PTY sessions encode the optional launch and environment fields while preserving existing frames when they are absent.
- `src/remote/serve-processes.test.ts`: far-side PTY creation receives launch and environment values, with host-managed zsh hook variables taking precedence.

## Out of scope

Any user-facing launch, which is plan 5. Joining another tab's channel, which is plan 7. Changing remote workspace confinement, shell cwd validation, plugin resource permissions, or the local spawn path. Persisting shell arguments or environment in process state, since the running process already owns its argv and environment and no attach or replay path needs them.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. This plan has no user-visible path. Confirm that local `zsh`, `zsh --no-workspace`, and ➕ behave as before.
