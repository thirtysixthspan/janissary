import { loadProfileFiles } from '../profiles.js';
import type { Managers } from '../managers.js';

// Open each profile-level file-tree tab (from the profile's `_files.json`) once every entry is
// open, rooted at `defaultLabel` (the profile's first newly opened tab) unless the entry names its
// own `in` target. `defaultLabel` is undefined when the profile opened nothing, in which case an
// entry with no `in` has nothing to root itself at and is skipped with a note.
export function openProfileFiles(
  profileName: string, managers: Managers, defaultLabel: string | undefined, notes: string[],
): void {
  for (const entry of loadProfileFiles(profileName)) {
    const label = entry.in ?? defaultLabel;
    if (label === undefined) { notes.push('File navigator: no tab to root it at.'); continue; }
    const clauses = [entry.in ? `in ${entry.in}` : '', entry.dock ? `on ${entry.dock}` : ''].filter(Boolean).join(' ');
    managers.fileTree.open(`files ${clauses}`.trim(), label);
    notes.push(`Opened file navigator${entry.dock ? ` (docked ${entry.dock})` : ''}.`);
  }
}
