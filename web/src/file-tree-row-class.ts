import type { FileTreeRow } from '@shared/protocol';

// Compute the class strings for one file-tree row: the row wrapper (its `selected`/`drop-target`
// modifiers) and its name span (the `files-name--changed` modifier when git considers the row
// changed — a modified/staged/untracked file, or a directory containing one). Kept out of the
// component so `FileTreeTab.tsx` stays under the file-size limit.
export function fileTreeRowClass(
  row: FileTreeRow,
  selected: string | null,
  dropTargetPath: string | undefined,
): { row: string; name: string } {
  const rowClass = `files-row${row.path === selected ? ' selected' : ''}${dropTargetPath === row.path ? ' drop-target' : ''}`;
  const nameClass = `files-name${row.changed ? ' files-name--changed' : ''}`;
  return { row: rowClass, name: nameClass };
}
