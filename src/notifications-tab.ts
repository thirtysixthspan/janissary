import type { LogEntry, Tab } from './types.js';
import type { Managers } from './managers.js';

// The notifications tab is a singleton, view-only feed (`view: 'notifications'`) that receives
// notification-worthy background events as ordinary transcript entries. It mirrors the file tree
// tab's open-or-reuse, dockable shape (see `file-tree-manager.ts`), but its body is a plain
// transcript and it accepts no typed input. It is created only by the `notifications` command,
// never by the event path, and events fired while it is closed are dropped (never buffered).

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

// Append a line to the notifications feed — but only if the tab is already open. When it is closed
// this is a no-op: the event is dropped, not buffered, and the tab is never created. When open it
// reuses the standard `append` funnel (unread badge, `entry:appended`, `bufferLines` sync).
export function appendNotification(managers: Managers, entry: LogEntry): void {
  if (!notificationsTab(managers)) return;
  managers.tab.append(NOTIFICATIONS_LABEL, entry);
}
