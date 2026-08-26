# Spawn tab shells with startup flags the shell actually accepts

**Complexity: 2/10** — one hard-coded argument array becomes a per-shell lookup; no new architecture, and no change to how shells are driven once they are running.

## Goal

Let a tab's persistent shell start under zsh as well as bash. `spawnShell` currently passes `--norc --noprofile` to whatever `$SHELL` names. Those are bash spellings: zsh rejects the first one outright (`zsh: no such option: norc`) and exits 1, so a user whose login shell is zsh gets a shell process that dies immediately instead of a working tab shell.

## Approach

- Add a small pure module that maps a shell path to the startup-file flags that shell accepts: `--norc --noprofile` for bash, `--no-rcs` for zsh (zsh's own spelling of "read no startup files"), and no flags at all for any shell that is neither.
- Falling back to no flags rather than to bash's spelling is deliberate: an unrecognized shell that reads its startup files still launches and still runs commands, whereas one handed an unknown flag never starts.
- Have `spawnShell` derive its arguments through that module instead of hard-coding them, leaving the sandbox wrapping, environment merge, and stream handling untouched.
- Point the unsandboxed persistent-shell test at the same helper so it exercises the user's real login shell rather than bash's flags.

## Implementation steps

1. Add `src/shell-startup.ts` exporting `shellStartupArgs(shellPath)`, returning the flag list for the shell's base name.
2. Use it in `src/shell.ts` for the arguments handed to `sandboxSpawn`, and in `src/shell.unsandboxed.test.ts` for the real shell it spawns.
3. Add unit tests for the helper and update the `spawnShell` test so it asserts the flags belong to the shell being launched.
4. Update the shell functional spec with the startup-file behavior.
5. Promote this plan to complete and remove only the fixed backlog line.

## Tests

- `src/shell-startup.test.ts`: bash paths get `--norc --noprofile`; zsh paths get `--no-rcs`; the base name is read out of a full path; an unrecognized shell (`/bin/sh`, `/usr/bin/fish`) gets no flags; an empty shell string gets no flags.
- `src/shell.test.ts`: `spawnShell` passes the flags `shellStartupArgs` returns for the current `$SHELL`, and passes zsh's flags when `$SHELL` points at zsh.

## Out of scope

- `spawnPty` and the `--pty` login shell, which already use `-lc` — accepted by bash and zsh alike.
- The remote shell session, which asks the remote host to launch its own shell.
- Sandbox read permissions for startup files in `product/specs/sandbox.md`.
- Supporting shells beyond bash and zsh with tailored flags.
