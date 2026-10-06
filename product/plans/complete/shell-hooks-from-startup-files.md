# Shell hooks from startup files

**Complexity: 7/10** — the hooks move from a line the browser types into zsh to startup files the server hands zsh when it spawns it. That touches the plugin terminal contract (an additive `env` option), the shell plugin's server activation and payload, and the client's install path, which is deleted outright. The user asked for the full fix after the narrower ones were ruled out.

The backlog asks: "in a shell tab, the shell's own command history should not include shell setup commands", quoting the hook setup line the tab types into every new shell.

## Why the setup line cannot simply be filtered

zsh decides whether a line enters history in `hend()`, after the line is parsed and before it runs. Nothing inside the setup line can therefore keep that same line out: `setopt histignorespace`, a `zshaddhistory` hook, or `histnostore` all take effect too late. Measured against `/bin/zsh` in a pseudo-terminal:

- A line that sets `histignorespace` for itself is saved to the history list and to `$HISTFILE`.
- With `histignorespace` already on and a leading space, or a `zshaddhistory` hook already defined, the line stays out of `$HISTFILE` and `fc -l`, but the first `Up` at the next prompt still recalls it. zsh documents this as the line "lingering" until the next command, and pressing `Up` first thing in a new shell is exactly when a user meets it.
- With `INC_APPEND_HISTORY` or `SHARE_HISTORY`, an ordinary setup line is written to `$HISTFILE` the moment it is entered.

So the line has to stop being typed at all.

## Goal

A shell tab's zsh never has a setup command in its history: not in `fc -l`/`history`, not under `Up`, and not in `$HISTFILE`. The status hooks, the bold `> ` prompt, the nonce-signed markers and the directory reports work exactly as before.

## Approach

**zsh installs the hooks from its own startup, through a `ZDOTDIR` the server provides.** zsh reads `$ZDOTDIR/.zshenv` and `$ZDOTDIR/.zshrc` for an interactive shell. The server spawns the tab's zsh with `ZDOTDIR` pointing at a Janissary directory holding two small files:

- `.zshenv` defines the hooks from the setup the server passed in, restores the user's own `ZDOTDIR` (or unsets it), and sources the user's `.zshenv`. It then points `ZDOTDIR` back at the Janissary directory so zsh reads its `.zshrc` next. If the user's `.zshenv` turned `RCS` off, no further startup file will run, so it installs the hooks there and then.
- `.zshrc` restores the user's `ZDOTDIR` once more, sources the user's `.zshrc`, and installs the hooks after it. The prompt is still set last, so the user's prompt configuration doesn't change the tab's terminal.

Nothing is typed into the terminal, so no line ever passes through zsh's line editor or its history. Children of the shell see the user's own `ZDOTDIR`, never Janissary's.

**The files are static; the nonce reaches zsh through the environment and leaves it at once.** The server mints the nonce (16 random bytes, hex) when it spawns the shell and passes the hook definitions as `JANUS_SHELL_SETUP`, a script that defines one `_janus_install` function with the nonce written literally into the hook functions it creates. `.zshenv` evaluates it and unsets the variable before any of the user's code runs. No child process can inherit it, which keeps the promise the hooks already make: the nonce lives in the hook functions, never in a variable a child can read. No file on disk ever holds the nonce.

