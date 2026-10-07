# Remote shell 1 — host-owned zsh startup hooks

**Complexity: 3/10** — a module move plus one optional plugin-contract option, with no behavior change; the risk is in catching every importer, mock, and assertion of the old paths.

Run order: 1 of 8 in the remote shell series (`remote-shell-1` … `remote-shell-8`). Depends on nothing. Plans 3 and 4 build on it.

The shell plugin builds zsh's startup environment itself: a `ZDOTDIR` pointing at its own `ZshStartupDirectory`, plus the per-shell hook nonce. A remote shell will need the same hooks installed by the far side's own startup files, which the plugin cannot reach. This plan moves the startup files to the host and lets a plugin ask for the hooks with an option on `spawnTerminal`. The host then builds the environment on whichever machine runs zsh. Local shells behave exactly as before.

## Design decisions

- User decision: request zsh's status hooks through a new optional `zshHooks: { nonce }` option on `spawnTerminal`, so the host builds the startup environment. The shell plugin stops owning a startup directory.
- The addition is optional and additive, so `TAB_PLUGIN_API_VERSION` (`src/plugins/api-capabilities.ts:6`) stays at 1, and it is recorded in the changelog of `documentation/developer-documentation/tab-plugins.md`.
- `src/shell/` already holds the host's pipe-mode shell (`spawnShell`, `ShellManager`), so the moved files go in a new `src/shell/zsh-startup/` folder rather than beside it.
- The plugin's `src/plugins/shell/shared.ts` must stay import-free because the client imports it, so the moved script module gets its own nonce-format check instead of importing `isShellMarkerNonce` from it.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Startup directory lifecycle | `ZshStartupDirectory` in `src/plugins/shell/zsh-startup-directory.ts` |
| Startup script, nonce, and environment | `createShellMarkerNonce`, `shellSetupScript`, `shellStartupEnvironment` in `src/plugins/shell/zsh-startup-script.ts` |
| Plugin terminal spawn | `spawnPluginTerminal` in `src/tab/plugin-terminals.ts`, called from `TabManager.spawnTerminal` in `src/tab/manager.ts` |
| Host teardown | `TabManager.dispose` in `src/tab/manager.ts:34` |
| Host utilities re-exported to plugins | `src/plugins/api.ts` (e.g. `READ_QUERY`, `isRecord`) |
| Shell spawn and teardown in the plugin | `spawnShell` in `src/plugins/shell/spawn-shell.ts`; `activate`'s `startup` and `dispose` in `src/plugins/shell/activate.ts` |

## Proposed changes

Move `zsh-startup-directory.ts` and `zsh-startup-script.ts` to `src/shell/zsh-startup/directory.ts` and `script.ts`. Move their three test files with them: `zsh-startup-directory.test.ts`, `zsh-startup-script.test.ts`, and `zsh-startup.zsh.test.ts`. Imports use `.js` extensions. Publish `createShellMarkerNonce` through `src/plugins/api.ts`, so the plugin can still mint a nonce without crossing the plugin import boundary (`eslint.plugin-boundaries.mjs`). Update the path comments in `web/src/plugins/shell/shell-prompt.ts:3` and `web/src/plugins/shell/shell-command-marker.ts:7`.

`TabPluginTerminalOptions` (`src/plugins/api.ts`) gains an optional `zshHooks: { nonce: string }`. When it is present, `spawnPluginTerminal` merges `shellStartupEnvironment(directory, nonce, process.env.ZDOTDIR)` over the plugin's `env`. The host acquires one `ZshStartupDirectory` lazily on the first such spawn and releases it in `TabManager.dispose`. An invalid nonce is refused like any other invalid terminal option.

In the shell plugin, `spawnShell` passes `zshHooks: { nonce: hookNonce }` and no longer builds `ZDOTDIR`. `activate` drops its `ZshStartupDirectory`, and `dispose` no longer releases one. `launchShellTab` and `openShellTab` stop taking a `startup` argument.

Document `zshHooks` and the published `createShellMarkerNonce` in `documentation/developer-documentation/tab-plugins.md`, with a changelog entry.

## Tests

- The moved tests under `src/shell/zsh-startup/`, unchanged in substance.
- `src/tab/plugin-terminals.test.ts`: `zshHooks` produces the startup `ZDOTDIR` and nonce variables, a spawn without it gets none, the directory is created once across spawns and removed on dispose, and an invalid nonce is refused.
- `src/plugins/shell/activate.test.ts`: drop the startup-directory module mock (`:12-19`) and assert that the spawn options carry `zshHooks` instead of `ZDOTDIR`.

## Out of scope

Any remote behavior. Plan 3 adds the far side's startup directory, and plan 4 the remote route. No other plugin spawns a terminal, so no other plugin changes.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Manually open `zsh` and `zsh --no-workspace`, run `cd src` and a long command, and confirm the cwd chip follows and the busy dot toggles, as before. Quit the app and confirm the startup directory is removed.
