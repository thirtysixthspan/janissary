import { relocateToGroup } from './editors.js';
import type { Managers } from '../managers.js';
import type { ProfileFilesEntry } from './types.js';
import type { MainAreaCandidate } from './focus.js';
import type { FileNavigatorOpenArgs } from '../file-navigator/args.js';

// Open each profile-level file-navigator tab once every entry is open, rooted at `defaultLabel`
// (the profile's first newly opened tab, or the issuing tab when the launch opened none of its own)
// unless the entry names its own `in` target.
//
// A docked tree has no place in the tab strip and produces no launch candidate; an undocked one
// carries the usual presentation keys and is relocated into its authored group, returning a
// candidate so the caller's reorder and placement passes cover it like an editor tab.

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
    const parsed: FileNavigatorOpenArgs = {
      kind: 'open', inLabel: entry.in, dock: entry.dock ?? null, details: entry.details, steps: [],
      target: entry.path ?? '',
    };
    const treeLabel = managers.fileNavigator.open(parsed, label, (text) => { notes.push(text); });
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
