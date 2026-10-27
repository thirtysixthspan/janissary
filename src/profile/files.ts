import { relocateToGroup } from './editors.js';
import type { Managers } from '../managers.js';
import type { ProfileFilesEntry } from './types.js';
import type { MainAreaCandidate } from './focus.js';

const FILES_KEYWORDS = new Set([
  'in', 'on', 'with', 'left', 'right', 'expand', 'collapse', 'cursor', 'anchor', 'select', 'print',
]);

function profilePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed && !/[\s'"]/u.test(trimmed) && !FILES_KEYWORDS.has(trimmed.toLowerCase())) return trimmed;
  return `"${trimmed.replaceAll('"', String.raw`\"`)}"`;
}

function profileLabel(value: string): string {
  if (!/[\s'"]/u.test(value)) return value;
  return `"${value.replaceAll('"', String.raw`\"`)}"`;
}

// Open each profile-level file-navigator tab once every entry is open, rooted at `defaultLabel`
// (the profile's first newly opened tab, or the issuing tab when the launch opened none of its own)
// unless the entry names its own `in` target. An entry's `path`, when set, is appended after the
// clauses so the tree roots at that literal path (e.g. `$root`), leaving the resolved label only as
// the tab the output note appends to.
//
// A docked tree has no place in the tab strip and produces no launch candidate; an undocked one
// carries the usual presentation keys and is relocated into its authored group, returning a
// candidate so the caller's reorder and placement passes cover it like an editor tab.
// The `files …` command this entry is equivalent to, built from its optional clauses. `path` stays
// last — it is the command's target, not a keyword clause.
function filesCommand(entry: ProfileFilesEntry): string {
  const clauses = [
    entry.in ? `in ${profileLabel(entry.in)}` : '',
    entry.dock ? `on ${entry.dock}` : '',
    entry.details ? `with ${entry.details}` : '',
    entry.path ? profilePath(entry.path) : '',
  ].filter(Boolean).join(' ');
  return `files ${clauses}`.trim();
}

// Move a freshly opened, undocked tree into its authored group. `relocateToGroup` moves whichever
// tab is active, which is this tree only when the entry actually opened one — an entry that merely
// redocked an already-open tree leaves focus, and that tab's group, alone.
function placeInGroup(
  entry: ProfileFilesEntry, managers: Managers, treeLabel: string,
  defaultGroup: number, colorForGroup: (group: number, fallbackDotColor: string) => string,
): void {
  const active = managers.tab.tabs[managers.tab.activeTab];
  if (active?.label !== treeLabel) return;
  const group = entry.group ?? defaultGroup;
  relocateToGroup(managers, group, colorForGroup(group, active.dotColor), entry.groupName);
}

export function openProfileFiles(
  files: ProfileFilesEntry[], managers: Managers, defaultLabel: string, notes: string[],
  defaultGroup: number, colorForGroup: (group: number, fallbackDotColor: string) => string,
): MainAreaCandidate[] {
  const opened: MainAreaCandidate[] = [];
  for (const entry of files) {
    const label = entry.in ?? defaultLabel;
    const treeLabel = managers.fileNavigator.open(filesCommand(entry), label);
    notes.push(`Opened file navigator${entry.dock ? ` (docked ${entry.dock})` : ''}.`);
    if (treeLabel === undefined) continue;
    // Best effort and silent: a saved directory or row that no longer exists is simply dropped.
    managers.fileNavigator.restoreView(treeLabel, entry);
    if (entry.dock) continue;
    placeInGroup(entry, managers, treeLabel, defaultGroup, colorForGroup);
    opened.push({ label: treeLabel, number: entry.number, focus: entry.focus, pane: entry.pane });
  }
  return opened;
}
