# Notification toasts when the notifications tab is closed

**Complexity: 7/10** — the toast itself is small; what drives the number is that it forces notification *retention* apart from notification *rendering*. That lands a new manager, a new `.janissary/` artifact, a new bus channel, two new `ServerEvent` members and a new RPC, a client overlay with pausable per-toast timers, and a rewrite of `product/specs/notifications.md`'s "no backlog" rule — across roughly fifteen files on both sides, every one of which has a close precedent to copy.

## Summary

The feature, as stated at invocation:

> if the notifications tab is not open, notifications should be presented as a toast message in the upper right corner of the screen with a time limited duration of 4 seconds. the toast should animate out via fade over a 2 second window.

Today a notification that fires while the notifications tab is closed does not go unseen — it *opens the tab*. `notify()` calls `revealNotificationsTab()` (`src/notifications/index.ts:199`), which docks a fresh feed into the right sidebar and then appends the line (`src/notifications/tab.ts:38-46`). That is a heavy answer to a light event: a sidebar appears, the layout reflows, and it stays until the user closes it — for a line the user may only have wanted to glance at. This plan replaces that reveal with a transient toast in the upper-right corner: a notification arriving with no feed on screen is *shown*, briefly, and the layout the user arranged is left alone.

Answering where a toasted line then *lives* pulls a second, larger change in with it. Today a notification **is** a transcript entry on the notifications tab — `appendNotification` is a no-op when no tab is open (`src/notifications/tab.ts:51-54`, "the event is dropped, not buffered"), so the tab's existence is the notification's existence, and `product/specs/notifications.md` states the consequence outright: "There is still **no backlog**." Once a notification can be shown without a tab, that identity has to come apart. This plan therefore separates **holding** a notification from **rendering** one: a queue owns every notification the user was given, independent of whether any tab exists to show it, and the notifications tab becomes a view *of* that queue rather than the place notifications are kept. Each notification is additionally appended to a write-only record on disk that outlives the run.

The delivery mechanism is also new. Notifications reach the client today as ordinary transcript entries on the per-tab `bufferLines` broadcast — the spec's "Delivery model" states there is "no toast banner … and no dedicated server→client push channel." A toast with no tab to ride needs its own server→client event, alongside `layout` and `collect-tree-state` in `ServerEvent` (`src/protocol/events.ts:44-45`).

## Design decisions

### What gets notified, and where it is kept

1. **Eligibility is unchanged.** `shouldNotify()` still decides whether an event becomes a notification at all — the per-event ambient toggles in `.janissary/config.json` and focus suppression run first, exactly as today (`src/notifications/index.ts:109-120`). Everything below concerns a notification that has already passed those rules; an event they reject enters no queue, writes no record, and shows no toast, just as it opens nothing today.

2. **Holding and rendering are separate.** A **notification queue** holds every eligible notification, whether or not a notifications tab exists. The tab renders the queue when it is visible; a toast renders a single notification when the tab is not. Neither surface owns the notification, and the queue is unaffected by what either one does. This replaces the current identity between a notification and a notifications-tab transcript entry, and with it the "no backlog" rule.

3. **The queue holds 200 entries and lives for the run.** In memory, oldest dropped first past 200, holding only notifications from the current application run. It survives the notifications tab being closed and reopened — that is the point — but it is not persisted and not restored by `--relaunch`, keeping the tab's documented character as a live view rather than a restored one. Because the feed renders the queue, 200 is also the most the feed can show; `transcriptMaxLines` (25000) no longer governs it. *Ceiling:* a session that produces more than 200 notifications loses the oldest from the feed — deliberately, since decision 4's file is the durable record and `notifications clear` plus `grep` is the way to read further back. Raising it is a one-constant change if that proves too tight.

4. **Every notification is also appended to `.janissary/notifications.json`.** A write-only record that persists across runs: one JSON object per line, appended as each notification is recorded, and **never read back by the application**. It is a durable trail for the user to grep, not a source the queue is rehydrated from — which is exactly why decision 3's queue can be run-scoped while the file is not. `.janissary/` is already gitignored (`.gitignore:6`). The `.json` name with newline-delimited objects inside matches `.janissary/log/<date>.json`, which `TranscriptLogger.append` writes the same way (`src/transcript/logger.ts:17-18`, `appendFileSync(logPath, JSON.stringify(entry) + '\n')`).

