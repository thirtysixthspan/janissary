# One notification for a reattach that ends a session

Complexity: 3/10

## Goal

An accepted reattach whose peer is holding nothing, and a reattach the peer refuses, each land two
lines in the notifications feed — the `<what> on <host> ended.` line the actions in
`src/sessions/actions.ts` report through the `remote-session` event, plus the pre-existing
`Remote janus on <host> ended — start a new agent or shell to continue.` line. The spec promises one
line per action, and the two wordings contradict. Make the generic `remote-session-ended`
announcement conditional on who ended the session, keeping the sessions actions as the single
narrator on the sessions-driven paths.

## Approach

`terminateRemoteEntry` already carries an `announce` flag, but it only muted the session's own line:
the per-process end lines its `finish()` sweep produced (`endRemoteProcess` → `endRemoteSession`)
hummed along underneath. Two moves compose:

- `endRemoteSession` gains an `announce` flag (default true, so every ending that happens to a
  session on its own keeps announcing); `endRemoteProcess` reads a new `announceEnds` field on the
  entry, which `terminateRemoteEntry` sets to false whenever it is called with announcing
  suppressed. One muted settlement mutes the whole finish sweep.
- `handleReattachResult` (`src/remote/resume.ts`) uses `state.resuming` to distinguish a pressed
  reattach from an automatic reconnect: on a pressed refusal it terminates with announcing
  suppressed; on an automatic refusal the generic announcement stands unchanged.

No spec rewrite is needed — `product/specs/sessions-tab.md`'s reporting section already promises one
line, and `product/specs/notifications.md`'s description of `remote-session-ended` still holds (the
event now narrowly reports a session that ended on its own, which is the automatic path).

## Implementation steps

1. `src/remote/reattach.ts` — `announceEnds?: boolean` on `RemoteEntry`; `announce` parameter on
   `endRemoteSession` (mutes the per-label notify, keeps the tab marking); `endRemoteProcess`
   consults `entry.announceEnds !== false`; `terminateRemoteEntry` sets the field when announcing is
   suppressed.
2. `src/remote/resume.ts` — in `handleReattachResult`, a refusal with `state.resuming` resolves the
   resume first and terminates with announcing suppressed; the automatic path keeps announcing.

## Tests

- `src/remote/resume.test.ts` — a refusal on a pressed reattach (from a record) emits no
  `remote-session-ended` notification; a refusal on the automatic reconnect path emits exactly the
  generic one.
- `src/sessions/manager.test.ts` — a reattach that ends the session and a successful end each
  record exactly one notification.

## Out of scope

- The wording of either event's line (`notifications.ts`, `manager-reports.ts`).
- The end action's flow (`end-session.ts`), whose outcome narration already comes from the actions.
