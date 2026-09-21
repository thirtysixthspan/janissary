# Stray far-side output must not kill a remote session

Issue: closing a harness tab still generates `Unhandled pty write error [Error: EIO: i/o error,
write] { errno: -5, code: 'EIO', syscall: 'write' }` and fails to stop the remote harness or clear
the workspace.

Complexity: 4/10

## Goal

Closing a remote harness tab has to deliver the frames that end the session — the `kill`s and the
`shutdown` — even when the far side has printed something of its own onto the connection. Today one
stray line kills the ssh PTY outright, which both discards the shutdown sequence already queued
behind it and produces the EIO the report quotes.

## The failure

`ssh -t` folds the remote's stderr into the same tty that carries the frame stream, so anything
`janus remote-serve` writes outside the protocol arrives as a line on that stream. node-pty's own
`console.error('Unhandled pty write error', err)` is exactly such a line: node-pty 1.1 writes
asynchronously through a queue and reports a failed `fs.write` from its callback, so a write to a
harness PTY that has just exited is logged rather than thrown — which is also why the synchronous
guard `product/plans/complete/guard-closed-pty-writes.md` added in `src/pty.ts` never sees it.

`RemoteChannel.dispatch` hands every post-handshake line to `decodeFrame` and calls `fail` on any
error, and `fail` kills the transport. So the sequence is:

1. Closing the tab sends `kill` for the harness process, and the tab-close walk's `RemoteManager`
   release writes the rest of the sequence — the remaining `kill`s, `acp-close`, `filesystem-close`,
   `shutdown` — and schedules the PTY's death 250ms later so those bytes can drain.
2. The far side kills that harness PTY. A write already queued against it fails, and its node-pty
   logs the EIO to stderr, which arrives on the frame stream.
3. The line does not decode, so `fail` kills the ssh PTY immediately — 250ms early.
4. The local node-pty's queue still holds the shutdown sequence. Killing the PTY fails those writes
   with EIO, which the local node-pty logs as the same message, and drops the rest of the queue.
5. The peer never receives `shutdown`, so the remote harness keeps running and its workspace clone is
   never removed.

A line that is not a frame is the far side's terminal output. It is not evidence that the two ends
disagree about the contract, and it is the only thing in this chain that is safe to ignore.

## Approach

- `src/remote/protocol.ts`: `decodeFrame` distinguishes the two kinds of rejection it already makes.
  A line that does not parse as JSON, or parses as something other than an object, is marked
  `stray: true`. A JSON object whose `type` is outside the union, or whose fields are malformed,
  keeps the plain error it has now — that genuinely is the two ends disagreeing, and
  `frame-decode.ts`'s per-frame `malformed` results are untouched.
- `src/remote/channel.ts`: `dispatch` passes a stray line to `onTerminalData` and returns. It is
  terminal output from the far side, which is where pre-handshake bytes already go, so it is neither
  invented nor swallowed. The channel stays attached and the frames after it are handled.
- `src/pseudoterminal-manager.ts`: `closeTab` leaves every record marked `transport: true` to
  `RemoteManager`, rather than only those whose channel is still in the manager's table. Every path
  that ends a session — `RemoteManager.close`, `remoteChannelClosed` — drops the channel from that
  table *before* running the `onClosed` sweep that closes its tabs, so the lookup fails exactly when
  the shutdown drain is in flight and the first tab closed in the sweep kills the PTY out from under
  it. `closeAll` keeps the lookup: reaping a transport whose channel is gone is right at shutdown,
  and it is the only place left that could leak one.

## Tests

- `src/remote/channel.test.ts`: a stray line on an attached channel reaches the terminal handler,
  raises no error, does not kill the transport, and leaves the next valid frame handled normally;
  node-pty's actual EIO log is the fixture. A JSON object outside the union still fails the channel.
- `src/remote/protocol.test.ts`: `decodeFrame` marks a non-JSON line and a JSON non-object as stray,
  and does not mark an unknown frame type or a malformed known frame.
- `src/pseudoterminal-manager.test.ts`: `closeTab` leaves a transport alive even when its channel has
  already left `RemoteManager`'s table, while still killing the tab's ordinary PTYs; `closeAll` still
  reaps an orphaned transport. The existing parameterised test splits along that line.

## Out of scope

- node-pty's own logging. The write failure is reported from an `fs.write` callback inside the
  library with no hook to intercept, so the only thing in reach is not provoking it.
- The remote side's own late writes to a PTY that has exited. `src/pty.ts` already stops writing
  once a PTY reports its exit; the remaining window is the asynchronous one above, and narrowing it
  further is a separate change from surviving it.
- The shutdown drain's duration, and what happens to a session whose `shutdown` genuinely cannot be
  delivered.

## Specs / docs

`product/specs/remote-server.md`: output the far side prints outside the protocol does not end the
session, and closing a remote tab still stops its remote work when that happens. No `help.md` or
user-documentation page describes the frame stream.
