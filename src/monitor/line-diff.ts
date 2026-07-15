export type LineOp =
  | { type: 'equal'; oldIndex: number; newIndex: number }
  | { type: 'remove'; oldIndex: number }
  | { type: 'add'; newIndex: number };

// Myers O(ND) shortest-edit-script diff over two line arrays, returning a flat sequence of
// equal/remove/add operations in order from the start of both inputs to their ends.
export function diffLines(oldLines: string[], newLines: string[]): LineOp[] {
  if (oldLines.length === 0 && newLines.length === 0) return [];
  const trace = shortestEditTrace(oldLines, newLines);
  return backtrack(oldLines, newLines, trace);
}

function offset(k: number, max: number): number {
  return k + max;
}

// Whether the frontier at (d, k) is reached by an "insert" move (from k+1) rather than a
// "delete" move (from k-1), following Myers' standard boundary/comparison rule.
function fromInsert(d: number, k: number, v: number[], max: number): boolean {
  return k === -d || (k !== d && v[offset(k - 1, max)] < v[offset(k + 1, max)]);
}

// Runs Myers' greedy forward search, recording the frontier `v` array at each edit distance `d` so
// the caller can backtrack from it to reconstruct the actual edit script.
function shortestEditTrace(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v: number[] = Array.from({ length: 2 * max + 1 }, () => 0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d++) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      const x = fromInsert(d, k, v, max) ? v[offset(k + 1, max)] : v[offset(k - 1, max)] + 1;
      const y = x - k;
      const end = advanceDiagonal(a, b, x, y);
      v[offset(k, max)] = end.x;
      if (end.x >= n && end.y >= m) return trace;
    }
  }
  return trace;
}

// Follows the diagonal of matching lines as far as it goes from (x, y).
function advanceDiagonal(a: string[], b: string[], startX: number, startY: number): { x: number; y: number } {
  let x = startX;
  let y = startY;
  while (x < a.length && y < b.length && a[x] === b[y]) {
    x++;
    y++;
  }
  return { x, y };
}

function backtrack(a: string[], b: string[], trace: number[][]): LineOp[] {
  const max = a.length + b.length;
  let x = a.length;
  let y = b.length;
  const ops: LineOp[] = [];

  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    const prevK = fromInsert(d, k, v, max) ? k + 1 : k - 1;
    const prevX = v[offset(prevK, max)];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--;
      y--;
      ops.push({ type: 'equal', oldIndex: x, newIndex: y });
    }
    if (d > 0) ops.push(stepOp(x, prevX, x - 1, y - 1));
    x = prevX;
    y = prevY;
  }

  ops.reverse();
  return ops;
}

// The single insert/delete step taken at edit distance d: an "add" of newLines[y-1] when x hasn't
// moved from prevX, otherwise a "remove" of oldLines[x-1].
function stepOp(x: number, prevX: number, oldLineIndex: number, newLineIndex: number): LineOp {
  return x === prevX ? { type: 'add', newIndex: newLineIndex } : { type: 'remove', oldIndex: oldLineIndex };
}