5. **A record carries the ISO detection time, event type, tab label, message, and link targets.** Full ISO (`Date.prototype.toISOString`) rather than the feed's `8:32pm`, because a file spanning runs needs an unambiguous date. The `NotificationEventType` is kept even though no surface shows it — it is what makes the file greppable by kind. The `openFile` / `openTab` targets some events carry (`src/notifications/index.ts:188-189`) are included when present. The dot colour is not: it is a rendering detail of a session the file outlives.

6. **The file only grows, and `notifications clear` is what empties it.** No rotation and no size cap — a notification line is small and infrequent next to the transcript log it is modelled on, which itself has no size cap. *Ceiling:* an installation that never clears accumulates one file indefinitely; per-day files like `.janissary/log/` are the upgrade path if that ever matters.

7. **Writing the file is best-effort and silent.** A write that fails (no permission, disk full, read-only checkout) is swallowed, further writes are abandoned for the rest of the run, and the queue, feed, and toast are unaffected. This matches `TranscriptLogger.append`, which does not guard its writes either. Deliberately *not* reported as a notification: a notification about failing to record notifications would itself need recording.

### Which surface a notification reaches

8. **"Not open" means "not on screen," not "does not exist."** A toast fires whenever the feed is not actually visible: when no notifications tab exists, *and* when one exists in the centre strip but is not the active tab. A **docked** feed is always rendered in its sidebar, so it suppresses the toast. This is a visibility test rather than the existence test `notificationsTab()` answers alone (`src/notifications/tab.ts:15-17`) — it also needs the tab's `dock` field (`src/tab/types.ts:319`) and the active tab (`managers.tab.cur()`), both of which the server already holds.

9. **A burst escalates to the feed: three or more notifications within ten seconds.** Sustained activity is more than a corner can carry, so on the third notification inside a ten-second window the notifications tab is opened, and it is left open afterwards. The feed renders the queue (decision 2), so the burst's earlier notifications are already in it when it appears — the escalation needs no replay mechanism of its own, which is the practical payoff of separating holding from rendering.

10. **Escalating with a hidden feed docks it right.** When a notifications tab already exists in the centre strip but is not active — the case decision 8 made toast-worthy — escalation docks it into the right sidebar rather than making it active, so the feed becomes visible without moving the user out of the tab they were working in. This is what `revealNotificationsTab()` already does for the no-tab case, including recording the active tab beforehand and restoring it afterwards; for an existing tab it is `managers.tab.setDock(index, 'right')` with the same restore around it.

11. **Escalation clears the toasts on screen immediately.** The moment the feed becomes visible every toast is removed, without fading. The feed now shows those same notifications, so leaving toasts up would display the same line twice in two places at once.

12. **A replayed notification does not toast.** `notify()`'s `detectedAt` parameter loses its `new Date()` default and becomes genuinely optional (`src/notifications/index.ts:195`): a caller that passes one is reporting something it detected earlier, and such a notification goes to the queue and the record but shows no toast. Today the only caller that passes it is a remote harness's queued auto-approvals replayed on reattach (`src/remote/pty-session.ts:61`, `new Date(capturedAt)`), which can be hours or days old — and a timeless toast (decision 14) cannot honestly represent that. The feed, which carries times and dates them across days via `provenanceTimestamp`, is the right surface for history. A replayed notification still counts toward decision 9's burst window, so a reattach delivering several of them docks the feed open: silence in the corner, history in the feed.

### What a toast looks like and how it behaves

13. **Upper-right corner, 4 seconds visible, 2-second fade out.** Taken verbatim from the feature text. The corner is the **window's**, not the centre column's: the stack is `position: fixed` and so viewport-anchored, floating over the right sidebar when one is open — `.app` sets no transform or filter (`web/src/theme.css:159`), so nothing re-parents a fixed descendant.

14. **A toast reads `● <tab>: <message>`.** The same coloured dot and originating tab label the feed line carries, with the same message body `notificationText` produces, and **no timestamp** — a toast is by definition happening now, so the clock spends characters in a line that has four seconds to be read. The colour is the sending tab's `dotColor` (`src/notifications/index.ts:200`), exactly as in the feed.

