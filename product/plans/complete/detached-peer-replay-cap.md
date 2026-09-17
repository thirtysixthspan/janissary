# Cap the detached peer's replay buffer

**Complexity: 6/10** — a bounded buffer with a drop rule in `serve-detach.ts`, one extended frame field threaded through decode/encode and the reattach-accept path, and a user-visible report on the local side.

PR 1131 backlog item: *"Cap and age out the detached peer's replay buffer so a week-long detachment cannot exhaust memory on the remote host."*

`DetachedPeer.emit` in `src/remote/serve-detach.ts` pushes every non-PTY frame — transcript blocks (`harness transcript`'s own feed), ACP chunks, and pipe-mode process output (a remote tab's persistent shell) — onto an unbounded `pending` array whenever no sink is attached, for up to the full seven days `REMOTE_DETACH_TIMEOUT_MS` permits. Nothing trims it. The plan at `product/plans/complete/survive-laptop-sleep-and-resume.md` names "a cap, an overflow rule, and a replay path" as the price of buffering at all; the replay path shipped without the first two.

## Design decisions

**A byte budget, not a frame count.** A transcript block or an ACP chunk can be arbitrarily large, so capping by frame *count* would not bound memory — a handful of huge chunks could still exhaust it. `pending` gets a running byte total (the encoded frame's string length, the same string `encodeFrame` already produces) and a fixed budget; the buffer never holds more than that many bytes.

**Drop from the front — oldest first.** The newest output is what a reattaching user is most likely to want (what just happened), and a truncated-from-the-start replay reads the same way a scroll-back buffer that dropped its earliest lines does — an old, understood shape rather than a new one.

**The budget is one megabyte.** Large enough that an ordinary detachment (minutes to a few hours) never truncates anything a real session produces in that time, small enough that even a full week of a chatty ACP agent or a busy remote shell cannot come close to exhausting a remote host's memory. There is no existing precedent in this codebase for a buffer size to match, so this is a judgment call rather than a reused constant.

**The gap is reported through the existing `reattach-result` frame, not a new one.** `reattach-result` already carries the one boolean the local side needs to act on (`accepted`); adding an optional `truncated?: boolean` to the same frame means the local side learns about a drop at the exact moment it is relevant — when a reattach that lost some buffered output succeeds — without a new frame type or a second round trip. `DetachedPeer` tracks whether any drop has occurred since the last successful replay and clears the flag once it reports it, so a `truncated` flag is never stale.

**The report lands the way `sessionEnded`/`browserError` already do — riding the tab, not injected into a live stream.** Splicing a synthetic marker into the `pending` array itself was considered and rejected: a pipe-mode frame's bytes are consumed by `executeShellCmd`'s sentinel-matching protocol (`src/remote/shell-session.ts`'s own comment: a tty's echo "would feed each written command... matching the sentinel before it ran"), so inserting arbitrary text into that stream risks corrupting command output parsing on the one path most likely to have lost bytes. `RemoteManager` instead appends a plain log line to a non-harness tab's `tab.log` when `reattach-result` arrives with `truncated: true` — the same shape `endRemoteSession`'s non-harness branch already uses for a plain-text report. A harness tab's body is its PTY and nothing renders `tab.log` there (the same reasoning `browserError`'s doc comment already states), so a harness-only channel gets no visible marker in this pass; this is a real, stated limitation, not an oversight, since a harness's own transcript truncation is already implicitly visible as a gap in `harness transcript`'s output the next time it is polled.

## Proposed changes

- **`src/remote/protocol.ts`** — add `truncated?: boolean` to the `reattach-result` `ServerFrame` member.
- **`src/remote/frame-decode.ts`** — extend the `reattach-result` case to accept an optional boolean `truncated`, rejecting the frame as malformed if present and not a boolean.
- **`src/remote/serve-detach.ts`** — add `PENDING_BUFFER_BUDGET_BYTES = 1_000_000` (exported for the test), a `pendingBytes` running total, and a `dropped` flag to `DetachedPeer`. In `emit`, when a frame is queued (the existing `pending.push` branch), add its encoded length to `pendingBytes` and, while over budget, `shift()` the oldest frame off `pending` and subtract its encoded length, setting `dropped = true`. In `accept`'s reattach-success branch, emit `{ type: 'reattach-result', accepted: true, ...(this.dropped && { truncated: true }) }` in place of the current unconditional `{ accepted: true }`, and reset `dropped = false` right after.
- **`src/remote/manager.ts`** — in the `onFrame` handler's `reattach-result` case, when `frame.accepted && frame.truncated`, call a new private `reportTruncatedReplay(entry)` that appends a `tab.log` entry (`{ input: '', output: 'Some remote output produced while disconnected was dropped to limit memory use.' }`) to every label in `entry.labels` whose tab is not a harness tab, then emits `messageBus.emit('state', { type: 'dirty' })` once so the client re-renders.

## Tests

- `src/remote/serve.test.ts` — extend the `detached peer rendezvous` suite with a case beside `reattaches over a private socket, replays missed state once, and drops PTY output`: emit enough oversized `transcript` frames after `detach()` to exceed `PENDING_BUFFER_BUDGET_BYTES`, then reattach via `relayPeer` and assert the replayed `reattach-result` carries `truncated: true`, the oldest emitted blocks are absent from the replay, and the newest survive.
- `src/remote/manager.test.ts` — a case that delivers `{ type: 'reattach-result', accepted: true, truncated: true }` over the reattach transport and asserts the non-harness owning tab's `log` gains the drop-notice entry, and a second case (or the existing harness-based fixtures) confirming a harness tab's `log` is left untouched.

## Spec

- **`product/specs/sleep-and-resume.md`** — add one sentence to the "Remote work" section stating that buffered transcript, agent-reply, and shell output produced while detached is bounded and the oldest of it is dropped if a detachment produces more than can be held, with a note in the affected tab when that happens.

## Out of scope

- A visible marker for a harness-only channel's truncated `harness transcript` feed — stated above as a real limitation, not fixed here.
- Aging entries out by time rather than by size; the byte budget alone is sufficient to bound memory regardless of how long a peer stays detached.
- Correcting the pull request description's own silence on the buffer's existence — the description is not touched by fixes in PR mode except when an entry's own remedy specifically names a description correction, which this one does not.

## Verification

```
$janissary/scripts/run.mjs check-diff
```
