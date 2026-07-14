# Show notifications newest-first with a timestamp on each

**Complexity: 3/10** — a new `Transcript` prop to disable stick-to-bottom pinning, a
client-side render-order reversal in `NotificationsTab`, and a timestamp prefix added
server-side in `notify()`.

## Goal

The notifications feed currently appends chronologically like any other transcript
(oldest at the top, newest at the bottom, auto-scrolled to the bottom). It should instead
show the newest notification at the top, and every notification line should carry a
timestamp.

## Background (verified)

- `src/notifications.ts:54-61` (`notify`) builds the entry and appends it via the shared
  `managers.tab.append` funnel (`src/notifications-tab.ts:34-37`, `appendNotification`) —
  the same chronological, oldest-first append path every tab type uses. There is no
  timestamp field on `LogEntry`/`BufferLine` (`src/types.ts`) today.
- `web/src/NotificationsTab.tsx:20-46` renders `lines` (in the server's chronological
  order) through the shared `<Transcript>` component, unmodified.
- `web/src/Transcript.tsx:20-53` auto-scrolls to the bottom whenever `lines` changes
  (`pin()`, gated by `stick.current`, itself updated by `onScroll` tracking proximity to
  the bottom) — this "stick to bottom" behavior is correct for agent tabs (where new
  output is appended at the end) but wrong for a newest-first feed: reversing the
  rendered order without disabling this would keep auto-scrolling past the newest entry
  down to the oldest one.
- `Transcript` is used only by `App.tsx` (agent tabs, centered) and `NotificationsTab.tsx`
  — so a new opt-out prop only needs a `false` default change in the one call site that
  needs different behavior, exactly like the existing `showEmptyHint` prop added for the
  same component.
- `src/controller.test.ts`'s `feedText` helper reads the **server's** `bufferLines` order
  directly (`c.view().find(...).bufferLines.map((l) => l.text).join('\n')`) — since the
  reversal in this plan happens **only** in the React render (`NotificationsTab`), the
  server-side chronological order (and this test) is unaffected.
- The existing test `src/controller.test.ts` (`'records an incoming message...'`) asserts
  `feedText(c)).toContain('Message from janus in bob')` using `.toContain`, not an exact
  match — prefixing a timestamp to the notification text keeps that substring intact, so
  this test keeps passing unmodified.

## Approach

1. **Newest-first display**: reverse the rendered line order client-side in
   `NotificationsTab` only (`[...lines].reverse()`), and add a `pinToBottom?: boolean`
   prop to `Transcript` (default `true`, matching existing agent-tab behavior) that
   `NotificationsTab` sets to `false`. With `pinToBottom={false}`, `Transcript` never
   moves `scrollTop`, so the reversed list's first (newest) entry stays naturally visible
   at the top (`scrollTop` starts at `0`) without fighting any auto-scroll.
2. **Timestamps**: format a `HH:MM:SS` timestamp in `notify()` and prefix it to the
   notification text server-side — no new `LogEntry`/`BufferLine` field, no frontend
   rendering change, and no effect on cross-agent `msg`/`broadcast` message rendering
   (which doesn't go through `notify()`).

## Implementation

1. **`web/src/Transcript.tsx`**
   - Add `pinToBottom?: boolean;` to `Properties`, defaulting to `true` in the function
     signature.
   - Guard the `pin` callback: `if (!pinToBottom) return;` as its first line (before the
     existing body), so lines-changed/resize-observer triggers are no-ops when disabled.

2. **`web/src/NotificationsTab.tsx`**
   - Pass `lines={lines.toReversed()}` and `pinToBottom={false}` to `<Transcript>`
     (`toReversed()`, not `reverse()`, per the `unicorn/no-array-reverse` lint rule).

3. **`src/notifications.ts`**
   - Add a small `formatTimestamp(date: Date): string` helper (`HH:MM:SS`, zero-padded,
     local time).
   - In `notify()`, prefix the built text: `` `${formatTimestamp(new Date())} ${notificationText(event, tabLabel, message)}` ``.

## Tests

- `src/commands/notify.test.ts` — two existing tests assert exact array membership
  (`expect(feed(managers)).toContain('janus: deploy finished')`) via `.toContain` on an
  **array** (exact-element match, unlike `controller.test.ts`'s substring-on-joined-text
  usage) — the timestamp prefix breaks exact equality. Updated both to
  `line.endsWith(...)` checks instead.
- `src/notifications.test.ts` — add a test for `formatTimestamp` (exported for testing)
  asserting zero-padded `HH:MM:SS` output for a known `Date`.
- `src/controller.test.ts` (`'Controller notifications feed'` block) — add a test
  asserting a recorded notification's text matches a `HH:MM:SS` timestamp prefix (e.g.
  via a regex `/^\d{2}:\d{2}:\d{2} /`) followed by the existing message content.
- `web/src/NotificationsTab.test.tsx` — add a test rendering `NotificationsTab` with two
  lines and asserting they appear in reverse (newest-first) order in the DOM (e.g. compare
  `container.querySelectorAll('.line')` text order against the reversed input order).

## Verification

Manual: run the web app, open the notifications tab, trigger two or more background
events in sequence, and confirm the most recent one appears at the top of the feed with a
timestamp, without needing to scroll. Not runnable in this environment — note as
unverified manually.

## Out of scope

- Any other notifications-tab issues in `work/issues.md` (shared sidebar tabbed
  interface with the file navigator).
- Search/highlight behavior within the notifications tab — `NotificationsTab` doesn't
  pass a `highlight` prop today, so the existing highlight-scroll effect in `Transcript`
  is unaffected; wiring search into a reversed-order feed is a separate concern.
- Relative/human-friendly time formatting (e.g. "2m ago") — a fixed `HH:MM:SS` clock time
  is simplest and matches the issue's literal ask ("a timestamp provided for each").