15. **Links are dropped; the body is clamped to two lines.** The `openFile` / `openTab` targets some events carry are not rendered in a toast — they are preserved in the queue and the record, so the link is still there when the feed is opened, and a link with a four-second lifetime is not worth the conflict with decision 17's click. The body is clamped to two lines by CSS (`-webkit-line-clamp`, as the platform already provides) rather than by truncating the string server-side: `e2e-browser-gone` appends a crash-log tail that would otherwise make a very tall toast, and the full text is in the feed either way.

16. **The toast yields the corner to what is already in it.** `.connection-status` (`web/src/theme.css:314-318`) and `.status-panels` (`web/src/theme.css:321-325`) already float there; the stack begins beneath them rather than over them. A toast must never hide "Cannot reach session", which is very often the reason notifications started arriving in the first place.

17. **Clicking a toast opens the feed; hovering one holds it.** A click runs decision 9's escalation exactly — the feed docks into the right sidebar (or, if one already exists hidden in the centre strip, is docked right per decision 10), the active tab is left alone, and every toast on screen clears at once, since the feed now renders those same notifications. Hovering holds a toast's clock, and returns a fading one to fully visible; moving away restarts it with the time that was left. Now that a toast is a click target, one that fades while being aimed at would be worse than one that does not.

18. **The stack needs no cap of its own.** Decision 9 bounds it: a third notification inside ten seconds escalates and clears the corner, and an unhovered toast lives at most six seconds, so at most two are ever stacked.

### Clearing

19. **Closing the notifications tab is purely a display action.** It discards nothing. The next `notifications` reopens the feed rendering whatever the queue still holds.

20. **`notifications clear` empties everything and opens nothing.** A `clear` keyword on the existing `notifications [left|right]` command empties the in-memory queue, truncates `.janissary/notifications.json`, and removes any toasts on screen through the same clear event decisions 11 and 17 use; a feed already open simply goes empty. It works whether or not a notifications tab exists, and records a transcript entry in the issuing tab like the command already does (`src/commands/notifications.ts:13`). `clear` is **exclusive with a dock keyword**: it opens and moves nothing, and a dock keyword alongside it (`notifications right clear`) is ignored — the command keeps the single-keyword parse it has today, and "clear" names an action rather than a placement.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Deciding whether an event notifies at all (toggles + focus suppression) | `shouldNotify` | `src/notifications/index.ts:109-120` |
| Rendering an event's message body and its provenance header | `notificationText`, `provenanceTimestamp` | `src/notifications/index.ts:124-174` |
| Detecting whether a notifications tab exists; its dock field | `notificationsTab`; `Tab.dock` | `src/notifications/tab.ts:15-17`; `src/tab/types.ts:319` |
| Opening the feed docked right without moving the active tab | `revealNotificationsTab` | `src/notifications/tab.ts:38-46` |
| Seeding a tab's `log` directly rather than replaying appends | `rehydrateTabViews`' `const log = capLog(loadTranscript(...))` | `src/tab/rehydrate.ts:15` |
| A capped, oldest-dropped-first entry list | `capLog(log, max)` | `src/tab/transcript-log.ts:9` |
| An append-only, never-read, one-JSON-object-per-line record under `.janissary/`, written unguarded | `TranscriptLogger.append` | `src/transcript/logger.ts:15-19` |
| Registering a `.janissary/` artifact that must survive a fresh start (no `clear` hook) | the `remoteSessions` entry and its comment | `src/state-dirs.ts:84-91` |
| A manager in the registry, its dispose position, its construction | `ManagerRegistry`, `MANAGER_DISPOSE_ORDER`, `createManagers` | `src/managers.ts:32-59`, `src/managers.ts:81-110`, `src/controller/create-managers.ts:42-75` |
| A bus channel whose events become a client broadcast | `layout` → `sinks.sendLayout` → `broadcast` | `src/bus.ts:150-156`, `src/controller/events.ts:20-26`, `src/index.ts:81` |
| A server→client event that is not the state snapshot | `LayoutEvent`, `CollectTreeStateEvent` | `src/protocol/events.ts:32-45` |
| A parameterless client→server RPC, and the five files it touches | `toggleCollapse` | `src/protocol/core-rpc.ts:23`, `src/client-message.ts:87`, `src/client-params/core.ts:33`, `src/message/handler.ts:57`, `src/controller/tab-adapter.ts:14,34` |
| Client-side dispatch of a non-state server event to listeners | `onEvent`'s `layout` arm; `onLayout` | `web/src/ws.ts:147-156`; `web/src/ws.ts:260` |
| A transient, timed, self-clearing indicator driven by `setTimeout`/`clearTimeout` | `useConnectionStatus` | `web/src/useConnectionStatus.ts:9-22` |
| A transient overlay pinned out of flow in the top-right corner | `.connection-status` and its component | `web/src/theme.css:309-318`, `web/src/ConnectionStatusLabel.tsx` |
| A stacked column of floating panels in that same corner | `.status-panels` | `web/src/theme.css:320-327` |
| A window-level sibling of the sidebars rendered by `AppShell` | `DefaultContextMenu` | `web/src/AppShell.tsx:49` |
| A CSS keyframe animation in the single stylesheet | `icon-spin`, `dot-blink`, `editor-caret-blink` | `web/src/theme.css:292`, `:296`, `:747` |
| The shared tab-manager fake every `notify` test lands on | `fakeNotificationsHost` | `src/notifications/tab-test-fixture.ts` |
| The `notifications [left|right]` keyword parse that `clear` joins | the `notifications` command's `/^(left\|right)\b/i` | `src/commands/notifications.ts:14-17` |

