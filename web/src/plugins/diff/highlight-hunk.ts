import type { DiffHunk, DiffLine } from '@shared/plugins/diff/shared';
import { createFileTokenizer } from '../api';
import type { TokenRange } from '../api';

function highlightSide(lines: DiffLine[], fileName: string): Map<DiffLine, TokenRange[]> {
  const tokens = createFileTokenizer()(lines.map((line) => line.text).join('\n'), fileName);
  return new Map(lines.map((line, index) => [line, tokens[index] ?? []]));
}

export function highlightHunk(hunk: DiffHunk, fileName: string, oldFileName: string) {
  return {
    old: highlightSide(hunk.lines.filter((line) => line.kind !== 'added'), oldFileName),
    next: highlightSide(hunk.lines.filter((line) => line.kind !== 'removed'), fileName),
  };
}
