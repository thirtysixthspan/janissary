<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Show notifications when a docked feed is hidden behind another sidebar tab.

Existing Issue: `notificationsFeedVisible` treats every docked feed as visible, but `Sidebar` renders only the locally selected docked view, so selecting a file navigator over the feed suppresses the toast while the new line is off screen. Severity: 7/10

Existing Risk: 7/10 - A normal sidebar selection silently hides incoming notifications, including explicit plugin failures and permission reports, and burst escalation clears the corner without selecting the feed.

Proposal Risk: 3/10 - Coordinating client-specific sidebar selection with server delivery may briefly duplicate a line during a selection change, but the queue still retains it.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1169: deliver notifications when the docked feed is hidden". Rework the visibility decision across `src/notifications/tab.ts`, `src/notifications/deliver.ts`, `web/src/Sidebar.tsx`, `web/src/useSidebarSelection.ts`, and the toast bridge so each client suppresses a toast only when its notifications body is actually the selected view; keep the server authoritative for the queue and burst threshold. Make burst escalation and `revealNotifications` select an already docked feed in its sidebar, using an explicit client selection signal if needed, while preserving the active center tab. Add a client test that selects files over a docked feed and still shows a toast, plus an integration case that escalation selects the feed and clears those toasts; update the visibility claim in `product/specs/notifications.md` and the PR description to match the resulting behavior.


* Keep the live notifications feed within the plan's 200-line limit.

Existing Issue: The queue drops its oldest entry after 200 notifications, but an open feed continues through `TabManager.append` under `transcriptMaxLines`, so the tab log can retain many more than 200 and diverge from the queue. Severity: 5/10

Existing Risk: 5/10 - A long-running session shows different histories before and after the feed is reopened and lets the supposedly bounded feed grow toward the much larger transcript cap.

Proposal Risk: 2/10 - Trimming the feed could disturb unread or transcript events if the notification-specific cap bypasses their existing update path.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1169: cap the live notifications feed at 200 lines". Align the live append path in `src/notifications/deliver.ts` and `src/notifications/tab.ts` with `NotificationQueue.logEntries` or apply `NOTIFICATION_QUEUE_LIMIT` through the tab's transcript mutation path, preserving its state broadcast and appended-entry behavior while dropping the same oldest line from both surfaces. Add a case in `src/notifications/tab.test.ts` or `src/notifications/index.test.ts` that opens the feed before more than 200 notifications arrive, checks its `log` and `bufferLines` against the queue, and confirms reopening does not change the retained set; the existing queue cap test covers the closed-feed half.


* Place toasts below floating status panels as the plan promises.

Existing Issue: `.toast-stack` starts at a fixed 40px from the viewport top with a higher stacking level than `.status-panels`, whose connection and schedule rows can extend below that point, so a toast covers those panels. Severity: 5/10

Existing Risk: 5/10 - Active connection controls or schedule details can be obscured by a toast at the moment the user needs them, contradicting the promised corner layout.

Proposal Risk: 2/10 - A measured offset or shared layout slot can shift the toast when panels change height, but may leave extra corner space during transitions.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1169: position toasts below status panels". Coordinate `web/src/toasts/ToastStack.tsx`, `web/src/AppShell.tsx`, the active `StatusPanels` rendering path under `web/src/shared/status-windows/`, and `web/src/theme.css` so the stack's top edge follows the actual bottom of visible connection and schedule panels as well as the connection indicator, instead of assuming a 40px height. Cover a panel with several rows and both panels visible in a layout test or browser check, while retaining the existing fixed upper-right placement and toast timing tests.


* Remove pending toasts when the user opens the notifications feed manually.

Existing Issue: The `notifications` command can make the feed visible while earlier toasts remain on screen, because only burst escalation, toast-click reveal, and clear emit the toast-clear event. Severity: 5/10

Existing Risk: 5/10 - The same notification appears in the feed and corner at once, and a hovered or focused toast can remain there indefinitely after the user has opened the feed.

Proposal Risk: 2/10 - Clearing on a tab merely docked but still hidden behind another sidebar view would remove the user's only visible cue unless actual client visibility is used.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1169: clear toasts when the feed becomes visible". Once sidebar selection is reflected in visibility, make the toast owner in `web/src/toasts/useToasts.ts` or the corresponding server reveal path clear outstanding toasts on every real transition to a visible notifications feed, including the bare and docked `notifications` command and sidebar selection. Preserve toasts when a center feed remains hidden or a docked feed is not selected. Add cases around `web/src/toasts/ToastStack.test.tsx` and the notifications command integration tests for manual open, hidden placement, and hover-held toasts, keeping burst and click reveal behavior intact.