## Proposed changes

Order keeps the tree green at every checkpoint: the extraction and the two new stores land first with nothing depending on them, then the routing that uses them, then the protocol and the client. Depends on no other plan.

1. **`src/notifications/format.ts` — extracted, no behavior change.** `formatTimestamp`, `provenanceTimestamp`, `notificationText`, and `SHORT_MONTHS` move out of `src/notifications/index.ts`, which is 213 lines before this plan adds routing to it. The split is meaningful rather than mechanical: one file about *what notifies*, one about *how it reads*. `index.ts` re-exports them so the existing importers are untouched, and their cases in `src/notifications/index.test.ts` move to a new `format.test.ts`.

2. **A notification queue manager under `src/notifications/` — the store.** A class holding the run's notifications: append (capped at 200 oldest-first, via `capLog` from `src/tab/transcript-log.ts:9`), read, clear, and the burst test of decision 9 — a scan over the detection times it already holds, not a second list kept in parallel (linear over at most 200 entries, called once per notification). Each held notification carries its rendered `LogEntry` — the same shape the feed's transcript entries take, so the tab can render it directly — plus the detection time, event type, and link targets decision 5's record needs. It is added to `ManagerRegistry` (`src/managers.ts:32-59`), constructed **first** in `createManagers` since it takes no other manager, and placed in `MANAGER_DISPOSE_ORDER` immediately before `questions` — the last group, with the managers holding state others read while tearing down. It owns no process or handle, so it declares no `dispose()`; `MANAGER_DISPOSE_ORDER_IS_COMPLETE` (`src/managers.ts:116`) fails to compile until its position is added.

3. **A notification record module under `src/notifications/` — the file.** Appends one JSON line per notification to `.janissary/notifications.json` and truncates it on clear. Modelled directly on `TranscriptLogger`: the project directory arrives once through the `stateDirectories` registry in `src/state-dirs.ts`, `appendFileSync` does the write, and it is a no-op when no directory is set. Its registry entry deliberately has **no** `clear`, like the `remoteSessions` entry whose comment already explains why (`src/state-dirs.ts:85-87`) — a fresh start must not sweep a file whose purpose is outliving runs. Decision 7's one addition over the precedent: a `try`/`catch` that sets a flag stopping further attempts for the run.

4. **`src/notifications/tab.ts` — a visibility predicate, and the feed seeded from the queue.** A predicate answering decision 8: on screen when a notifications tab is docked into either sidebar, or is the active tab in the centre strip. `openNotificationsTab` seeds a newly created tab's `log` from the queue — a direct assignment as `src/tab/rehydrate.ts:15` does, deliberately **not** `managers.tab.append` per entry, which would re-emit `entry:appended` and so re-run agent-state persistence and `TranscriptLogger` for lines already recorded — followed by the usual `messageBus.emit('state', { type: 'dirty' })`. `appendNotification` keeps mirroring live notifications into the tab when one exists, so `bufferLines`, the `Transcript` renderer, and its `toReversed()` newest-first ordering (`web/src/NotificationsTab.tsx:38`) are all untouched; its existing "dropped, not buffered" comment is now wrong and is corrected — the queue holds it. `revealNotificationsTab()` keeps its mechanism and is called by decision 9's escalation and decision 17's click.

