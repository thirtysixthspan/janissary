# Let a tab recover when its pty-backed shell exits on its own

## Complexity

5/10. Three source modules change (`src/shell/pty-session.ts`, `src/shell/manager.ts`, `src/shell/index.ts`), each by a few lines, following a shape `src/remote/shell-session.ts` already uses. The care is in the ordering: the exit has to end the streams the command runner listens on, the runner has to notice that end, and a late exit from an old pty must not touch the replacement shell's state.

## Goal

With `interactiveShellDetection` on (the default), a local tab's shell runs in a pseudo-terminal. `ShellManager.getShell` decides a shell is alive by `stdin.writable`, but `createPtyShell` ends its `stdin` and `stdout` only inside its own `kill()`. When the shell exits by itself (`exit`, `exec`, `set -e`, `kill -9 $$`, a crash), nothing ends those streams, so:

- the running command never sees its sentinel and never completes, leaving the entry spinning and the busy dot lit;
- every later command in the tab is chained on `shellQueues` behind a promise that never resolves;
- `stdin.writable` stays true, so the dead shell is never respawned until the user runs `connection close shell`.

Separately, the pty exit hook in `spawnPtyShellFor` deletes `shellPtyIds.get(label)` unconditionally. An old pty whose exit lands after a replacement shell was spawned deletes the new shell's pty id and silently disables promotion for that tab.

After this change a shell that exits on its own ends the running command with its partial output and a `(shell exited)` note, unblocks the tab's queue, and is respawned on the tab's next command. A stale exit leaves the replacement's pty id alone.

## Approach

- `createPtyShell` returns a third member, `exited()`, that marks the shell dead exactly as `kill()` does minus `session.kill()`: `live = false`, `stdin.end()`, `stdout.end()`. It is idempotent and a no-op after `kill()`. Output arriving after the shell is no longer live is dropped, so a trailing pty chunk can never be written to an ended stream (which would raise an unhandled `'error'`).
- `ShellManager.spawnPtyShellFor` routes the transport's `onExit` to a handler assigned once `createPtyShell` has returned: it deletes `shellPtyIds` for the label only when the stored id is this shell's `ptyId`, then calls `exited()`. This is the shape `createRemoteShell` already uses (`onExit: () => { live = false; stdin.end(); stdout.end(); }`).
- `executeShellCmd` and `queryShellPwd` in `src/shell/index.ts` also listen for the stdout `'end'` event and detach every listener on completion, as the sentinel path does. `executeShellCmd` completes with the partial output followed by `(shell exited)`; `queryShellPwd` completes with an empty result, which `ShellManager.execute` already treats as "no pwd to report". Both also complete immediately when the shell is already gone at call time (`stdin` not writable, or `stdout` already ended): a command queued behind the one that saw the exit captured the same dead shell, and a stream whose `'end'` has already fired will never fire it again. This benefits piped and remote shells too, whose streams also end on exit.
- `kill()` already ends the streams, so once the runner listens for `'end'`, a shell the manager kills itself (tab close, `connection close shell`, shutdown) would now complete its running command after the fact. On tab close that completion lands after the tab's transcript file and agent state were deleted, and `run`'s trailing `entry:appended` emit would write them back for a tab that no longer exists. `ShellManager` therefore records the shells it kills in a `WeakSet` (keyed by the shell object, not the label, so it carries no stale-label hazard), and `execute` skips the command's handlers and pwd query for a retired shell while still resolving its queue slot. A killed shell's command behaves exactly as it does today; only an exit the shell made on its own completes the command.
- The comment above `spawnPtyShellFor` claims the pty manager "reaps it with the tab". `PseudoterminalManager.closeTab` skips every transport; only `ShellManager.close` kills this shell. The comment is corrected.

Rejected: re-resolving the shell inside `ShellManager.execute` after awaiting the previous command, so a queued command would run on a fresh shell. `getShell` deletes the tab's queue entry when it respawns, and doing that from inside the chained body would let a later command skip the queue and overlap the one still running. Completing the queued command with the exit note is smaller and keeps the serialization intact; the next command typed respawns the shell.

## Implementation steps

1. `src/shell/pty-session.ts`: declare `live` before `onData`, drop data once not live, add `exited()` to `PtyShell` and the returned object, share the stream-ending lines with `kill()`.
2. `src/shell/manager.ts`: wire the transport `onExit` to the guarded id delete plus `exited()`; add the retired-shell `WeakSet`, filled by `close` and `closeAll` and consulted in `execute`; correct the comment above `spawnPtyShellFor`.
3. `src/shell/index.ts`: add the exported `SHELL_EXITED_NOTE`, the gone-shell check, and the `'end'` listener to both functions.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/shell/pty-session.test.ts`: an exit the process started itself ends both streams and leaves `stdin.writable` false without calling the session's `kill`; `kill()` after `exited()` returns false; output emitted after the exit is dropped without an error.
- `src/shell/manager.test.ts`: with the pty shell fake, the transport exits mid-command, `onDone` fires with the exit note (the running entry is finalized and the busy flag cleared), and the next `run` spawns a fresh shell. A second case: the first shell's exit arriving after a replacement was spawned does not clear the replacement's pty id, so promotion still reaches it. A third: closing the tab while a command runs, then the killed shell's command completing, leaves the entry untouched and calls no `onComplete`.
- `src/shell/index.test.ts`: stdout ending mid-command completes `executeShellCmd` with the partial output and the note and detaches its listeners; a shell whose stdin is no longer writable completes at once without a write; stdout ending during `queryShellPwd` completes it with an empty result.

## Out of scope

- Folding the five label-keyed maps in `ShellManager` into one per-tab record.
- Reporting the shell's exit code or signal in the note.
- `has(label)` still reports a dead shell until the next command respawns it or the tab closes, exactly as for remote shells.

## Documentation and specification impact

`product/specs/shell.md`, "Shell lifecycle", says a shell that exits unexpectedly is replaced on the next command. It gains the missing half: the command that was running when the shell exited finishes with whatever it had printed plus `(shell exited)`, and anything queued behind it finishes the same way instead of waiting. `help.md` and `documentation/user-documentation/` are checked for any description of this and left alone if none exists.
