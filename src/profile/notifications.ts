import { loadProfileNotifications } from '../profiles.js';
import { openNotificationsTab } from '../notifications-tab.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

// Open (or dock) the singleton notifications tab for each profile-level notifications entry (from
// the profile's `_notifications.json`) once every entry is open, mirroring `openProfileFiles`. The
// notifications tab is a singleton, so multiple entries just re-dock the same feed. `focus` (only
// meaningful alongside `dock`) tells the client's sidebar to show the notifications tab rather than
// whichever other docked tab (files/schedules) it would otherwise default to.
export function openProfileNotifications(profileName: string, managers: Managers, notes: string[]): void {
  for (const entry of loadProfileNotifications(profileName)) {
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
