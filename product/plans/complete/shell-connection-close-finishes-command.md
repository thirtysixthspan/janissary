# Let `connection close shell` finish the command it interrupts

**Complexity: 4/10** — one class (`ShellManager` in `src/shell/manager.ts`) changes how it remembers the shells it killed, plus a spec correction and tests. No new architecture; the risk is entirely in keeping the tab-close and shutdown paths silent while the connection-close path reports.

`ShellManager.close(label)` serves `connection close shell` (`src/connection/close.ts`), and `closeTab(label)` delegates to it for the tab-close walk. Both add the killed shell to the `retired` WeakSet, and `execute` drops a retired shell's completion entirely — so `run`'s `onDone` never runs: the transcript entry stays `running`, `deleteBusy` never runs (every later command in that agent tab queues forever behind it), `promotion.finish()` never runs, and a messaged sender's `onComplete` never fires. That is right when the tab is gone, and wrong for `connection close shell`, whose tab stays open.

## Goal

A shell killed by `connection close shell` finishes its running command the same way a shell that exits on its own does — with whatever it printed followed by `(shell exited)` — so the entry stops running, the busy marker clears, the queue drains, and a waiting sender is answered. The pwd query is not written to the killed shell. Tab close and app shutdown keep dropping the completion silently.

## Approach

1. In `src/shell/manager.ts`, replace `retired = new WeakSet<ShellProcess>()` with `retired = new WeakMap<ShellProcess, 'silent' | 'report'>()`, recording how each killed shell's completion should be treated.
2. Extract the body of `close(label)` into a private `retire(label, mode)` returning whether a shell was open. `close(label)` (the `connection close shell` path) calls `retire(label, 'report')`; `closeTab(label)` calls `retire(label, 'silent')`; `closeAll` marks every shell `'silent'`.
3. In `execute`, on completion: a `'silent'` shell resolves without calling `onDone` (today's behavior); a `'report'` shell calls `handlers.onDone(result)` and then resolves without `queryShellPwd`; a live shell behaves as today.
4. Update the comments on `retired` and `close` to describe the two modes.

## Implementation steps

1. Make the `ShellManager` change above.
2. Add tests (below), run `./scripts/run.mjs check-diff`.
3. Update `product/specs/shell.md` (Shell lifecycle): a shell killed when its tab closes or at exit still abandons its command silently; a shell killed by `connection close shell` finishes its command with `(shell exited)` as a self-exit does, clearing the busy marker.

## Tests

In `src/shell/manager.test.ts`, under "a pty shell that exits":

- Existing "drops the completion of a command whose shell the manager killed" (via `closeTab`) keeps passing unchanged.
- New: a command whose shell `connection close shell` killed (`shellManager.close(label)`) finishes — `onComplete` is called with the completion's output, the entry is `running: false`, the tab is not busy, and no pwd query is written.
- New: `closeAll` still drops the completion of a running command.

In `src/connection/close.test.ts`: check the existing `shell` case still reports `Closed connection shell:<name>.` (no change expected).

## Out of scope

- Restructuring the five label-keyed maps on `ShellManager` onto the tab record.
- Any change to how the tab-close or shutdown paths treat a running command.
- `help.md` and `documentation/user-documentation/command-bar/connections.md` — neither says what happens to a running command on `connection close shell`, so neither changes.
