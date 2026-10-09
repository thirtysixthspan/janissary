import type { DiffLine } from '@shared/plugins/diff/shared';

// One place in the file, as two sides: the old side and the new one, either of which may be absent —
// a removed line with no counterpart beside it, or an added one.
export type SplitRow = { old?: DiffLine; next?: DiffLine };

// A hunk's lines laid out as rows. A context line appears on both sides of one row, and a run of
// removed lines is paired row by row with the run of added lines that follows it, so a replaced read
// sits on one row the way GitHub's split view pairs it. The split layout lays the two sides beside
// each other; the unified layout draws the old side above the new one, which is the order git printed
// them in — which is why the pairing lives here rather than in the split layout alone: the character
// alignment of a replaced line needs the same pairs the split layout has.
export function splitRows(hunk: { lines: DiffLine[] }): SplitRow[] {
  const rows: SplitRow[] = [];
  let index = 0;
  while (index < hunk.lines.length) {
    if (hunk.lines[index].kind === 'context') {
      rows.push({ old: hunk.lines[index], next: hunk.lines[index] });
      index += 1;
      continue;
    }
    const removed: DiffLine[] = [];
    while (index < hunk.lines.length && hunk.lines[index].kind === 'removed') {
      removed.push(hunk.lines[index]);
      index += 1;
    }
    const added: DiffLine[] = [];
    while (index < hunk.lines.length && hunk.lines[index].kind === 'added') {
      added.push(hunk.lines[index]);
      index += 1;
    }
    const length = Math.max(removed.length, added.length);
    for (let row = 0; row < length; row += 1) rows.push({ old: removed[row], next: added[row] });
  }
  return rows;
}
