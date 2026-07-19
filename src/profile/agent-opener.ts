import { distinctColor } from '../tab/index.js';
import { startProfileMonitors } from './monitors.js';
import { openProfileFiles } from './files.js';
import { openProfileNotifications } from './notifications.js';
import { openProfileSchedules } from './schedules.js';
import { openAgentEntry, openHarnessEntry } from './entry-openers.js';
import type { Managers } from '../managers.js';
import type { ProfileEntry, ProfileHarnessEntry } from '../types.js';

function isHarnessEntry(e: ProfileEntry): e is ProfileHarnessEntry {
  return 'harness' in e;
}

function labelOf(e: ProfileEntry): string {
  return isHarnessEntry(e) ? e.label : e.name;
}

// Relaunch semantics: close every open tab matching an entry's label first, then the caller opens
// all entries fresh, so label collisions between a closing tab and an opening one cannot arise.
// The issuing tab is never closed; if it's named by an entry, that entry is skipped instead.
function closeMatchingTabs(
  entries: ProfileEntry[], managers: Managers, issuingLabel: string, skipped: string[], notes: string[],
): ProfileEntry[] {
  const toOpen: ProfileEntry[] = [];
  for (const entry of entries) {
    const label = labelOf(entry);
    if (label.toLowerCase() === issuingLabel.toLowerCase()) {
      skipped.push(`${label} (cannot relaunch the issuing tab)`);
      continue;
    }
    const index = managers.tab.findIndex(label);
    if (index !== -1) {
      managers.tab.closeTab(index);
      notes.push(`Relaunched "${label}".`);
    }
    toOpen.push(entry);
  }
  return toOpen;
}

export function openProfileEntries(
  entries: ProfileEntry[],
  managers: Managers,
  name: string,
  issuingLabel: string,
  out: (text: string) => void,
): void {
  const authoredGroup = entries
    .map((e) => e.group)
    .find((g): g is number => typeof g === 'number');
  const group = authoredGroup ?? Math.max(0, ...managers.tab.tabs.map((t) => t.group)) + 1;

  const skipped: string[] = [];
  const notes: string[] = [];
  const toOpen = closeMatchingTabs(entries, managers, issuingLabel, skipped, notes);

  const used = new Set(managers.tab.tabs.map((t) => t.dotColor));
  const opened: string[] = [];
  let groupColor: string | undefined;
  const firstNew = managers.tab.tabs.length;
  const issuingCwd = managers.tab.cwdOf(issuingLabel) ?? process.cwd();

  for (const entry of toOpen) {
    const label = labelOf(entry);
    const dotColor = distinctColor(used, entry.dotColor);
    used.add(dotColor);
    groupColor ??= dotColor;
    if (isHarnessEntry(entry)) {
      const error = openHarnessEntry(entry, managers, group, groupColor, issuingCwd, notes);
      if (error) { skipped.push(`${label} (${error})`); continue; }
    } else {
      openAgentEntry(entry, managers, group, groupColor, dotColor);
    }
    opened.push(label);
  }

  if (opened.length > 0) managers.tab.setActiveTab(firstNew);
  // Profile-level file navigator(s) open next, rooted at the first newly opened tab by default, so
  // their tabs are part of the list by the time monitor targets are resolved below.
  const firstNewLabel = opened.length > 0 ? managers.tab.tabs[firstNew]?.label : undefined;
  openProfileFiles(name, managers, firstNewLabel, notes);
  // Profile-level notifications tab opens next, docked per the profile's `_notifications.json`.
  openProfileNotifications(name, managers, notes);
  // Profile-level schedules tab opens next, docked per the profile's `_schedules.json`.
  openProfileSchedules(name, managers, notes);
  // Profile-level monitors start after every entry is open, owned by the issuing tab, so their
  // targets (e.g. `group:1`) can resolve against the now-complete tab list.
  startProfileMonitors(name, managers, issuingLabel, notes);
  const parts: string[] = [];
  if (opened.length > 0) parts.push(`Launched profile "${name}": ${opened.join(', ')}.`);
  if (notes.length > 0) parts.push(notes.join(' '));
  if (skipped.length > 0) parts.push(`Skipped: ${skipped.join('; ')}.`);
  out(parts.length > 0 ? parts.join(' ') : `Profile "${name}" has no agents to open.`);
}
