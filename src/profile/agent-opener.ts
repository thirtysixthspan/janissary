import { distinctColor, renumberTabs } from '../tab/index.js';
import { startProfileMonitors } from './monitors.js';
import { openProfileFiles } from './files.js';
import { openProfileEditors } from './editors.js';
import { openProfileViewTabs } from './view-tabs.js';
import { focusedMainAreaLabel, type MainAreaCandidate } from './focus.js';
import { openProfileNotifications } from './notifications.js';
import { openProfileSchedules } from './schedules.js';
import { applyProfileLayout } from './layout.js';
import { openAgentEntry, openHarnessEntry } from './entry-openers.js';
import type { Managers } from '../managers.js';
import type { LoadedProfile } from './types.js';
import { isHarnessEntry, labelOf, closeMatchingTabs } from './entry-resolve.js';

// Reorders only the tabs belonging to `group` so they read in ascending `numbers`-map order —
// a tab with no authored number (or no entry in the map at all) sorts last, keeping its current
// relative position among the other unnumbered tabs (stable sort). Tabs in every other group are
// left untouched, both in value and in position.
function reorderGroupByNumber(managers: Managers, group: number, numbers: Map<string, number>): void {
  const tabs = managers.tab.tabs;
  const indices: number[] = [];
  for (const [i, t] of tabs.entries()) if (t.group === group) indices.push(i);
  if (indices.length < 2) return;
  const sorted = indices.map((i) => tabs[i])
    .toSorted((a, b) => (numbers.get(a.label) ?? Infinity) - (numbers.get(b.label) ?? Infinity));
  const next = [...tabs];
  for (const [position, index] of indices.entries()) next[index] = sorted[position];
  managers.tab.tabs = renumberTabs(next);
}

export function openProfileEntries(
  loaded: LoadedProfile,
  managers: Managers,
  name: string,
  issuingLabel: string,
  out: (text: string) => void,
): void {
  const entries = loaded.entries;
  const defaultGroup = Math.max(0, ...managers.tab.tabs.map((t) => t.group)) + 1;
  const colorForGroup = (group: number, fallbackDotColor: string): string =>
    managers.tab.tabs.find((t) => t.group === group)?.groupColor ?? fallbackDotColor;

  const skipped: string[] = [];
  const notes: string[] = [];
  const toOpen = closeMatchingTabs(entries, managers, issuingLabel, skipped, notes);

  const used = new Set(managers.tab.tabs.map((t) => t.dotColor));
  const opened: string[] = [];
  const candidates: MainAreaCandidate[] = [];
  const firstNew = managers.tab.tabs.length;
  const issuingCwd = managers.tab.cwdOf(issuingLabel) ?? process.cwd();

  for (const entry of toOpen) {
    const label = labelOf(entry);
    const dotColor = distinctColor(used, entry.dotColor);
    used.add(dotColor);
    const group = typeof entry.group === 'number' ? entry.group : defaultGroup;
    const groupColor = colorForGroup(group, dotColor);
    if (isHarnessEntry(entry)) {
      const error = openHarnessEntry(entry, managers, group, groupColor, issuingCwd, notes);
      if (error) { skipped.push(`${label} (${error})`); continue; }
    } else {
      openAgentEntry(entry, managers, group, groupColor, dotColor);
    }
    opened.push(label);
    candidates.push({ label, number: entry.number, focus: entry.focus, pane: entry.pane });
  }

  // Profile-level file navigator(s) open next, rooted at the first newly opened tab by default, so
  // their tabs are part of the list by the time monitor targets are resolved below.
  const firstNewLabel = opened.length > 0 ? managers.tab.tabs[firstNew]?.label : undefined;
  // A launch that opened no tab of its own — every entry skipped, or a profile whose only entry
  // matches the issuing tab — still has the issuing tab to root against, the same tab a harness
  // entry takes its default cwd from and the one the view tabs already use. Without it, navigators
  // and editors carrying an absolute `$root` path, which need no resolving tab at all, would be
  // dropped alongside the relative ones.
  const rootLabel = firstNewLabel ?? issuingLabel;
  candidates.push(
    ...openProfileFiles(loaded.files, managers, rootLabel, notes, defaultGroup, colorForGroup),
    ...openProfileEditors(loaded.editors, managers, rootLabel, notes, defaultGroup, colorForGroup),
    ...openProfileViewTabs(loaded.views, managers, issuingLabel, defaultGroup, colorForGroup, notes),
  );
  // Reorder each group touched by this launch so harness/agent entries and editor tabs sharing a
  // group read in ascending `number` order, instead of editors always trailing every entry (see
  // profiles.md). Entries/editors may land in different groups (their own authored `group`), so
  // the pass runs once per distinct group actually used, not once for a single shared group.
  const numbers = new Map(candidates.filter((c) => c.number !== undefined).map((c) => [c.label, c.number as number]));
  const usedGroups = new Set(
    candidates
      .map((c) => managers.tab.tabs[managers.tab.findIndex(c.label)]?.group)
      .filter((g): g is number => g !== undefined),
  );
  for (const g of usedGroups) reorderGroupByNumber(managers, g, numbers);
  managers.tab.placeProfileTabs(candidates);
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
  out(parts.length > 0 ? parts.join(' ') : `Profile "${name}" has no tabs to open.`);
}
