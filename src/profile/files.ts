import { relocateToGroup } from './editors.js';
import type { Managers } from '../managers.js';
import type { ProfileFilesEntry } from './types.js';
import type { MainAreaCandidate } from './focus.js';

// Open each profile-level file-navigator tab once every entry is open, rooted at `defaultLabel`
// (the profile's first newly opened tab) unless the entry names its own `in` target. `defaultLabel`
// is undefined when the profile opened nothing, in which case an entry with no `in` has nothing to
// root itself at and is skipped with a note. An entry's `path`, when set, is appended after the
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
    entry.in ? `in ${entry.in}` : '',
    entry.dock ? `on ${entry.dock}` : '',
    entry.details ? `with ${entry.details}` : '',
    entry.path ? entry.path.trim() : '',
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
  relocateToGroup(managers, group, colorForGroup(group, active.dotColor));
}

export function openProfileFiles(
  files: ProfileFilesEntry[], managers: Managers, defaultLabel: string | undefined, notes: string[],
  defaultGroup: number, colorForGroup: (group: number, fallbackDotColor: string) => string,
): MainAreaCandidate[] {
  const opened: MainAreaCandidate[] = [];
  for (const entry of files) {
    const label = entry.in ?? defaultLabel;
    if (label === undefined) { notes.push('File navigator: no tab to root it at.'); continue; }
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
