import type { LogEntry, Tab } from './tab/types.js';
import type { Managers } from './managers.js';

// The notifications tab is a singleton, view-only feed (`view: 'notifications'`) that receives
// notification-worthy background events as ordinary transcript entries. It mirrors the file navigator
// tab's open-or-reuse, dockable shape (see `file-navigator/manager.ts`), but its body is a plain
// transcript and it accepts no typed input. The `notifications` command opens it wherever the user
// asks; the event path opens it into the right sidebar when an event has nowhere to land
// (`revealNotificationsTab`). Nothing is buffered either way — a feed is opened in time to receive
// what follows, never filled in with what came before.

export const NOTIFICATIONS_LABEL = 'notifications';

// The open notifications tab, or undefined when none is open.
export function notificationsTab(managers: Managers): Tab | undefined {
  return managers.tab.tabs.find((t) => t.view === 'notifications');
}

// Open the notifications tab or reuse the existing one, optionally docking it into a sidebar.
// Called only from the `notifications` command. With no `dock`, an existing docked tab is undocked
// back to the center strip and made active (bare `notifications` always makes the feed visible).
export function openNotificationsTab(managers: Managers, dock?: 'left' | 'right'): Tab {
  const existing = notificationsTab(managers);
  if (existing) {
    managers.tab.setDock(managers.tab.findIndex(existing.label), dock ?? null);
    return existing;
  }
  managers.tab.openNotificationsTab();
  if (dock) managers.tab.setDock(managers.tab.findIndex(NOTIFICATIONS_LABEL), dock);
  return notificationsTab(managers)!;
}

// The feed an event can land in: the open one, or a new one docked into the right sidebar. The
// sidebar rather than the center strip because a notification is not a request to change what the
// user is looking at — and since creating a tab focuses it, and docking a focused tab moves focus to
// whatever sits nearest, the active tab is recorded first and restored afterwards. An event that
// fires in the background must not move the user somewhere else.
export function revealNotificationsTab(managers: Managers): Tab {
  const existing = notificationsTab(managers);
  if (existing) return existing;
  const wasActive = managers.tab.cur().label;
  const tab = openNotificationsTab(managers, 'right');
  const restore = managers.tab.findIndex(wasActive);
  if (restore !== -1) managers.tab.setActiveTab(restore);
  return tab;
}

// Append a line to the notifications feed — but only if the tab is already open. When it is closed
// this is a no-op: the event is dropped, not buffered, and the tab is never created. When open it
// reuses the standard `append` funnel (unread badge, `entry:appended`, `bufferLines` sync).
export function appendNotification(managers: Managers, entry: LogEntry): void {
  if (!notificationsTab(managers)) return;
  managers.tab.append(NOTIFICATIONS_LABEL, entry);
}
