# Correct PR 1169's description event inventory for the notifications reveal signal

**Complexity: 2/10** — no source, test, or spec changes; a single pull request description edit.
The correction is mechanical once the wire is read: the description names two `ServerEvent`
members and a two-type bus channel, the diff ships three of each.

The description's "Because a toast has no tab to ride" paragraph says the delivery path is "a new
`notifications` bus channel carrying `toast` and `clear`, two new `ServerEvent` members (`toast`,
`toast-clear`) wired through the existing `broadcast`, and matching listener registries on the
client." Reading the code shows a third member of each:

- `src/bus.ts`'s `NotificationsEvent` (lines 154-157) carries `toast`, `clear`, **and** `reveal`
  (`{ type: 'reveal'; dock: 'left' | 'right' }`).
- `src/protocol/events.ts` (lines 48-57) unions `ToastEvent`, `ToastClearEvent`, **and**
  `NotificationsRevealEvent` (`{ t: 'notifications-reveal'; dock: 'left' | 'right' }`) into
  `ServerEvent`.
- `src/controller/types.ts` (lines 16-18) declares `sendToast`, `sendToastClear`, **and**
  `sendNotificationsReveal`; `src/index.ts` (lines 83-85) wires all three to `broadcast`.
- `web/src/ws.ts` (lines 279-281) exposes `onToast`, `onToastClear`, **and**
  `onNotificationsReveal`.

The `notifications-reveal` event has three triggers, none named in the description's protocol
paragraph:

- Burst escalation: `src/notifications/deliver.ts`'s `escalateToFeed` emits `reveal` when
  `isBurst` fires (`deliver.ts` line 42).
- A toast click: the `revealNotifications` RPC (`src/protocol/core-rpc.ts` line 71,
  `src/message/handler.ts` line 59) calls `controller.revealNotifications()`, which is
  `escalateToFeed` (`src/controller/tab-adapter.ts` line 37).
- A docked `notifications` command: `src/commands/notifications.ts` line 25 emits `reveal` whenever
  the command carries a `left`/`right` keyword, to select the feed in the sidebar on every client —
  not only when the feed doesn't yet exist.

## Goal

The pull request's description accurately inventories the notifications wire protocol: three
`ServerEvent` members, a three-type bus channel, three sinks, three listener registries, and the
three triggers for the reveal signal. No other paragraph, and no code, test, or spec file, changes.

## Approach

Edit only the "Because a toast has no tab to ride" paragraph of the PR description (the fourth
paragraph of "## What") and the `src/bus.ts`, `src/protocol/events.ts`, and wiring bullets under
"## Files changed" → "`src/` — wiring" that name the toast sinks/events, to add the third member
and describe its three triggers. Every other paragraph, section, and the "Files changed" bullets
for files the reveal signal doesn't touch, stays exactly as the author wrote it. The title is not
touched.

## Implementation steps

1. Read the current PR body with `gh pr view 1169 --json body -q .body` and copy it verbatim to
   `./temp/pr-body.md`.
2. In that file, rewrite the "Because a toast has no tab to ride..." paragraph to name all three
   `ServerEvent` members (`toast`, `toast-clear`, `notifications-reveal`, with its left/right dock)
   and the three triggers that raise the reveal signal — burst escalation, a toast click, and a
   docked `notifications` command.
3. In the "Files changed" → "`src/` — wiring" section, update the `src/bus.ts` bullet to say the
   channel carries `toast`, `clear`, and `reveal` (not just `toast` and `clear`), and the
   `src/controller/types.ts`, `src/controller/events.ts`, `src/index.ts` bullet and the
   `src/protocol/events.ts` bullet to name the third sink/event pair alongside the toast pair.
4. In "Files changed" → "`web/src/`", update the `web/src/ws.ts` bullet to name the third listener
   registry (`onNotificationsReveal`) alongside `onToast`/`onToastClear`.
5. Apply with `gh pr edit 1169 --body-file ./temp/pr-body.md` (done in Step 8 of the work-an-issue
   task, after the branch is pushed).

## Tests

None — no source or test files change.

## Out of scope

- The reveal behavior itself (burst escalation, toast click, docked command) — it is a deliberate,
  shipped design; this entry only corrects the description to name it.
- Any other paragraph or "Files changed" bullet in the description not naming the toast/reveal
  wiring.
- The pull request title.
- `src/notifications/record.ts`'s blocking-open issue and the user-documentation entries — separate
  backlog items.
