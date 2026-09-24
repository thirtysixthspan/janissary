# Launch PTY programs through an interactive login shell so the user's rc file sets PATH

**Complexity: 3/10** — one new function in the existing shell-flags table module, one call site in `src/pty.ts`, four entries added to the sandbox read carve-in table, and spec/doc corrections. No new architecture and no new configuration surface.

A harness tab spawns its binary with `<$SHELL> -lc '<command>'`. That is a *login* shell but not an *interactive* one, and the distinction decides which startup files are read. zsh — the default shell on macOS — reads `.zshenv`, `.zprofile`, and `.zlogin` for a login shell and reads `.zshrc` only when the shell is interactive, so a `-lc` launch never sees `.zshrc` at all. Version managers (nvm, rbenv, pyenv, mise, asdf) and most hand-rolled `PATH` edits live in exactly that file, so a `claude`, `codex`, or `opencode` the user can run by typing its name in their own terminal is not found by the harness tab, which exits immediately and closes the tab with nothing to say beyond a missing binary. The same gap applies to every other program janissary launches in a PTY — an inline `shell vim` card, a forced `shell --pty <command>`, and the local `ssh` that carries a remote session.

The fix is to run that shell interactively as well as as a login shell, which is what the remote side already does: `remote/entry-factory.ts` builds `ssh -t <destination> '$SHELL -ic "janus remote-serve"'` for precisely this reason, and `remote-server.md` records it — "a `janus` installed by a version manager such as nvm, whose PATH setup lives in the interactive startup file". The local launch has the identical problem and should get the identical treatment.

Verified on this machine: with a `.zshrc` that exports a probe variable, `zsh -l -c` does not see it and `zsh -l -i -c` does.

## Approach

**One flags table, both directions.** `src/shell/startup.ts` already owns the per-shell-flavor argv knowledge — which flags each shell actually accepts, and the rule that an unrecognized shell gets nothing rather than a flag it would exit on. The new `shellCommandArgs(shellPath, command)` goes there beside `shellStartupArgs`, so there is one place that knows what `bash` and `zsh` spell differently rather than two that can drift.

**Which shells get `-i`.** `bash` and `zsh` — the two the table already enumerates, and the two whose behavior is verified. Anything else keeps today's `['-lc', command]`, following the rule the module's existing entry states: a shell that rejects a flag exits instead of launching, and reading one startup file fewer is a much smaller problem than a tab that cannot open at all.

**Separate flags, not a bundled `-lic`.** `['-l', '-i', '-c', command]` rather than `['-lic', command]`. Both shells accept either spelling, and the separate form is the one that stays correct if the table ever grows a shell that parses flags one at a time.

**The tab's own shell is deliberately untouched.** `ShellManager` passes explicit `shellArgs` from `ptyShellArgs()` — startup files *suppressed* — because that shell's output is captured into the transcript and an rc file's banners, prompts, and traps would land in the middle of a command's output. That reasoning is unchanged and this fix stays clear of it. The default argv changed here applies only to spawns that pass no `shellArgs`: harness tabs, ssh tabs, inline terminal cards, and PTY takeovers, all of which render raw terminal bytes where a banner is just the banner the user already sees in their own terminal.

**The sandbox has to allow the read.** `HOME_READ_CARVEINS` carves in `.bash_profile` and `.bashrc` with a comment saying why — a login/interactive bash sources these and the `$HOME` content deny makes the read fail silently otherwise — but no zsh equivalent was ever added, so a workspaced harness on a zsh machine would start the interactive shell and still get none of the user's `PATH`. `.zshenv`, `.zprofile`, `.zshrc`, `.zlogin`, and `.profile` join the list on the same reasoning. They are read-only carve-ins, not write carve-outs: a sandboxed agent must not be able to edit the file the next shell it spawns will source.

**No config toggle.** The behavior has one correct answer — a launched program should find the binaries the user's shell finds — and a setting would be a second way to describe something `$SHELL` already decides. A user who wants a quiet launch shell already controls that by what they put in their rc file.

## Implementation steps

1. `src/shell/startup.ts` — widen the module comment from "suppressing startup files" to the per-shell argv table it now is, and add `shellCommandArgs(shellPath, command)`: `['-l', '-i', '-c', command]` for `bash`/`zsh`, `['-lc', command]` for anything else, with the comment saying why an interactive shell is what finds a version manager's `PATH`.
2. `src/pty.ts` — replace the inline `shellArgs ?? ['-lc', command]` default with `shellArgs ?? shellCommandArgs(shell, command)`, and update the JSDoc so it describes the interactive login default and still explains what `shellArgs` overrides it for.
3. `src/sandbox/paths.ts` — add `.zshenv`, `.zprofile`, `.zshrc`, `.zlogin`, and `.profile` to `HOME_READ_CARVEINS`, extending the existing `.bash_profile`/`.bashrc` sentence to cover zsh's split between login and interactive startup files.
4. `product/specs/harness.md` — a short **Launch shell** subsection under Command: the harness runs through the user's login shell started interactively, so `PATH` edits in `.zshrc`/`.bashrc` apply and a version-manager-installed binary is found; shells other than bash and zsh get the login-only form.
5. `product/specs/shell.md` — note under `--pty` that a PTY-launched program runs through an interactive login shell and does read the user's startup files, in contrast to the tab shell described under "Shell startup files".
6. `product/specs/sandbox.md` — correct the `<shell> -lc '<command>'` statement, and add zsh's startup files to the read carve-in list beside `.bash_profile`/`.bashrc`.
7. `documentation/user-documentation/advanced-agents/harness.md` — say that the binary is looked up through your own login shell started interactively, so a version-manager install found by typing its name in your terminal is found here too.
8. `documentation/user-documentation/command-bar/shell.md` — the "Interactive programs are the exception" paragraph says they "run through a login shell"; make it say login *and* interactive, which is what now makes "sees your startup files as usual" true for zsh's `.zshrc`.

## Tests

- `src/shell/startup.test.ts` (extended): `shellCommandArgs` gives bash and zsh `['-l', '-i', '-c', command]`; reads the shell name out of a full path; gives an unrecognized shell (`/bin/sh`, `/usr/bin/fish`) and an empty shell path the login-only `['-lc', command]`; leaves the command string untouched whichever branch is taken.
- `src/pty.test.ts` (extended): a spawn with `$SHELL` set to zsh passes node-pty the interactive login argv; a spawn with `$SHELL` set to an unrecognized shell passes `-lc`; an explicit `shellArgs` still wins over the default.
- `src/sandbox/index.test.ts` (extended): a confined workspaced spawn binds read-carve-in params for `~/.zshrc` and every other shell startup file, checked against the read-carve-in params specifically rather than the whole `-D` list.

## Out of scope

- **The tab's persistent shell.** It keeps its suppressed startup files for the reason `shell.md` already gives; nothing about capture-into-transcript changes here.
- **ACP agents** (`src/acp/index.ts`). They spawn the binary directly rather than through a shell, so there is no shell argv to change — a separate problem with a separate fix.
- **Shells beyond bash and zsh.** fish, ksh, and the rest keep the login-only form until their flag handling is verified rather than assumed.
- **Sourcing framework files an rc file pulls in from elsewhere under `$HOME`** (`.oh-my-zsh`, `.zsh/`, `.config/zsh`). The carve-ins cover the startup files themselves, matching what the bash entry already does; a sandboxed shell whose rc sources a framework tree still loses that part, and widening the read surface of `$HOME` is a sandbox decision on its own terms.
- **A configuration setting to opt out.**

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: put a `PATH` addition in `.zshrc` only, launch a harness tab, and confirm the binary on that path is found.
