import type { DiffFile } from '@shared/plugins/diff/shared';

// The lines one diff entry may show before the tab opens it collapsed. The body's rows are 12px
// monospace, so 400 of them is already more than a screenful and a half of scrolling past the rest
// of the change set, which is the point of the cap.
export const CHANGE_LINE_CAP = 400;

// How many of an entry's changed lines are past the cap, answering 0 for an entry within it, so the
// count can name itself in the header's note.
export function oversizedLines(file: DiffFile): number {
  return Math.max(0, file.additions + file.deletions - CHANGE_LINE_CAP);
}
