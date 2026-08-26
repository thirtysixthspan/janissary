# Run remote-serve Through an Interactive Shell

**Complexity: 2/10** — a one-line change to the ssh command string, one new test file, one spec paragraph.

## Summary

`on <address>` launches the far side with `ssh -t <destination> janus remote-serve [<path>]`. ssh runs that command through a **non-interactive** shell, which reads neither `~/.bashrc` (bash skips it when not interactive) nor the version-manager setup it contains. A `janus` installed under nvm therefore is not on the PATH and the launch fails with `janus: command not found`, even though the same command works when the user ssh's in and types it.

Wrap the remote command in an interactive shell so the remote's own shell initialization runs first:

```
ssh -t <destination> '$SHELL -ic "janus remote-serve [<path>]"'
```

`$SHELL` is expanded on the remote by ssh's login shell (sshd sets it from the user's passwd entry), so the wrapper follows whatever shell the remote user actually configured rather than hard-coding bash.

## Decisions

1. **`-ic`, not `-lc`.** nvm, version managers, and PATH edits are conventionally appended to `~/.bashrc` / `~/.zshrc`, which only an *interactive* shell reads. A login shell reads `~/.bash_profile` and would miss exactly the case this issue reports.
2. **`$SHELL`, not a hard-coded shell name.** Plain `$SHELL` — not `${SHELL:-bash}` — because the outer expansion is performed by the remote user's login shell, which may be csh, where the `:-` form is a syntax error. sshd always sets `SHELL`.
3. **Single quotes locally, double quotes remotely.** The whole wrapper is written into the string `spawnPty` hands to the local `$SHELL -lc`, so it must survive one local parse: single quotes keep `$SHELL` from expanding on the local machine and keep the wrapper one ssh argument. The inner double quotes are consumed by the remote login shell, leaving `janus remote-serve <path>` as the interactive shell's `-c` string — so a `~/...` path still tilde-expands exactly as it does today.
4. **No new escaping.** `parseRemoteAddress` already rejects `"`, `'`, `` ` ``, `$`, and every other shell metacharacter in both halves of the address, so nesting the address one quoting level deeper introduces no injection surface.
5. **Pre-handshake output is already handled.** Anything the remote's `.bashrc`, motd, or interactive prompt writes arrives before the handshake sentinel, and `RemoteChannel` passes exactly that phase through to the tab's terminal untouched. No channel change is needed.

## Proposed changes

### 1. `src/remote/manager.ts`
- `remoteServeCommand` builds `ssh -t <destination> '$SHELL -ic "janus remote-serve[ <path>]"'`.
- Update the comment above it to say why the interactive wrapper is there (version-manager PATH setup lives in the interactive rc file).

### 2. `src/remote/manager.test.ts` (new)
- Unit tests for `remoteServeCommand`, which has no test file today.

### 3. `product/specs/remote-server.md`
- Extend the "Bootstrap requirement" section: the remote command runs through the remote user's own interactive shell, so a `janus` put on the PATH by a version manager or an rc-file edit is found.

## Tests

New `src/remote/manager.test.ts`:

1. Wraps a path-less address in `$SHELL -ic` — `ssh -t devbox '$SHELL -ic "janus remote-serve"'`.
2. Includes the remote path inside the interactive shell's quoted command when the address carries one.
3. Keeps the `user@host` destination outside the quoted command, as ssh's own argument.
4. Leaves `$SHELL` single-quoted so the local shell cannot expand it before ssh sees it.
5. Passes a `~`-relative path through unquoted inside the inner command so the remote still expands it.

## Out of scope

- The `ssh` tab type (`src/ssh.ts`), which passes its arguments to ssh verbatim by design.
- Shipping or installing `janus` on the remote — the remote stays a peer installation, not a payload.
- Any change to `parseRemoteAddress`'s character set, the handshake, or the frame protocol.
- Public documentation: `help.md` and `documentation/user-documentation/` do not describe the `on <address>` clause, so there is nothing there to correct.
