# Launch PTY programs through an interactive shell, not a login shell

**Complexity: 3/10** — one table in `src/shell/startup.ts` changes which flags it emits, its two tests change with it, and the spec and documentation sentences that describe the old form are corrected. No new module, no new call site, no new configuration surface.

The previous change (`fix(pty): launch PTY programs through an interactive login shell`) moved PTY launches from `<$SHELL> -lc '<command>'` to `<$SHELL> -l -i -c '<command>'` so that zsh would read `.zshrc` and a harness installed by a version manager would be found. The interactive half of that is right and does what it claims — `.zshrc` is read. The login half is what keeps the fix from working, and it was already there before the change, which is why the change made no observable difference.

On macOS, `/etc/zprofile` (read by every **login** zsh, and `/etc/profile` likewise for bash) runs `eval $(/usr/libexec/path_helper -s)`. `path_helper` does not append to `PATH` — it **rebuilds** it, emitting the directories listed in `/etc/paths` and `/etc/paths.d/*` first and appending whatever the caller's `PATH` already held after them. Every precedence decision the user's own environment had made is inverted by that one line.

Measured on this machine, with `~/.local/bin` (where the current Claude Code installer puts `claude`) ahead of `/opt/homebrew/bin` (where an older Homebrew build of the same binary sits), which is the order the user's terminal has:

```
PATH=~/.local/bin:/usr/bin:/bin:/opt/homebrew/bin zsh -l -i -c 'command -v claude'
  → /opt/homebrew/bin/claude          # path_helper moved /opt/homebrew/bin to the front

PATH=~/.local/bin:/usr/bin:/bin:/opt/homebrew/bin zsh -i -c 'command -v claude'
  → /Users/…/.local/bin/claude        # the caller's order survives
```

So a harness tab launches a stale copy of the harness that happens to sit in a directory `path_helper` promotes, while the user's own terminal — and janissary's own process, which inherited its `PATH` from that terminal — resolves the same bare name to the current one. That is the reported symptom exactly: the launch does not "access the latest version of the claude harness".

The login shell has nothing to offer here in the first place. janissary is started from the user's terminal, so its own `PATH` is already a login shell's `PATH`, complete and in the order the user established. Re-running login initialization inside the launch cannot add a directory that is not already there; it can only reorder what is. What the launch was actually missing is the *interactive* startup file, and `-i` alone supplies that: zsh reads `.zshenv` and `.zshrc` for a non-login interactive shell, bash reads `.bashrc`.

This is also the form the remote side has used all along. `remote/entry-factory.ts` builds `ssh -t <destination> '$SHELL -ic "janus remote-serve"'` — interactive, **not** login. The previous change's own message cited that line as the precedent it was following, and then did not follow it.

## Approach

**Drop `-l`, keep `-i`.** `shellCommandArgs` returns `['-i', '-c', command]` for `bash` and `zsh`. One flag removed; nothing else about the function's shape changes.

**The unrecognized-shell branch stops being a login shell too.** It becomes `['-c', command]` rather than `['-lc', command]`. This follows from the same reasoning and is strictly safer on the axis that branch exists to protect: `-c` is the one flag every shell that can run a command string accepts, so a shell whose flag handling is unverified is now given fewer unverified flags, not more. It also means there is one rule to state — a launched command never runs through a login shell — instead of two branches that disagree about whether login initialization is wanted.

**Separate flags, not a bundled `-ic`.** Unchanged from the existing code's reasoning: `['-i', '-c', command]` stays correct for a shell that parses options one at a time.

**Nothing else moves.** The sandbox read carve-ins stay exactly as they are. `.zprofile`, `.zlogin`, `.bash_profile`, and `.profile` are no longer read by *this* launch, but they are still read by a login shell a user starts inside a workspaced tab, and removing a read-only carve-in for a startup file would only trade this bug for a quieter one. `src/pty.ts`'s call site is unchanged — it already delegates the whole argv decision to `shellCommandArgs`. The tab's own persistent shell keeps its suppressed startup files for the reason `shell.md` gives.

**No config toggle.** Same as before: `$SHELL` plus the user's rc file already decide everything a setting would restate.

## Implementation steps

1. `src/shell/startup.ts` — change `shellCommandArgs` to return `['-i', '-c', command]` for the known shells and `['-c', command]` for the rest. Replace the comment above `INTERACTIVE_COMMAND_SHELLS` and the one above the function so both describe why the launch is interactive *and not* a login shell: `path_helper` in `/etc/zprofile` rebuilds `PATH` rather than extending it, demoting the caller's own entries behind `/etc/paths.d`, and janissary's inherited `PATH` is already a login shell's.
2. `src/pty.ts` — update the JSDoc, which currently says "an interactive login shell", to say interactive shell and to name what that preserves. No code change.
3. `src/shell/pty-session.ts` — the comment on `ptyShellArgs` contrasts the tab shell with "`-lc <command>`", a form that no longer exists anywhere. Point it at `shellCommandArgs` instead.
4. `product/specs/harness.md` — rewrite the **Launch shell** subsection: interactive, not login, and why (the user's `PATH` order is preserved, so the harness the user's own terminal resolves is the one that launches). The bash/zsh-only sentence becomes a statement about which shells get `-i`, since every shell now gets `-c` alone otherwise.
5. `product/specs/shell.md` — correct the `--pty` paragraph's "login *and* interactive shell" to interactive, with the same reason.
6. `product/specs/sandbox.md` — the read-carve-in entry describes the startup files as "sourced by the login/interactive shell every workspaced command is launched through". Correct the description of the launch shell; the carve-in list itself is unchanged.
7. `documentation/user-documentation/advanced-agents/harness.md` — the sentence added by the previous change says the binary is looked up "through your own login shell, started interactively". Say it is looked up through an interactive shell that keeps your `PATH` exactly as your terminal has it, so the copy your terminal runs is the copy that launches.
8. `documentation/user-documentation/command-bar/shell.md` — same correction to the "Interactive programs are the exception" paragraph.

## Tests

- `src/shell/startup.test.ts` (updated): `shellCommandArgs` gives bash and zsh `['-i', '-c', command]`; reads the shell name out of a full path; gives `/bin/sh`, `/usr/bin/fish`, and an empty shell path `['-c', command]`; never emits `-l` for any shell; leaves the command string untouched whichever branch is taken.
- `src/pty.test.ts` (updated): a spawn with `$SHELL` set to zsh passes node-pty `['-i', '-c', 'claude']`; a spawn with `$SHELL` set to an unrecognized shell passes `['-c', 'claude']`; an explicit `shellArgs` still wins over the default.
- `src/shell/pty-session.test.ts` (extended): `ptyShellArgs` — the tab shell's suppressed-startup argv — still shares no flag with `shellCommandArgs`, so the two launch forms cannot quietly converge.

## Out of scope

- **The sandbox read carve-ins.** They are read-only and still correct for shells started inside a workspace by other means.
- **The tab's persistent shell.** Startup files stay suppressed there.
- **The remote launch line.** `ssh -t <dest> '$SHELL -ic …'` is already the form this change adopts.
- **ACP agents.** They spawn the binary directly, with no shell argv to change.
- **Making `PATH` configurable per harness.**

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: with two copies of the same harness binary on `PATH` — one in a directory `/etc/paths.d` promotes, one ahead of it in the user's own `PATH` — launch a harness tab and confirm the copy the user's terminal resolves is the one that runs.
