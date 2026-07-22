import { distinctColor } from '../tab/index.js';
import { startProfileMonitors } from './monitors.js';
import { openProfileFiles } from './files.js';
import { openProfileEditors } from './editors.js';
import { focusedMainAreaLabel, type MainAreaCandidate } from './focus.js';
import { openProfileNotifications } from './notifications.js';
import { openProfileSchedules } from './schedules.js';
import { applyProfileLayout } from './layout.js';
import { openAgentEntry, openHarnessEntry } from './entry-openers.js';
import type { Managers } from '../managers.js';
import type { LoadedProfile } from '../types.js';
import { isHarnessEntry, labelOf, closeMatchingTabs } from './entry-resolve.js';

export function openProfileEntries(
  loaded: LoadedProfile,
  managers: Managers,
  name: string,
  issuingLabel: string,
  out: (text: string) => void,
): void {
  const entries = loaded.entries;
  const authoredGroup = entries
    .map((e) => e.group)
    .find((g): g is number => typeof g === 'number');
  const group = authoredGroup ?? Math.max(0, ...managers.tab.tabs.map((t) => t.group)) + 1;

  const skipped: string[] = [];
  const notes: string[] = [];
  const toOpen = closeMatchingTabs(entries, managers, issuingLabel, skipped, notes);

  const used = new Set(managers.tab.tabs.map((t) => t.dotColor));
  const opened: string[] = [];
  const candidates: MainAreaCandidate[] = [];
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
    candidates.push({ label, number: entry.number, focus: entry.focus });
  }

  // Profile-level file navigator(s) open next, rooted at the first newly opened tab by default, so
  // their tabs are part of the list by the time monitor targets are resolved below.
  const firstNewLabel = opened.length > 0 ? managers.tab.tabs[firstNew]?.label : undefined;
  openProfileFiles(loaded.files, managers, firstNewLabel, notes);
  candidates.push(...openProfileEditors(loaded.editors, managers, firstNewLabel, notes));
  const focusLabel = focusedMainAreaLabel(candidates, firstNewLabel);
  if (focusLabel !== undefined) managers.tab.setActiveTab(managers.tab.findIndex(focusLabel));
  // Profile-level notifications tab opens next, docked per the profile's `notifications` key.
  openProfileNotifications(loaded.notifications, managers, notes);
  // Profile-level schedules tab opens next, docked per the profile's `schedules` key.
  openProfileSchedules(loaded.schedules, managers, notes);
  // Profile-level layout (window/sidebar/tab-area sizing) applies per the profile's `layout` key.
  applyProfileLayout(loaded.layout, managers, notes);
  // Profile-level monitors start after every entry is open, owned by the issuing tab, so their
  // targets (e.g. `group:1`) can resolve against the now-complete tab list.
  startProfileMonitors(loaded.monitors, managers, issuingLabel, notes);
  const parts: string[] = [];
  if (opened.length > 0) parts.push(`Launched profile "${name}": ${opened.join(', ')}.`);
  if (notes.length > 0) parts.push(notes.join(' '));
  if (skipped.length > 0) parts.push(`Skipped: ${skipped.join('; ')}.`);
  out(parts.length > 0 ? parts.join(' ') : `Profile "${name}" has no agents to open.`);
}
