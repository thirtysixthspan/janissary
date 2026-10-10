import type { DiffFile } from '@shared/plugins/diff/shared';

// A change that holds no surviving line: git prints a context line only where something of the old
// content stayed, so an entry whose lines are all added or all removed is the whole file — a file
// added, a file deleted, or a rewrite that replaced every line. Binary and mode-only records hold no
// hunks and so are never whole-file changes here.
export function isWholeFileChange(file: DiffFile): boolean {
  const lines = file.hunks.flatMap((hunk) => hunk.lines);
  return lines.length > 0 && lines.every((line) => line.kind !== 'context');
}
