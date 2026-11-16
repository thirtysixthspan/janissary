import type { SearchMatch } from '../search/types.js';

export type GrepEnding =
  | { kind: 'limit'; limit: number }
  | { kind: 'timeout' }
  | { kind: 'slow'; path: string };

const PREVIEW_LIMIT = 200;
const ELLIPSIS = '…';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function windowStart(length: number, spanStart: number, spanEnd: number): number {
  if (spanEnd - spanStart >= PREVIEW_LIMIT) return spanStart;
  const spare = PREVIEW_LIMIT - (spanEnd - spanStart);
  return clamp(spanStart - Math.floor(spare / 2), 0, length - PREVIEW_LIMIT);
}

export function previewLine(line: string, start: number, end: number): string {
  const withoutCarriageReturn = line.endsWith('\r') ? line.slice(0, -1) : line;
  const trimmed = withoutCarriageReturn.trimStart();
  if (trimmed.length === 0) return '';
  const removed = withoutCarriageReturn.length - trimmed.length;
  const spanStart = clamp(start - removed, 0, trimmed.length);
  const spanEnd = clamp(end - removed, spanStart, trimmed.length);
  if (trimmed.length <= PREVIEW_LIMIT) return trimmed;
  const from = windowStart(trimmed.length, spanStart, spanEnd);
  const to = from + PREVIEW_LIMIT;
  const leading = from > 0 ? ELLIPSIS : '';
  const trailing = to < trimmed.length ? ELLIPSIS : '';
  return `${leading}${trimmed.slice(from, to)}${trailing}`;
}

function endingTrailer(ending: GrepEnding | undefined): string | undefined {
  if (ending === undefined) return undefined;
  switch (ending.kind) {
    case 'limit': {
      return `(showing the first ${ending.limit} matches; narrow the pattern or raise --limit)`;
    }
    case 'timeout': {
      return '(search stopped after 30 seconds; narrow the pattern or --path)';
    }
    case 'slow': {
      return `(search stopped: the pattern took too long on ${ending.path}; simplify it or use --literal)`;
    }
  }
}

export function formatGrepResult(rows: readonly SearchMatch[], ending?: GrepEnding): string {
  const lines =
    rows.length === 0
      ? ['(no matches)']
      : rows.map((row) => `${row.path}:${row.line}: ${previewLine(row.match, row.start, row.end)}`);
  const trailer = endingTrailer(ending);
  if (trailer !== undefined) lines.push(trailer);
  return lines.join('\n');
}
