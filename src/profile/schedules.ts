import { loadProfileSchedules } from '../profiles.js';
import { openSchedulesTab } from '../schedules-tab.js';
import type { Managers } from '../managers.js';

// Open (or dock) the singleton schedules tab for each profile-level schedules entry (from the
// profile's `_schedules.json`) once every entry is open, mirroring `openProfileNotifications`. The
// schedules tab is a singleton, so multiple entries just re-dock the same list.
export function openProfileSchedules(profileName: string, managers: Managers, notes: string[]): void {
  for (const entry of loadProfileSchedules(profileName)) {
    openSchedulesTab(managers, entry.dock);
    notes.push(`Opened schedules${entry.dock ? ` (docked ${entry.dock})` : ''}.`);
  }
}
