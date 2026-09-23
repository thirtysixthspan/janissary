import type { LogEntry, Tab } from '../tab/types.js';
import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';

// The notifications tab is a singleton, view-only feed (`view: 'notifications'`) that renders the
// notification queue (see `queue.ts`) as ordinary transcript entries. It mirrors the file navigator
// tab's open-or-reuse, dockable shape (see `file-navigator/manager.ts`), but its body is a plain
// transcript and it accepts no typed input. The `notifications` command opens it wherever the user
// asks; a burst of events docks it into the right sidebar when nothing on screen is showing them
// (`revealNotificationsTab`). A feed opened after the fact is seeded from the queue, so it holds
// what came before rather than starting empty.

export const NOTIFICATIONS_LABEL = 'notifications';

// The open notifications tab, or undefined when none is open.
export function notificationsTab(managers: Managers): Tab | undefined {
  return managers.tab.tabs.find((t) => t.view === 'notifications');
}

// Whether the server can know the feed is on screen. The centre-strip selection is shared server
// state; a docked feed's selected body is client-local, so only each client can suppress its toast.
export function notificationsFeedVisible(managers: Managers): boolean {
  const tab = notificationsTab(managers);
  if (!tab) return false;
  if (tab.dock) return false;
  return managers.tab.cur().label === NOTIFICATIONS_LABEL;
}

// Fill a freshly created feed with what the queue already holds. A direct assignment, the way
// `rehydrateTabViews` seeds a rehydrated tab's log, rather than one `append` per entry: an append
// re-emits `entry:appended`, which would re-run agent-state persistence and the transcript logger
// for lines that were recorded when they happened.
function seedFromQueue(managers: Managers, tab: Tab): void {
  tab.log = managers.notifications.logEntries;
  messageBus.emit('state', { type: 'dirty' });
}

// Open the notifications tab or reuse the existing one, optionally docking it into a sidebar.
// Called by the `notifications` command and by the escalation path. With no `dock`, an existing
// docked tab is undocked back to the center strip and made active (bare `notifications` always
// makes the feed visible).
export function openNotificationsTab(managers: Managers, dock?: 'left' | 'right'): Tab {
  const existing = notificationsTab(managers);
  if (existing) {
    managers.tab.setDock(managers.tab.findIndex(existing.label), dock ?? null);
    return existing;
  }
  managers.tab.openNotificationsTab();
  const opened = notificationsTab(managers)!;
  seedFromQueue(managers, opened);
  if (dock) managers.tab.setDock(managers.tab.findIndex(NOTIFICATIONS_LABEL), dock);
  return opened;
}

// Dock a tab into the right sidebar without moving the user: creating a tab focuses it, and docking
// a focused tab moves focus to whatever sits nearest, so the active tab is recorded first and
// restored afterwards.
function withActiveTabRestored(managers: Managers, dock: () => Tab): Tab {
  const wasActive = managers.tab.cur().label;
  const tab = dock();
  const restore = managers.tab.findIndex(wasActive);
  if (restore !== -1) managers.tab.setActiveTab(restore);
  return tab;
}

// The feed an event can land in: the open one, or a new one docked into the right sidebar. The
// sidebar rather than the center strip because a notification is not a request to change what the
// user is looking at.
export function revealNotificationsTab(managers: Managers): Tab {
  const existing = notificationsTab(managers);
  if (existing) return existing;
  return withActiveTabRestored(managers, () => openNotificationsTab(managers, 'right'));
}

// Make the feed visible, whatever state it is in. A feed that does not exist is opened docked
// right; one already docked is left alone; one hidden in the centre strip is docked right rather
// than made active, so the user is not moved out of the tab they were working in.
export function showNotificationsFeed(managers: Managers): Tab {
  const existing = notificationsTab(managers);
  if (!existing) return revealNotificationsTab(managers);
  if (existing.dock) return existing;
  return withActiveTabRestored(managers, () => {
    managers.tab.setDock(managers.tab.findIndex(existing.label), 'right');
    return existing;
  });
}

// Mirror a live notification into the feed — but only if the tab is already open. When it is closed
// this is a no-op, and nothing is lost: the queue holds the notification either way, and a feed
// opened later is seeded from it. When open it reuses the standard `append` funnel (unread badge,
// `entry:appended`, `bufferLines` sync).
export function appendNotification(managers: Managers, entry: LogEntry): void {
  if (!notificationsTab(managers)) return;
  managers.tab.append(NOTIFICATIONS_LABEL, entry);
}

// Clearing notifications changes the feed's existing transcript without replaying appends or
// disturbing the user's tab selection. The state signal refreshes the client's bufferLines.
export function clearNotificationsFeed(managers: Managers): void {
  const tab = notificationsTab(managers);
  if (!tab) return;
  tab.log = [];
  messageBus.emit('state', { type: 'dirty' });
}
