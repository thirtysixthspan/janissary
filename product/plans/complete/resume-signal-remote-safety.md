# Resume signal: only reconnect a failed remote transport, and raise the wall-clock threshold

**Complexity: 5/10** — two independent, small changes: a threshold/tick constant adjustment with one downstream consumer to decouple, and a guard added to one function.

PR 1131 backlog item: *"Reconnect a remote session on resume only when its transport has actually failed, and raise the wall-clock threshold so a stalled event loop is not mistaken for sleep."*

`resumeRemote` in `src/remote/reattach.ts` unconditionally force-closes and reconnects every remote entry with a session id and a workspace on every `system:resumed` bus event, with no check that the transport is actually unhealthy. `ResumeWatch` (`src/resume-watch.ts`) declares a resume whenever a 500ms tick observes a wall-clock gap beyond `RESUME_THRESHOLD_MS` (5000ms). A five-second event-loop stall — a large clone, a heavy state serialization, a GC pause — fires the same signal a real sleep does, and every healthy remote ssh connection is torn down and replaced, silently discarding whatever PTY output was in flight (deliberately not buffered across a gap per the plan's design).

## Design decisions

**Raise the threshold; keep the schedule module's own number separate.** `src/schedule/manager.ts` currently imports `RESUME_THRESHOLD_MS` to decide whether a delivered command is "late" enough to notify. That value is independently specified in `product/specs/scheduling.md` and `product/specs/notifications.md` as "more than five seconds late," a number the schedule spec owns for its own reason (not being flooded with notifications for delivery jitter) — it is not the same number as "how long a gap means the machine was asleep." Raising `RESUME_THRESHOLD_MS` to a value a stalled event loop cannot plausibly reach would silently raise the schedule lateness bar to the same value if the import stayed, changing already-specified user-visible behavior as a side effect. The schedule module gets its own `SCHEDULE_LATE_THRESHOLD_MS = 5000` constant instead, so its behavior is unaffected by this fix.

**Thirty seconds is the new resume floor, and the tick slows to match.** `RESUME_THRESHOLD_MS` moves to 30000 — a value normal event-loop contention does not reach, while a real sleep of any length still clears it easily. `RESUME_TICK_MS` moves from 500 to 5000: detecting a 30-second-or-longer gap does not need a twice-a-second check, and a laptop-focused feature has no business keeping the Node event loop busy at that cadence. `src/resume-watch.test.ts`'s existing case computes its expected gap from the exported `RESUME_TICK_MS` symbol rather than a literal, so it keeps passing unchanged.

**`resumeRemote` acts only on an entry already in the reconnecting state.** The `Reattach` class already has an `active` flag set exactly when a transport loss has been observed (`lost()`) and cleared once a reattach is accepted (`accepted()`). An entry whose channel is `attached` and whose `reconnect.active` is `false` has a live transport by definition — there is nothing broken to fix, and force-closing it is the bug. When `reconnect.active` is `true`, the entry is already mid-backoff waiting to retry; the resume signal's only job there is to collapse that wait, which `Reattach.retry()` already does (it clears the pending timer and reconnects immediately). This removes the need for `resumeRemote` to call `channel.close()`/`channel.closed()` at all — those calls were how the old code manufactured a "transport lost" event on a channel that was not actually lost; a genuinely lost transport already went through that path via `RemoteManager.channelClosed`.

## Proposed changes

- **`src/resume-watch.ts`** — `RESUME_THRESHOLD_MS` → `30000`; `RESUME_TICK_MS` → `5000`.
- **`src/schedule/manager.ts`** — replace the `import { RESUME_THRESHOLD_MS } from '../resume-watch.js'` with a local `const SCHEDULE_LATE_THRESHOLD_MS = 5000;` declared beside the other module-level constants, and use it in place of `RESUME_THRESHOLD_MS` in `fireDue`'s lateness check. No behavior change for the schedule module — the number stays 5000.
- **`src/remote/reattach.ts`** — replace `resumeRemote`'s body: return early when `entry.closed`, when the entry has no `sessionId`/`workspaceDir` (as today), or when `!entry.reconnect.active` (the channel is not currently reconnecting); otherwise call `entry.reconnect.retry()` to collapse the backoff wait. Drop the `entry.channel.close()`/`entry.channel.closed()` calls entirely, since they no longer apply — an entry only reaches this function's acted-on branch when it is already reconnecting, and that state was entered through the transport's own loss, not fabricated here.

## Tests

- `src/remote/reattach.test.ts` — the existing `replaces a stale SSH transport immediately on system resume` case currently asserts a resume always produces a second transport from a freshly-attached channel; rewrite it to pin the new rule in both directions: emitting `resumed` on a channel that is still attached (never lost its transport) leaves the transport count at one, and emitting it on an entry already reconnecting (after `h.transports[0].onExit()`) produces a second transport immediately rather than waiting out the backoff delay.
- `src/schedule/manager.test.ts` — no new cases needed; the existing lateness cases (`fires each overdue entry once, reports lateness...`, `does not report an on-time command as late`) exercise the same 5000ms boundary through the module's own constant now rather than the shared import, and must keep passing unchanged.
- `src/index.test.ts` — the grace-window cases depend on the `resumed` event firing at all (via `messageBus.emit('system', { type: 'resumed', sleptMs: 60_000 })` directly in the `resume` case, and via `vi.setSystemTime` in the `wall-clock jump` case) rather than on `ResumeWatch`'s own tick, so they are unaffected by the threshold/tick change and must keep passing unchanged.

## Out of scope

- Any change to how `ResumeWatch` itself detects a gap (the tick-and-compare mechanism), only its cadence and threshold.
- The `entry.reconnect.active`-but-mid-connect edge case (a reattach already in flight when a second resume signal arrives): `Reattach.retry()` tolerates being called again — it clears any pending timer/deadline and reconnects — so a redundant call is wasted work, not a correctness bug, and is not specially guarded against here.

## Verification

```
$janissary/scripts/run.mjs check-diff
```
