import { diffLines, type LineOp } from './line-diff.js';

const CONTEXT_LINES = 3;

// Produce a unified diff of `oldStr` -> `newStr`, labeled with `fileName` in the header lines.
// Display-only: no code in this repo parses the output back into structured hunks.
export function createPatch(fileName: string, oldStr: string, newStr: string): string {
  const oldLines = splitLines(oldStr);
  const newLines = splitLines(newStr);
  const ops = diffLines(oldLines, newLines);
  const hunks = buildHunks(ops);

  const header = [`--- ${fileName}`, `+++ ${fileName}`];
  const body = hunks.map((hunk) => renderHunk(hunk, oldLines, newLines));
  return [...header, ...body].join('\n');
}

// Split into lines without dropping a trailing empty segment caused by a final newline, so the line
// count always matches what a human sees when the text is rendered.
function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

type Hunk = { oldStart: number; oldCount: number; newStart: number; newCount: number; ops: LineOp[] };

// Extend a hunk backward from its first changed op to include up to CONTEXT_LINES of preceding
// unchanged context.
function hunkStart(ops: LineOp[], changeIndex: number): number {
  let start = changeIndex;
  let context = 0;
  while (start > 0 && ops[start - 1].type === 'equal' && context < CONTEXT_LINES) {
    start--;
    context++;
  }
  return start;
}

// Extend a hunk forward past its changed ops, absorbing any unchanged run of at most
// 2*CONTEXT_LINES (which would otherwise separate two hunks that are close together) and ending
// after at most CONTEXT_LINES of trailing unchanged context.
function hunkEnd(ops: LineOp[], changeIndex: number): number {
  let end = changeIndex;
  while (end < ops.length) {
    if (ops[end].type !== 'equal') {
      end++;
      continue;
    }
    let scan = end;
    while (scan < ops.length && ops[scan].type === 'equal') scan++;
    const run = scan - end;
    if (run <= CONTEXT_LINES * 2 && scan < ops.length) {
      end = scan;
      continue;
    }
    return Math.min(end + CONTEXT_LINES, ops.length);
  }
  return end;
}

// Group the raw line ops into hunks, merging changes separated by at most 2*CONTEXT_LINES of
// unchanged context into a single hunk, and trimming unchanged runs at hunk edges down to
// CONTEXT_LINES.
function buildHunks(ops: LineOp[]): Hunk[] {
  const hunks: Hunk[] = [];
  let i = 0;
  let oldIndex = 0;
  let newIndex = 0;

  while (i < ops.length) {
    if (ops[i].type === 'equal') {
      oldIndex++;
      newIndex++;
      i++;
      continue;
    }

    const start = hunkStart(ops, i);
    const end = hunkEnd(ops, i);
    const contextBefore = i - start;
    const hunkOps = ops.slice(start, end);

    hunks.push({
      oldStart: oldIndex - contextBefore,
      oldCount: hunkOps.filter((op) => op.type !== 'add').length,
      newStart: newIndex - contextBefore,
      newCount: hunkOps.filter((op) => op.type !== 'remove').length,
      ops: hunkOps,
    });

    for (let j = i; j < end; j++) {
      if (ops[j].type !== 'add') oldIndex++;
      if (ops[j].type !== 'remove') newIndex++;
    }
    i = end;
  }

  return hunks;
}

function renderHunk(hunk: Hunk, oldLines: string[], newLines: string[]): string {
  const header = `@@ -${hunk.oldStart + 1},${hunk.oldCount} +${hunk.newStart + 1},${hunk.newCount} @@`;
  const body = hunk.ops.map((op) => {
    if (op.type === 'equal') return ` ${oldLines[op.oldIndex]}`;
    if (op.type === 'remove') return `-${oldLines[op.oldIndex]}`;
    return `+${newLines[op.newIndex]}`;
  });
  return [header, ...body].join('\n');
}
