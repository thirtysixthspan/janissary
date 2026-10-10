import type { DiffContextBoundary, DiffHunk, DiffLine } from './shared.js';

type Boundary = DiffContextBoundary & { left?: string; right?: string };

function changedKey(line: DiffLine): string {
  return `${line.kind}:${line.oldNumber ?? 0}:${line.number}`;
}

function changedLines(hunk: DiffHunk): DiffLine[] {
  return hunk.lines.filter((line) => line.kind !== 'context');
}

function keyIndex(lines: DiffLine[], key: string): number {
  return lines.findIndex((line) => line.kind !== 'context' && changedKey(line) === key);
}

function leadingContext(hunk: DiffHunk): number {
  const firstChange = hunk.lines.findIndex((line) => line.kind !== 'context');
  return Math.max(firstChange, 0);
}

function trailingContext(hunk: DiffHunk): number {
  const lastChange = hunk.lines.findLastIndex((line) => line.kind !== 'context');
  return Math.max(hunk.lines.length - lastChange - 1, 0);
}

function changedHunk(hunks: DiffHunk[], key: string): DiffHunk | undefined {
  return hunks.find((hunk) => changedLines(hunk).some((line) => changedKey(line) === key));
}

function lineEnd(hunk: DiffHunk): { old: number; next: number } {
  const end = { old: hunk.oldStart - 1, next: hunk.newStart - 1 };
  for (const line of hunk.lines) {
    if (line.oldNumber !== undefined) end.old = Math.max(end.old, line.oldNumber);
    if (line.kind !== 'removed') end.next = Math.max(end.next, line.number);
  }
  return end;
}

function boundaries(hunks: DiffHunk[]): Boundary[] {
  const changes = hunks.map((hunk) => changedLines(hunk));
  if (changes.some((lines) => lines.length === 0)) return [];
  const first = changes[0][0];
  const last = changes.at(-1)!.at(-1)!;
  const result: Boundary[] = [{ id: `top:${changedKey(first)}`, position: 'top', right: changedKey(first) }];
  for (let index = 0; index < hunks.length - 1; index++) {
    const left = changes[index].at(-1)!;
    const right = changes[index + 1][0];
    const end = lineEnd(hunks[index]);
    if (hunks[index + 1].oldStart <= end.old + 1 && hunks[index + 1].newStart <= end.next + 1) continue;
    result.push({ id: `between:${changedKey(left)}:${changedKey(right)}`, position: 'between', hunkIndex: index,
      left: changedKey(left), right: changedKey(right) });
  }
  result.push({ id: `bottom:${changedKey(last)}`, position: 'bottom', left: changedKey(last) });
  return result;
}

export function availableContextBoundaries(current: DiffHunk[], wider: DiffHunk[], expanded: ReadonlySet<string>): DiffContextBoundary[] {
  return boundaries(current).filter((boundary) => {
    if (expanded.has(boundary.id)) return false;
    if (boundary.position === 'between') return true;
    const anchor = boundary.position === 'top' ? boundary.right : boundary.left;
    const shown = current.find((hunk) => changedLines(hunk).some((line) => changedKey(line) === anchor));
    const full = changedHunk(wider, anchor!);
    if (!shown || !full) return false;
    return boundary.position === 'top'
      ? leadingContext(full) > leadingContext(shown)
      : trailingContext(full) > trailingContext(shown);
  });
}

export function expandHunksAtBoundary(current: DiffHunk[], full: DiffHunk[], id: string): DiffHunk[] {
  const boundary = boundaries(current).find((candidate) => candidate.id === id);
  if (!boundary || full.length === 0) return current;
  const all = full.flatMap((hunk) => hunk.lines);
  if (boundary.position === 'top') {
    const target = boundary.right!;
    const hunkIndex = current.findIndex((hunk) => changedLines(hunk).some((line) => changedKey(line) === target));
    const currentHunk = current[hunkIndex];
    const currentIndex = keyIndex(currentHunk.lines, target);
    const fullIndex = keyIndex(all, target);
    if (hunkIndex !== 0 || currentIndex < 0 || fullIndex < 0) return current;
    return [{ ...currentHunk, oldStart: full[0].oldStart, newStart: full[0].newStart,
      lines: [...all.slice(0, fullIndex), ...currentHunk.lines.slice(currentIndex)] }, ...current.slice(1)];
  }
  if (boundary.position === 'bottom') {
    const target = boundary.left!;
    const hunkIndex = current.findIndex((hunk) => changedLines(hunk).some((line) => changedKey(line) === target));
    const currentHunk = current[hunkIndex];
    const currentIndex = keyIndex(currentHunk.lines, target);
    const fullIndex = keyIndex(all, target);
    if (hunkIndex !== current.length - 1 || currentIndex < 0 || fullIndex < 0) return current;
    return [...current.slice(0, -1), { ...currentHunk, lines: [...currentHunk.lines.slice(0, currentIndex + 1), ...all.slice(fullIndex + 1)] }];
  }
  const left = boundary.left!;
  const right = boundary.right!;
  const leftHunkIndex = current.findIndex((hunk) => changedLines(hunk).some((line) => changedKey(line) === left));
  const rightHunkIndex = current.findIndex((hunk) => changedLines(hunk).some((line) => changedKey(line) === right));
  const leftHunk = current[leftHunkIndex];
  const rightHunk = current[rightHunkIndex];
  const leftCurrent = keyIndex(leftHunk.lines, left);
  const rightCurrent = keyIndex(rightHunk.lines, right);
  const leftFull = keyIndex(all, left);
  const rightFull = keyIndex(all, right);
  if (rightHunkIndex !== leftHunkIndex + 1 || leftCurrent < 0 || rightCurrent < 0 || leftFull < 0 || rightFull < 0) return current;
  const merged: DiffHunk = {
    oldStart: leftHunk.oldStart,
    newStart: leftHunk.newStart,
    lines: [...leftHunk.lines.slice(0, leftCurrent + 1), ...all.slice(leftFull + 1, rightFull), ...rightHunk.lines.slice(rightCurrent)],
  };
  return [...current.slice(0, leftHunkIndex), merged, ...current.slice(rightHunkIndex + 1)];
}
