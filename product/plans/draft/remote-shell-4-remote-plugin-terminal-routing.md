# Remote shell 4 — route plugin terminals to a remote channel

**Complexity: 5/10** — a third confinement outcome in the plugin terminal host, a remote spawn path that must run under an already-known label, and a remote target preset on plugin tabs; correctness depends on the open/update ordering in `openers.ts`.

Run order: 4 of 8 in the remote shell series. Depends on plans 1 and 3. Plans 5, 7, and 8 use it.

A plugin can only start a process through `spawnTerminal`, which starts a local PTY inside the local project root (`spawnPluginTerminal`, `src/tab/plugin-terminals.ts:49`). This plan lets the host send that spawn over the opening tab's SSH channel instead, when the requested workspace is that tab's remote workspace. The plugin keeps one spawn helper, and the host decides the machine.

## Design decisions

- User decision: route `spawnTerminal` to the far side when its `workspace` names the opening tab's remote workspace, rather than adding a separate remote resource.
- The remote spawn frame and the channel refcount both need the tab's label. `spawnTerminal` normally runs before `openPluginTab` mints that label (`src/tab/openers.ts:96-168`), so the remote route is allowed only where the label is already known: an `openPluginTab` with a preset label (which `launchTab` always passes), or an `updatePluginTab`. A remote workspace passed from `openOrFocusTab`, which has no preset label, is refused like any other unknown workspace.
- A remote path is never written to `tab.workspaceDir`, because `openers.ts:150-157` would retain it in the local `WorkspaceManager`.
- The additions are optional, so `TAB_PLUGIN_API_VERSION` stays at 1.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Confinement rule | `terminalConfinement` in `src/tab/terminal-workspace.ts` |
| Resource window and adoption | `withResources`, `openPluginTab`, `updatePluginTab` in `src/tab/openers.ts:56-205`; `PluginTabPreset` |
| Local spawn and root check | `spawnPluginTerminal` in `src/tab/plugin-terminals.ts` |
| Remote PTY registration | `registerRemotePty` in `src/pseudoterminal-manager.ts:106`; `createRemotePtySession` in `src/remote/pty-session.ts` |
| Channel and workspace lookup | `RemoteManager.get`/`workspaceOf` in `src/remote/manager.ts` |
| `originTab()` | `src/plugins/line-capabilities.ts:43`, typed in `src/plugins/api.ts:286` |
| Shell spawn frame | `spawn` with `cwd`/`shell` (plan 3) |

## Proposed changes

`terminalConfinement` gains a remote outcome, which it takes when both of these hold:

- the opening tab's label (the preset label, or the tab an update targets) has a remote channel entry;
- `options.workspace.dir` equals that entry's workspace.

It stays pure and takes that remote workspace as an extra input. `withResources` reads it through a new `remoteWorkspaceOf(label)` member of `OpenTarget`, which `TabManager` implements with `RemoteManager.workspaceOf`.

`openers.ts` is at about 184 code lines, so put the remote spawn in a new `src/tab/remote-plugin-terminal.ts`. On the remote route it does three things:

- it skips the local project-root check and the local `pty.spawn`;
- it calls `registerRemotePty` under the known label, sending a spawn frame with `cwd`, the workspace's `offline`, and `shell: { nonce }` when `zshHooks` is set (plan 1);
- it returns the same terminal handle shape a local spawn returns.

Adoption and recording then proceed as for a local terminal, with nothing to relabel.

`PluginTabPreset` gains an optional `remote` target (`{ address, host }`). `openPluginTab` sets `minted.remote` from it, which gives the tab the host chip data in `TabView.remote`, remote `files` (plan 2), and remote `originTab()`. For a remote tab, `originTab()` reports `workspace` as the remote workspace with the tab's offline mode, and its `cwd` is the tab's remote cwd.

Document the remote route and the remote `originTab().workspace` in `documentation/developer-documentation/tab-plugins.md`, with a changelog entry.

## Tests

- `src/tab/terminal-workspace.test.ts`: the remote outcome requires a labelled remote entry and a matching workspace, and a non-matching remote directory is refused.
- `src/tab/plugin-terminals.test.ts` and a new `remote-plugin-terminal.test.ts`: a remote route skips the root check, registers a remote PTY under the label, and sends `cwd`, `offline`, and `shell`; a remote workspace from `openOrFocusTab` is refused; `tab.workspaceDir` stays unset.
- `src/tab/opening-state.test.ts` (or `src/tab/manager.test.ts`, where plugin tab opening is exercised): a preset `remote` target sets `minted.remote`.
- `src/plugins/launch-origin.test.ts`: remote `originTab().workspace`.

## Out of scope

Any user-facing launch, which is plan 5. Joining another tab's channel, which is plan 7.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. This plan has no user-visible path. Confirm that local `zsh`, `zsh --no-workspace`, and ➕ behave as before.
