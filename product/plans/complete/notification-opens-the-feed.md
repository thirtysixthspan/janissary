# A notification opens the feed in the right sidebar

**Complexity: 5/10** — a small change to the notification path, but it overturns a rule (`drop-if-closed`) that the spec, the docs, and several tests state explicitly. No contract change, no client change.

## Goal

A notification is never lost for want of somewhere to put it. When an event fires and the notifications tab is closed, the feed opens **docked into the right sidebar** and the line lands in it. When the feed is already open — center or either sidebar — nothing moves and the line lands as it always has.

This replaces drop-if-closed, the rule that made every event fired before the user ran `notifications` disappear. It is the rule that made the previous backlog item's `No opener for ".xyz" files.` report reachable only by users who had already opened the feed.

## Approach

1. **Docked, not focused.** The feed opens into the right sidebar rather than the center strip because a notification is not a request to change what the user is looking at. A docked tab is never the active tab, so the line becomes visible without taking the screen. The right side is what the issue asks for and is the side the file navigator does not usually hold.

2. **The active tab is restored, not left where docking put it.** Creating a tab focuses it, and docking a focused tab moves focus to the nearest tab that is not docked — which is whatever happens to sit next to it, not the tab the user was in. Left alone, an event firing in the background would silently move the user somewhere else. The reveal therefore records the active tab's label before opening and restores it afterwards, so an auto-opened feed changes what is on screen and nothing about where the user is working.

3. **Eligibility is decided before the feed is touched.** `shouldNotify` already answers whether an event is recorded at all: an ambient event needs its config toggle and a background tab; every explicit event always passes. That check now runs *first*, so an event that would not have been recorded does not conjure a sidebar — the ambient toggles stay the volume control they already are, and the default configuration (every ambient toggle off) still opens nothing on its own. It also has to run first for a second reason: it reads the active tab's label, which opening a tab would change.

4. **`appendNotification` keeps its own guard.** It is the low-level append and stays a no-op with no feed open; `notify` is what guarantees there is one by the time it is called. Keeping the guard means nothing else that appends to the feed gains the power to create it as a side effect.

5. **The auto-approve capture link follows the rule it always stated.** A `-y` harness writes the screen capture behind an auto-approval "only when the notification is actually recorded", implemented as a check that the feed is open. Now that a recorded notification always has an open feed, that check is the wrong half of the rule: it would skip the capture for the one approval that opens the feed and write it for every one after. The check goes, so the link is on every auto-approve line rather than all but the first.

## Implementation steps

1. `src/notifications-tab.ts`: add `revealNotificationsTab(managers)` — returns the open feed if there is one, otherwise records the active tab's label, opens the feed docked `right`, restores that active tab, and returns it. Update the module comment, which states that the tab is created only by the `notifications` command and that events fired while it is closed are dropped.

2. `src/notifications.ts`: in `notify`, read the active label and consult `shouldNotify` before anything else, then call `revealNotificationsTab` ahead of composing and appending the line. Update the function comment, which describes returning immediately while the feed is closed.

3. `src/harness/auto-approve-wire.ts`: write the capture file for every successful auto-approval instead of only when the feed is already open, and drop the now-unused `notificationsTab` import.

## Tests

`src/notifications-tab.test.ts` (real `TabManager`, as the file already uses):

- With no feed open, `revealNotificationsTab` creates exactly one, docked `right`.
- It leaves the active tab where it was rather than following the tab it created.
- With a feed already open it returns that one, creates no second tab, and leaves its dock alone — including a feed docked `left` or sitting in the center strip.

`src/notifications.test.ts`:

- `notify` opens the feed and appends the line when none is open.
- An ambient event whose toggle is off, and one suppressed for being the active tab, open nothing and append nothing.

`src/controller.test.ts`:

- The existing drop-if-closed test becomes its opposite: a background `msg` with `incomingMessage` on records the line in a feed that was not open, and that feed is docked `right`.
- Dispatching from a tab other than the active one leaves the active tab unchanged after the feed opens.
- The unsupported-type report from the previous change now reaches a closed feed too, so `open <file>.xyz` opens the feed and records the line.

## Out of scope

- Which sidebar the feed opens into, as a setting. It is the right sidebar, matching the issue.
- Focusing, undocking, or scrolling the feed once it is open; the existing `notifications` command still owns all of that.
- Buffering events that fired before this change would have opened the feed — there is still no backlog, only a feed that now exists in time to receive what follows.
- The per-event config toggles and focus suppression, which decide *whether* an event is recorded and are unchanged.
