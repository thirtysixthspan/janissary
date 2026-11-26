import type { LineFindApi } from '../shared/line-find/useLineFind';

export type FindMatch = { line: number; from: number; to: number };

export function findMatchHighlight(
  find: Pick<LineFindApi, 'findOpen' | 'results' | 'selected'>,
  cursorLine: number | undefined,
): FindMatch | null {
  const result = find.results[find.selected];
  if (!find.findOpen || !result || result.index !== cursorLine || result.ranges.length === 0) return null;
  const [from, to] = result.ranges[0];
  return { line: result.index, from, to };
}
