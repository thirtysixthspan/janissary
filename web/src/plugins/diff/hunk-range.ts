import type { DiffHunk } from '@shared/plugins/diff/shared';

// The range a hunk's `@@` header names, the way git prints it: each side's start line and the number
// of lines that side of the hunk holds. A hunk's original side holds its context and removed lines,
// and its new side holds its context and added ones — a hunk that only removes answers the new side's
// length as 0, which is how a pure deletion prints.
export function hunkRange(hunk: DiffHunk): string {
  const old = hunk.lines.filter((line) => line.kind !== 'added').length;
  const next = hunk.lines.filter((line) => line.kind !== 'removed').length;
  return `@@ -${hunk.oldStart},${old} +${hunk.newStart},${next} @@`;
}
