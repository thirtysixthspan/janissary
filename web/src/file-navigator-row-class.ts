import type { FileNavigatorRow } from '@shared/protocol';
import type { ClipboardMode } from './file-navigator-clipboard';

const STATUS_CLASS: Record<NonNullable<FileNavigatorRow['gitStatus']>, string> = {
  changed: 'files-name--changed',
  staged: 'files-name--staged',
  conflict: 'files-name--conflict',
};

// Compute the class strings for one file-navigator row: the row wrapper (its
// `selected`/`cursor`/`drop-target`/`copied`/`cut` modifiers) and its name span (a
// `files-name--changed`/`files-name--staged`/`files-name--conflict` modifier matching the row's
// `gitStatus`, or none when unset). Kept out of the component so `FileNavigatorTab.tsx` stays
// under the file-size limit. `clipboard` is the row's clipboard mode, which marks a copy and a cut
// differently — `null` when the row isn't on the clipboard.
export function fileNavigatorRowClass(
  row: FileNavigatorRow,
  selected: boolean,
  cursor: boolean,
  dropTargetPath: string | undefined,
  clipboard: ClipboardMode | null = null,
): { row: string; name: string } {
  const clipboardClass = clipboard === null ? '' : ` ${clipboard === 'cut' ? 'cut' : 'copied'}`;
  const rowClass = `files-row${selected ? ' selected' : ''}${cursor ? ' cursor' : ''}${dropTargetPath === row.path ? ' drop-target' : ''}${clipboardClass}`;
  const nameClass = `files-name${row.gitStatus ? ` ${STATUS_CLASS[row.gitStatus]}` : ''}`;
  return { row: rowClass, name: nameClass };
}
