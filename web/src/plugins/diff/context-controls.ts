import type { DiffFile } from '@shared/plugins/diff/shared';

export function canExpandFileContext(file: DiffFile): boolean {
  return !file.binary && !file.added && !file.deleted && file.canExpandContext !== false
    && file.hunks.some((hunk) => hunk.lines.some((line) => line.kind === 'context'));
}