5. **`src/notifications/index.ts` — `notify()` routes a recorded notification.** After `shouldNotify()` accepts an event, `notify()` renders body and provenance through `format.ts`, appends to the queue and the record, and then chooses a surface: append to the feed when it is on screen; otherwise escalate if the queue's burst test says this is the third notification inside ten seconds, else emit a toast — unless `detectedAt` was supplied, in which case nothing more (decision 12). The `detectedAt` parameter drops its default so "not supplied" is distinguishable from "supplied as now"; the one call site that passes it (`src/remote/pty-session.ts:61`) is unchanged, and the ~20 that do not gain nothing to pass.

6. **`src/bus.ts`, `src/controller/types.ts`, `src/controller/events.ts`, `src/index.ts` — the broadcast path.** A new `notifications` channel in `BusChannels` (`src/bus.ts:150-154`) carrying a toast event and a clear event; `wireControllerEvents` subscribes and calls new optional `sendToast`/`sendToastClear` sinks, exactly as it does for `layout` (`src/controller/events.ts:20-26`); `src/index.ts` wires both to the existing `broadcast` (`src/index.ts:69-72`), so every connected client sees them. `notify()` gains no knowledge of sinks or sockets — it emits, as the layout path does.

7. **`src/protocol/events.ts` — two `ServerEvent` members.** A toast event carrying the originating tab label, the message body, and the dot colour as separate fields — mirroring the `from`/`fromColor` split `LogEntry` already uses, so the client owns presentation including decision 15's clamp — and a parameterless clear event. Both join the `ServerEvent` union at `src/protocol/events.ts:44-45`. Both are one-shot, not state fields: nothing about a toast survives a reconnect, and a client that reloads simply has an empty corner.

8. **A reveal RPC — five files, following `toggleCollapse` exactly.** A parameterless member in `RpcCall` (`src/protocol/core-rpc.ts`), `'ack'` in `src/client-message.ts`, `noParams` in `src/client-params/core.ts`, a dispatch case in `src/message/handler.ts`, and the controller method it calls (`src/controller/tab-adapter.ts`), running decision 9's escalation server-side. A toast click writes no transcript entry anywhere — it is a UI gesture, not a command anyone typed.

9. **`src/commands/notifications.ts` — the `clear` keyword.** Parsed alongside `left`/`right` in the same `exec` (`src/commands/notifications.ts:14-16`), calling the queue's clear, the record's truncate, and the clear emit, and recording its transcript entry in the issuing tab as the command already does. `clear` is exclusive with a dock keyword: `notifications clear` clears and opens nothing.

10. **`web/src/ws.ts` — client dispatch.** Toast and clear arms in `onEvent`'s switch (`web/src/ws.ts:121-179`) and a listener registry mirroring `layoutListeners`/`onLayout` (`web/src/ws.ts:260`).

11. **A toast overlay under `web/src/` — the corner.** Following `ai/guidelines/react-code-organization.md`'s hook/component split: a hook subscribes to the client's toast and clear events and owns each toast's lifecycle — a `setTimeout` for the visible phase plus the deadline it was started against, cleared and remembered on hover, restarted with the remainder on un-hover, then a second timer covering the fade before removal — extending the `setTimeout`-and-`clearTimeout`-on-cleanup shape `useConnectionStatus` already uses (`web/src/useConnectionStatus.ts:9-22`), so the whole lifecycle stays testable under fake timers rather than depending on an `animationend` event jsdom does not fire. A presentational component renders the stack and sends the reveal RPC on click. Mounted in `web/src/AppShell.tsx` beside `DefaultContextMenu` (`web/src/AppShell.tsx:49`), the window-level sibling of the sidebars it already renders; `web/src/App.tsx` is not touched, which keeps this plan clear of the deferred backlog item about that file's size.

12. **`web/src/theme.css` — toast styling and the fade keyframe.** A `position: fixed` stack in the upper-right corner, offset below `.connection-status` and `.status-panels` with a `z-index` above the sidebars, `pointer-events: auto` (unlike `.connection-status`) since decision 17 makes it clickable, `-webkit-line-clamp: 2` on the body, and a fade-out keyframe alongside the existing three.

