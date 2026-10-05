# Queue a shell line submitted before zsh reports the previous one as running

**Complexity: 3/10** — the change is confined to the shell plugin's framework-free command queue and the hook that owns it; no wire, server, or contract change.

## Goal

A line submitted from a shell tab's command bar while an earlier bar line is still on its way to zsh joins the tab's command queue instead of being written straight into the PTY. Typing `ssh host` and then `ls` quickly must queue `ls` behind `ssh host`, as the spec's "a line submitted while zsh is running is queued" already promises.

## Context

`ShellCommandQueue` only marks itself busy in two ways: zsh's `133;C` marker through `setBusy(true)`, and its own `drain()` after a drained line reports that it reached zsh. A line submitted while the queue is idle is handed back to the hook, which runs it outside the queue (`void runReference.current(line)`). Nothing marks the queue busy while that run is in flight (the `dispatch` intent round-trip for a line the application may claim) or between the PTY write and zsh's `C` marker arriving over the socket. A second submit in that window sees an idle queue and runs immediately.

## Approach

Let the queue own a directly submitted line's run, the same way it owns a drained line's run.

- `submit(line)` still queues and answers `true` while zsh is busy or the queue is draining. When idle, it starts a drain seeded with that line and answers `false`. The drain flag is set synchronously, so any submit that follows before the run settles is queued behind it.
- The seeded line runs first. If it reached zsh, the queue is busy until zsh's next prompt (`setBusy(false)`), exactly as for a drained line. If the application handled it, the drain carries on to the queue, which runs anything submitted during the round-trip in order.
- The runner learns whether a line came from the queue, because a drained line was recorded in the bar's history when it was queued and a direct line is recorded when it runs. `ShellLineRunner` becomes `(line, queued) => Promise<boolean>`, and the hook maps `queued` to `useShellSubmit`'s `record` flag.

Rejected alternative: a separate `markBusy()` called by the hook once the run resolves. It closes the PTY-to-marker window but leaves the `dispatch` round-trip open, so a quick second line could still overtake a first line the application turned down and sent to zsh.

Residual risk: a line written to zsh for which zsh never emits a prompt marker holds the queue busy. That is already true for drained lines.

## Implementation steps

1. In `web/src/plugins/shell/shell-command-queue.ts`, change `ShellLineRunner` to take a `queued` flag, make `submit` start a drain seeded with the line when idle, and have `drain` run the seeded line (with `queued: false`) before dequeuing.
2. In `web/src/plugins/shell/useShellCommandQueue.ts`, pass a runner that maps `queued` to `record`, and have `submit` only record queued lines, no longer running direct lines itself.

## Tests

- `web/src/plugins/shell/shell-command-queue.test.ts`: two submits before any `C` marker. The first runs, the second is enqueued, and the second runs after `D`.
- Same file: a line submitted while an idle-submitted line the application handles is still in flight is queued and runs as soon as that line settles, without waiting for a prompt.
- Same file: the existing "leaves a line to the caller while zsh is idle" case changes to assert the queue runs the line itself with `queued: false` and enqueues nothing.
- `web/src/plugins/shell/ShellTab.test.tsx`: `!ssh host` then `!ls` submitted back to back writes only `ssh host`, queues `!ls`, and writes `ls` after zsh's `C` and `D` markers.
- The two `ShellTab.test.tsx` cases that submitted a second line without zsh ever reporting the first (Up-arrow recall, `hist` history) now emit zsh's `C` and `D` markers between lines, as a real shell does.
- Existing queue and `ShellTab.test.tsx` cases keep passing.

## Spec

`product/specs/shell-tab.md`: in the command-queue paragraph, state that a line submitted after an earlier bar line has been sent but before zsh reports it running is queued as well.

## Out of scope

- The `queue >` prompt label, which still follows zsh's markers.
- Waking idle shells for lines queued by other tabs, and scoping queue popup state per shell tab (separate backlog entries).
