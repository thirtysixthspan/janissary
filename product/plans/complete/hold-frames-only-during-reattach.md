# Hold replayed frames only for the reattach that needs them

Complexity: 4/10

## Goal

`SessionRouter.output` and `.exit` (`src/remote/channel-sessions.ts`) hold any frame whose id has no
listener into `PendingFrames`, unconditionally and for the whole life of the channel, so an ordinary
live channel accumulates up to the 1 MB budget of output for ids nobody will claim (a closed tab
whose far side is still writing before its `kill` lands), re-encodes every held frame on each
`claim`, and can set the `dropped` flag that makes a later unrelated `attach` report the
truncated-replay line. Hold only while a reattach is settling, bound the window at both ends, keep a
running byte total instead of re-encoding the buffer in `claim`, and report truncation only for the
attach that actually lost frames.

## Approach

The channel already knows it is reattaching (`state === 'reattaching'`), and the window the hold
exists for brackets the whole reattach — from the handshake that will send `reattach` to the moment
the tabs are built (or the reattach settles another way) — so the gate is an explicit window flag on
`SessionRouter` rather than a live predicate on channel state: frames can arrive between
`reattach-result accepted` and `restoreSessionTabs`' `discardUnclaimed`, and those must still be
held.

- `SessionRouter` gains `openHold()` and a private `holding` flag; `output`/`exit` fall back to
  dropping when it is off. `discardUnclaimed()` and `clear()` close the window.
- `RemoteChannel.consumeTerminalPhase` opens the window when it enters `reattaching`, and exposes
  nothing new beyond the existing `discardUnclaimed()`.
- `handleReattachResult` (`src/remote/resume.ts`) closes the window on an accepted result when no
  resume is settling (the automatic reconnect path, where the tabs are already open);
  `settleAccepted` (`src/sessions/reattach.ts`) closes it when the peer accepts but never answers
  `session-state`. Refusal and every other termination already run `finish()`/`clear()`.
- `PendingFrames` stores each held frame's encoded length beside it, so `claim` subtracts the
  claimed bytes instead of re-encoding the survivors. Because the buffer only ever holds during a
  reattach window and every window end clears it, `overflowed()` is naturally scoped to the attach
  that follows the window that dropped.

## Implementation steps

1. `src/remote/channel-pending.ts` — store `{ frame, bytes }`, subtract in `claim`.
2. `src/remote/channel-sessions.ts` — add the `holding` gate: `openHold()`, gate `output` and the
   unlistened branch of `exit`, close the window in `discardUnclaimed()` and `clear()`.
3. `src/remote/channel.ts` — open the window in `consumeTerminalPhase` when the state flips to
   `reattaching`.
4. `src/remote/resume.ts` — in `handleReattachResult`, on an accepted result with no resume
   settling, call `entry.channel.discardUnclaimed()`.
5. `src/sessions/reattach.ts` — in `settleAccepted`, discard unclaimed frames on the no-answer
   failure path.

## Tests

`src/remote/channel.test.ts` (the held-frame describe block pins the reattach path and must keep
passing):

- a live channel (handshake without a session id) drops an unlistened frame and raises no
  truncation report;
- after a reattach window closes (`discardUnclaimed`), a later unlistened frame on the now-live
  channel is dropped rather than held.

## Out of scope

- The far side's replay buffer (`serve-detach.ts`) — already bounded and unchanged.
- The reporting wording for truncation (`manager-reports.ts`).
- Any change to the reattach orchestration beyond closing the window on the no-answer path.
