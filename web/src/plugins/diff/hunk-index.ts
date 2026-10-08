import type { DiffFile, DiffHunk } from '@shared/plugins/diff/shared';

// One stop on the keyboard walk: which file entry, which hunk inside it, and the line a Return on
// that hunk opens the file at.
export type HunkSpot = { file: number; hunk: number; line: number };

// The line a Return on a hunk opens at: its first added line, or its first line when the hunk
// removes rather than adds.
function entryLine(hunk: DiffHunk): number {
  const added = hunk.lines.find((line) => line.kind === 'added');
  return (added ?? hunk.lines[0])?.jump ?? 0;
}

// The change set's hunks as one ordered list in file order — the unit the walk selects, crossing
// file entries because a change is a change whichever file holds it.
export function hunkSpots(files: DiffFile[]): HunkSpot[] {
  const spots: HunkSpot[] = [];
  for (const [fileIndex, file] of files.entries()) {
    for (const [hunkIndex, hunk] of file.hunks.entries()) {
      if (hunk.lines.length === 0) continue;
      spots.push({ file: fileIndex, hunk: hunkIndex, line: entryLine(hunk) });
    }
  }
  return spots;
}

// How many hunks the change set holds below the file at `index`, which is what gives a file entry
// its hunks' positions in the walk's flat list.
export function hunkOffset(files: DiffFile[], index: number): number {
  let offset = 0;
  for (let i = 0; i < index; i += 1) offset += files[i].hunks.filter((hunk) => hunk.lines.length > 0).length;
  return offset;
}
