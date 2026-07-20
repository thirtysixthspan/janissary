import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type {
  ProfileFilesEntry, ProfileLayout, ProfileMonitor, ProfileNotificationsEntry, ProfileSchedulesEntry,
} from '../types.js';
import { getClientLayout } from '../client-layout.js';
import { getWindowBoundsReader } from '../window-resizer.js';
import type { Managers } from '../managers.js';

// Reserved-file writers for `profile save`: each emits the exact JSON its loader in
// `profile-reserved-files.ts` parses, so a saved profile round-trips through `profile launch`.
// Every array-shaped file is written only when it has at least one entry, mirroring the loaders'
// "absent file = no entries" treatment.

function writeReserved(dir: string, fileName: string, entries: unknown[]): void {
  if (entries.length === 0) return;
  writeFileSync(path.join(dir, fileName), JSON.stringify(entries, null, 2));
}

export function writeMonitors(dir: string, managers: Managers): void {
  const monitors: ProfileMonitor[] = managers.monitor.snapshot().map((m) => ({
    persona: m.persona,
    targets: m.inline ? [] : m.targets.map((t) => (t.kind === 'tab' ? t.label : `group:${t.group}`)),
  }));
  writeReserved(dir, '_monitors.json', monitors);
}

export function writeFiles(dir: string, entries: ProfileFilesEntry[]): void {
  writeReserved(dir, '_files.json', entries);
}

export function writeNotifications(dir: string, entries: ProfileNotificationsEntry[]): void {
  writeReserved(dir, '_notifications.json', entries);
}

export function writeSchedules(dir: string, entries: ProfileSchedulesEntry[]): void {
  writeReserved(dir, '_schedules.json', entries);
}

// The layout writer always writes `_layout.json`: sidebar/tab-area sizes from the server-retained
// client report (empty until a `reportLayout` RPC has landed), plus the window size read over CDP
// when a bounds reader is registered. Under `--no-open` no reader exists, so `window` is omitted
// and a skip note is added for the launch report.
export async function writeLayout(dir: string, notes: string[]): Promise<void> {
  const clientLayout = getClientLayout();
  const layout: ProfileLayout = clientLayout ? { ...clientLayout } : {};
  const reader = getWindowBoundsReader();
  if (reader) {
    layout.window = await reader();
  } else {
    notes.push('Window size not captured (no window open).');
  }
  writeFileSync(path.join(dir, '_layout.json'), JSON.stringify({ layout }, null, 2));
}
