import type { DiffFile } from '@shared/plugins/diff/shared';

export function gutterWidth(file: DiffFile): number {
  let width = 3;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      width = Math.max(width, String(line.number).length, String(line.oldNumber ?? '').length);
    }
  }
  return width;
}
