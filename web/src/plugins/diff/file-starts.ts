import type { DiffFile } from '@shared/plugins/diff/shared';

// Where each file's hunks begin in the walk's flat list, in file order. A file whose hunks hold no
// lines contributes no stops, so it is absent rather than pointing at another file's hunk. These are
// the stops the j and k keys move between: GitHub's convention, one file at a time.
export function fileStarts(files: DiffFile[]): number[] {
  const starts: number[] = [];
  let index = 0;
  for (const file of files) {
    const hunks = file.hunks.filter((hunk) => hunk.lines.length > 0).length;
    if (hunks > 0) {
      starts.push(index);
      index += hunks;
    }
  }
  return starts;
}

// The stop the key lands on: the next file's first hunk going down, the previous one's coming back up,
// stopping at the first and last file rather than wrapping. A key that would move nowhere answers
// null, which is how the walk tells a taken key from an ignored one.
export function fileStop(starts: number[], selected: number | null, forward: boolean): number | null {
  if (starts.length === 0) return null;
  const here = starts.filter((start) => start <= (selected ?? 0)).length - 1;
  const next = forward ? here + 1 : here - 1;
  return starts[Math.min(Math.max(next, 0), starts.length - 1)] ?? null;
}
