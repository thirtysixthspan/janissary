import type { Managers } from '../managers.js';
import type { ProfileFilesEntry } from '../types.js';

// Open each profile-level file-navigator tab (from the profile's `files` key) once every entry is
// open, rooted at `defaultLabel` (the profile's first newly opened tab) unless the entry names its
// own `in` target. `defaultLabel` is undefined when the profile opened nothing, in which case an
// entry with no `in` has nothing to root itself at and is skipped with a note. An entry's `path`,
// when set, is appended after the clauses so the tree roots at that literal path (e.g. `$root`),
// leaving the resolved label only as the tab the output note appends to.
export function openProfileFiles(
  files: ProfileFilesEntry[], managers: Managers, defaultLabel: string | undefined, notes: string[],
): void {
  for (const entry of files) {
    const label = entry.in ?? defaultLabel;
    if (label === undefined) { notes.push('File navigator: no tab to root it at.'); continue; }
    const clauses = [
      entry.in ? `in ${entry.in}` : '',
      entry.dock ? `on ${entry.dock}` : '',
      entry.path ? entry.path.trim() : '',
    ].filter(Boolean).join(' ');
    managers.fileNavigator.open(`files ${clauses}`.trim(), label);
    notes.push(`Opened file navigator${entry.dock ? ` (docked ${entry.dock})` : ''}.`);
  }
}
