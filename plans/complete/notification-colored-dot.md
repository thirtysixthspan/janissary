# Render notifications with a colored dot derived from the sending tab

**Complexity: 3/10** — reuses the existing cross-agent message dot/color mechanism;
touches one server function and its tests.

## Goal

Each notification line currently renders as plain text (e.g. `Agent 'build' finished`)
with no visual indicator of which tab it came from. It should show a colored dot, the
color matching the sending tab's own tab-strip dot color — mirroring how cross-agent
`msg`/`broadcast` deliveries already render (`● sender: text`, colored via `fromColor`).

## Background (verified)

- `src/notifications.ts:54-59` (`notify`) builds the notification entry with no `from`/
  `fromColor` set:
  ```ts
  appendNotification(managers, { input: '', output: notificationText(event, tabLabel, message) });
  ```
- `src/tab-formatting-handlers.ts:46-52` (`handleMessageEntry`) only renders the colored
  dot treatment when `entry.from` is set: `if (!entry.from) return false;` — otherwise
  the entry falls through to a plain `output` line.
- `src/buffer.ts:23-40` (`formatMessageContent`) builds the `message`-kind `BufferLine`:
  `{ type: 'message', text: expandTabs(parts[0] ?? ''), from: entry.from, fromColor: entry.fromColor, msgKind: kind }`.
  Since `parts[0]` is the entry's full `output` text (single line, no `\n`), `text`
  is unchanged from today — only `from`/`fromColor` are new, so existing exact-text
  assertions (e.g. `src/controller.test.ts:1461`, `expect(feedText(c)).toContain('Message from janus in bob')`) keep passing.
- `web/src/transcript-line.tsx:164-167` already renders `type: 'message'` lines as
  `● {line.from}...` colored via `style={{ color: line.fromColor }}` — no frontend change
  needed.
- Every `Tab` already carries a `dotColor` (`src/types.ts:142`), assigned via
  `distinctColor` at tab creation (`src/tab-creators.ts`). `managers.tab.tabs` is a public
  array (`src/tab-manager.ts:19`) searchable by label.
- Every `notify(...)` call site passes the **background tab whose activity produced the
  event** as `tabLabel` (`src/acp-manager.ts:110,116,121` for state-change/agent-start;
  `src/schedule-manager.ts:95,99` for schedule-fire; `src/controller.ts:63` for
  incoming-message; `src/commands/notify.ts:20` for manual) — consistently "the sending
  tab" across all five event types, so a single lookup on `tabLabel` covers every case.

## Approach

In `notify()`, look up `tabLabel`'s `dotColor` from `managers.tab.tabs` and pass it as
`fromColor` along with `from: tabLabel` on the appended entry. No changes to
`notificationText`, `formatMessageContent`, or the frontend are needed — the existing
message-line machinery already renders the colored dot once `from`/`fromColor` are set.

## Implementation

1. **`src/notifications.ts`** — in `notify()`, add a `dotColor` lookup and pass
   `from`/`fromColor` on the entry:
   ```ts
   export function notify(managers: Managers, event: NotificationEventType, tabLabel: string, message?: string): void {
     if (!notificationsTab(managers)) return;
     const activeLabel = managers.tab.cur().label;
     if (!shouldNotify(getConfig().notifications, event, tabLabel, activeLabel)) return;
     const fromColor = managers.tab.tabs.find((t) => t.label === tabLabel)?.dotColor;
     appendNotification(managers, {
       input: '', output: notificationText(event, tabLabel, message), from: tabLabel, fromColor,
     });
   }
   ```

## Tests

Add to `src/notifications.test.ts` (new `describe` block, or extend an existing
integration-style test in `src/controller.test.ts`'s `'Controller notifications feed'`
block, mirroring `feedText`):
- A test asserting that a recorded notification's `BufferLine` has `type: 'message'`,
  `from` equal to the source tab's label, and `fromColor` equal to that tab's `dotColor`.

Mirror the existing `'records an incoming message...'` test's setup (`makeController`,
`withConfig`, `openNotificationsTab`) in `src/controller.test.ts`, since `notify()` needs
a real `Managers`/`Tab` (with a real `dotColor`) rather than a unit-level fake.

## Verification

Manual: run the web app, open the notifications tab, trigger a background event (e.g. an
agent tab finishing while unfocused), and confirm the notification line shows a colored
dot matching that tab's own tab-strip dot color. Not runnable in this environment — note
as unverified manually.

## Out of scope

- Changing `notificationText`'s wording (the sending tab's name still appears in the
  message body too — no de-duplication of that text).
- Any other notifications-tab issues in `work/issues.md` (ordering/timestamps, sidebar
  scroll containment).
