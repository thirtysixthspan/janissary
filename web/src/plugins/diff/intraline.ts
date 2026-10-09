import type { DiffLine } from '@shared/plugins/diff/shared';
import { splitRows } from './split-rows';

// A run of characters inside one line: where it starts, where it ends.
export type Span = { from: number; to: number };

// One run of a line's text, and whether it is a run the alignment found changed.
export type Segment = { text: string; changed: boolean };

// A line longer than this is not aligned at all. The table is O(lines × lines), so a minified
// bundle's one-line change would spend a second of the main thread on an alignment nobody reads.
const MAX_INLINE_CHARS = 400;

// How much of the shorter line two lines must share before their alignment means anything. Below
// this the pair is unrelated rather than edited, and the highlight it produced would be noise.
const SHARED_FLOOR = 0.5;

// The characters of `a` that appear in `b`'s longest common subsequence, and the characters of `b`
// that appear in `a`'s. The alignment itself is never needed — only which characters it kept.
function commonCharacters(a: string, b: string): { a: boolean[]; b: boolean[] } {
  const rows = a.length + 1;
  const columns = b.length + 1;
  const lengths = new Uint16Array(rows * columns);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i * columns + j] = a[i] === b[j]
        ? lengths[(i + 1) * columns + j + 1] + 1
        : Math.max(lengths[(i + 1) * columns + j], lengths[i * columns + j + 1]);
    }
  }
  const inA = Array.from({ length: a.length }, () => false);
  const inB = Array.from({ length: b.length }, () => false);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      inA[i] = true;
      inB[j] = true;
      i += 1;
      j += 1;
    } else if (lengths[(i + 1) * columns + j] >= lengths[i * columns + j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return { a: inA, b: inB };
}

// The characters the alignment did not keep, grouped into runs. A text of `n` characters keeps `n`
// falses when nothing matched.
function changedRuns(kept: boolean[]): Span[] {
  const spans: Span[] = [];
  let from = 0;
  while (from < kept.length) {
    if (kept[from]) { from += 1; continue; }
    let to = from;
    while (to < kept.length && !kept[to]) to += 1;
    spans.push({ from, to });
    from = to;
  }
  return spans;
}

// The text in the order it reads, with the changed runs marked, so the renderer wraps only those.
export function changedSegments(text: string, spans: Span[]): Segment[] {
  const segments: Segment[] = [];
  let at = 0;
  for (const span of spans) {
    if (span.from > at) segments.push({ text: text.slice(at, span.from), changed: false });
    segments.push({ text: text.slice(span.from, span.to), changed: true });
    at = span.to;
  }
  if (at < text.length) segments.push({ text: text.slice(at), changed: false });
  if (segments.length === 0) segments.push({ text, changed: false });
  return segments;
}

function spansFor(old: string, next: string): { old: Span[]; next: Span[] } {
  const empty = { old: [], next: [] };
  if (old.length === 0 || next.length === 0) return empty;
  if (old === next) return empty;
  if (old.length > MAX_INLINE_CHARS || next.length > MAX_INLINE_CHARS) return empty;
  const common = commonCharacters(old, next);
  const matched = common.a.reduce((count, kept) => count + (kept ? 1 : 0), 0);
  if (matched / Math.min(old.length, next.length) < SHARED_FLOOR) return empty;
  return { old: changedRuns(common.a), next: changedRuns(common.b) };
}

// The characters that changed inside one replaced line, keyed by the line itself. A hunk's own rows
// give the pairing: a removed line beside the added line that replaced it, and nothing else, so a
// line that only moved has no highlight and neither half of an unpaired run has any.
export function changedSpans(hunk: { lines: DiffLine[] }): Map<DiffLine, Span[]> {
  const spans = new Map<DiffLine, Span[]>();
  for (const row of splitRows(hunk)) {
    if (row.old === undefined || row.next === undefined || row.old.kind !== 'removed' || row.next.kind !== 'added') continue;
    const pair = spansFor(row.old.text, row.next.text);
    spans.set(row.old, pair.old);
    spans.set(row.next, pair.next);
  }
  return spans;
}