13. **Docs.** `product/specs/notifications.md` is substantially revised: the queue and its separation from rendering, the 200-entry run-scoped cap, the record file, the toast with its timings and behavior, the burst escalation replacing the unconditional reveal, `notifications clear`, and the retirement of the "no backlog" rule in "Opened by the event that needs it". The "Delivery model" section's "no toast banner … no dedicated server→client push channel" sentence is no longer true and is rewritten. `.janissary/notifications.json` is documented where the other `.janissary/` artifacts are described. `product/specs/application-config.md` needs no change — no new config key. *Ceiling:* the 4s/2s timings, the 200-entry cap, and the three-in-ten-seconds burst threshold are constants, not config; adding them to `NotificationConfig` is the upgrade path if users want to tune them.

## Tests

Colocated per existing convention (`src/**/*.test.ts`, `web/src/**/*.test.tsx`):

- `src/notifications/format.test.ts` — the existing formatting cases, moved with their functions, unchanged.
- The queue manager's test — appends in order, caps at 200 dropping oldest, reads back, clears, and answers the burst test true on the third detection time inside ten seconds and false when they are spread wider.
- The record module's test — one JSON line per notification carrying decision 5's fields; truncation on clear; a failing write is swallowed, does not throw, and stops further attempts; no project directory is a no-op.
- `src/notifications/index.test.ts` — an event `shouldNotify` rejects touches nothing; an accepted event always reaches the queue and the record; the surface is the feed when it is on screen, a toast when it is not, no toast when `detectedAt` was supplied, and the escalation on the third notification inside ten seconds — including the replayed-notification case, which escalates without ever having toasted.
- `src/notifications/tab.test.ts` — the visibility predicate across all four placements (absent, docked left, docked right, centre-strip active vs not); a reopened feed renders the queue's contents; escalation with a hidden centre-strip feed docks it right and leaves the active tab alone. `src/notifications/tab-test-fixture.ts`'s `FakeTabRecord` gains `dock`, its fake gains `cur()`, and its comment about the drop-if-closed behavior is corrected.
- `src/commands/notifications.test.ts` (new file; only `notify.test.ts` exists today) — `clear` empties queue and file and emits the clear, works with no tab open, and leaves the `left`/`right` parse intact.
- `src/managers.test.ts` — the existing dispose-order duplicate check covers the new manager; the completeness check is a compile-time assertion, so no new case is needed.
- `web/src/ws.test.ts` — toast and clear events reach registered listeners and unsubscribe cleanly.
- A test beside the toast overlay — a toast renders dot, label, and message; expires on schedule under fake timers; holds while hovered and resumes with the remaining time after; clears immediately on the clear event; sends the reveal RPC and clears the stack on click; and clears its timers on unmount.

## Out of scope

- Any change to which events notify, to the ambient toggles, or to focus suppression.
- Any change to the `notifications [left|right]` command's existing keywords, or to docking.
- Reading `.janissary/notifications.json` back — into the queue, the feed, or any other surface.
- Persisting the queue across runs, or restoring it on `--relaunch`.
- Rendering link targets in a toast, or any toast action beyond click-to-reveal.
- Sound, OS-level notifications, or any notification surface other than the in-app toast and the feed.
- Any new configuration key: the timings, the 200-entry cap, and the burst threshold are constants (see decision 13's ceiling).

## Verification

`./scripts/run.mjs check-diff` after each step.

Manual: with no notifications tab open, run `notify hello` from a shell tab and confirm a toast appears in the window's upper-right corner beneath any connection indicator, no sidebar opens, the layout does not reflow, and it holds about four seconds before fading over about two. Repeat and hover it — confirm it holds while hovered and resumes after. Repeat and click it — confirm the feed docks right already holding that line and the toast disappears at once. Close the feed, run `notify one`, `notify two`, `notify three` in quick succession, and confirm the feed docks open on the third holding all three with no toasts left. Open the feed in the centre strip, switch to another tab, and confirm a `notify` toasts rather than landing silently. Confirm `.janissary/notifications.json` holds one JSON line per notification with an ISO time and event type. Run `notifications clear` and confirm feed and file are both empty. Reconnect a detached remote harness with queued auto-approvals and confirm they land in the feed with their original times and never toast.