**The directory is the plugin's resource, acquired and released together.** The shell activation owns one startup directory: created with `mkdtemp` under the server's temp directory (private to the user, outside `$HOME`, so a workspace's Seatbelt profile, which allows reads everywhere outside `$HOME`, can read it), recreated if something deleted it, and removed by the activation's `dispose`. A predictable shared path is deliberately avoided: anyone able to plant files there could run code in the user's shell.

**The plugin terminal contract gains an optional `env`.** `TabPluginTerminalOptions.env` adds variables over the environment the host already gives the terminal, sandbox included. It's additive, so the API integer doesn't move. It grants nothing a plugin couldn't already reach through `shell` and `args`.

**The nonce is in the payload from the first moment, so the client's install path goes away.** `hookNonce` becomes a required payload field set at spawn. Every mount reads it and only attaches. The `install-hooks` intent, the client-side nonce minting, the typed setup line, the hidden-until-installed terminal and the filter that kept the setup line out of the bar's history are all removed: nothing takes those paths any more. The payload schema version moves to 3 because `hookNonce` is now required.

**The startup screen is still cleared, now at the first prompt.** The spec promises a clean screen before the first prompt, and the setup-complete `E` marker is what clears it. It moves from the end of the typed line to a one-shot step in the hooks' first `precmd`. Emitting it at the end of `.zshrc` turned out to be too early when checked in the running app: zsh reads its history file after every startup file has run, and inside a workspace sandbox that read prints `zsh: locking failed for ~/.zsh_history`, which would then stay on screen.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Hook definitions and prompt setup to move server-side | `web/src/plugins/shell/shell-status-hooks.ts`, `web/src/plugins/shell/shell-prompt.ts` |
| Terminal spawn for plugin tabs (`extraEnv` already supported by `pty.spawn`) | `src/tab/plugin-terminals.ts`, `src/pty.ts` |
| Plugin terminal options contract | `src/plugins/api.ts` |
| Shell tab open sequence and activation | `src/plugins/shell/open-tab.ts`, `src/plugins/shell/activate.ts` |
| Marker parsing and handlers | `web/src/plugins/shell/shell-command-marker.ts`, `web/src/plugins/shell/shell-marker-handlers.ts` |
| Temp directory lifecycle pattern | `src/remote/serve-detach.ts` |

## Implementation steps

1. **Add `env` to `TabPluginTerminalOptions`** and forward it as the spawn's extra environment in `spawnPluginTerminal`.
2. **Add the zsh startup modules** in `src/plugins/shell/`: `zsh-startup-script.ts` (nonce minting, the `_janus_install` setup script, the prompt setup, the two startup file texts, and the spawn environment) and `zsh-startup-directory.ts` (the `mkdtemp` directory: lazy creation, recreation when missing, disposal).
3. **Wire the shell plugin**: `openShellTab` mints the nonce, spawns with the startup environment, and records `hookNonce` in the payload; `activate` owns the startup directory, disposes it, and drops the `install-hooks` intent. In `shared.ts`, make `hookNonce` required, remove `ShellHookClaim`, and bump the schema version to 3.
4. **Remove the client install path**: delete `claim-shell-hooks.ts` and `shell-status-hooks.ts`; drop the claim, the typed line, `SHELL_INITIALIZING` and the setup-line filter from `shell-marker-handlers.ts`, `useShellTerminal.ts` and `useShellTabTerminal.ts`, keeping the clear on a signed `E`; remove `.shell-initializing` from `shell.css` and `ZSH_PROMPT_SETUP` from `shell-prompt.ts`; move the client registry's shell schema literal to 3.
5. **Update the spec** (`product/specs/shell-tab.md`), the plugin developer reference (`documentation/developer-documentation/tab-plugins.md`, the `spawnTerminal` note) for `env`, and the user page that said the setup command was kept out of the tab's history (`documentation/user-documentation/command-bar/shell.md`).

## Tests

- `src/plugins/shell/zsh-startup-script.test.ts`: the nonce is 32 hex characters and differs per call; the setup script signs every marker with the nonce, writes it nowhere else, and defines `_janus_install`; setup completes once, at the first prompt; the environment names the startup directory, carries the setup, and passes the user's `ZDOTDIR` only when one is set.
- `src/plugins/shell/zsh-startup-directory.test.ts`: the directory holds `.zshenv` and `.zshrc`, is created once, is recreated after being deleted, and is removed by `dispose`.
- `src/plugins/shell/zsh-startup.zsh.test.ts`, run against the real `/bin/zsh` in a pseudo-terminal (skipped where it is absent), with a scratch `HOME` whose `.zshrc` sets `HISTFILE` and `INC_APPEND_HISTORY`: the user's `.zshrc` ran; the prompt marker and directory report arrive signed with the nonce; `fc -l` lists no `_janus` line; `Up` at the first prompt recalls nothing from the setup; `$HISTFILE` holds no `_janus` line; `JANUS_SHELL_SETUP` and `ZDOTDIR` are absent from the shell's environment afterwards; and a user `ZDOTDIR` is restored and its `.zshrc` loaded.
- `src/plugins/shell/activate.test.ts`: opening a shell spawns zsh with the startup environment and a payload whose `hookNonce` matches the nonce in it; `install-hooks` is no longer an intent; `dispose` removes the startup directory.
- `src/tab/plugin-terminals.test.ts` (or the existing spawn test): `env` reaches the spawn.
- `web/src/plugins/shell/useShellTerminal.test.ts` and `ShellTab.test.tsx`: a mount never writes to the terminal and never asks for `install-hooks`; markers signed with the payload's nonce drive the running state, history and directory; the terminal is never hidden; startup output is cleared only on a signed `E`.

The behaviour end to end is verified in the running app through the end-to-end browser: a new shell tab opens on a clean screen with the bold prompt, tracks a `cd`, pressing `Up` in its terminal before running anything recalls no setup line, and `fc -l` lists only the command the user ran.

## Out of scope

- **Harness and other terminals**, which have no hooks.
- **Shells started inside the tab** (`zsh`, `bash`, `ssh`), which see the user's own environment and are not hooked, as before.
- **Login-shell startup files** (`.zprofile`, `.zlogin`): the tab's zsh is not a login shell, as before.
