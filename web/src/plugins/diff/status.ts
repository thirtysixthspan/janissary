import type { DiffFile } from '@shared/plugins/diff/shared';

// What happened to a file, in the one word the entry's header shows it by. The color behind the word
// is the second cue, and the record's own precedence decides which word wins: a binary entry opens the
// media tab and a deleted file's name is inert, so those name the entry over what its counts say.
export type FileStatus = {
  label: string;
  kind: 'added' | 'removed' | 'renamed' | 'binary' | 'mode' | 'modified';
};

export function fileStatus(file: DiffFile): FileStatus {
  if (file.binary) return { label: 'binary', kind: 'binary' };
  if (file.deleted) return { label: 'deleted', kind: 'removed' };
  if (file.oldPath !== undefined) return { label: 'renamed', kind: 'renamed' };
  if (file.added === true) return { label: 'added', kind: 'added' };
  if (file.hunks.length === 0) return { label: 'mode', kind: 'mode' };
  return { label: 'modified', kind: 'modified' };
}
