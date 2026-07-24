import type { FileNavigatorRow } from '@shared/protocol';

const STATUS_CLASS: Record<NonNullable<FileNavigatorRow['gitStatus']>, string> = {
  changed: 'files-name--changed',
  staged: 'files-name--staged',
  conflict: 'files-name--conflict',
};

// Compute the class strings for one file-navigator row: the row wrapper (its `selected`/`drop-target`
// modifiers) and its name span (a `files-name--changed`/`files-name--staged`/`files-name--conflict`
// modifier matching the row's `gitStatus`, or none when unset). Kept out of the component so
// `FileNavigatorTab.tsx` stays under the file-size limit.
export function fileNavigatorRowClass(
  row: FileNavigatorRow,
  selected: string | null,
  dropTargetPath: string | undefined,
): { row: string; name: string } {
  const rowClass = `files-row${row.path === selected ? ' selected' : ''}${dropTargetPath === row.path ? ' drop-target' : ''}`;
  const nameClass = `files-name${row.gitStatus ? ` ${STATUS_CLASS[row.gitStatus]}` : ''}`;
  return { row: rowClass, name: nameClass };
}
