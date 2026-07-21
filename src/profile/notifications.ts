import { openNotificationsTab } from '../notifications-tab.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { ProfileNotificationsEntry } from '../types.js';

// Open (or dock) the singleton notifications tab for each profile-level notifications entry (from
// the profile's `notifications` key) once every entry is open, mirroring `openProfileFiles`. The
// notifications tab is a singleton, so multiple entries just re-dock the same feed. `focus` (only
// meaningful alongside `dock`) tells the client's sidebar to show the notifications tab rather than
// whichever other docked tab (files/schedules) it would otherwise default to.
export function openProfileNotifications(
  notifications: ProfileNotificationsEntry[], managers: Managers, notes: string[],
): void {
  for (const entry of notifications) {
    openNotificationsTab(managers, entry.dock);
    notes.push(`Opened notifications${entry.dock ? ` (docked ${entry.dock})` : ''}.`);
    if (entry.dock && entry.focus) {
      messageBus.emit('layout', {
        type: 'update',
        ...(entry.dock === 'left' ? { focusLeft: 'notifications' as const } : { focusRight: 'notifications' as const }),
      });
    }
  }
}
