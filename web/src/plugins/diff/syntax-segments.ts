import type { TokenRange } from '../api';
import { changedSegments } from './intraline';
import type { Span } from './intraline';

export function syntaxSegments(text: string, spans: Span[], tokens: TokenRange[]) {
  const tokenBounds = tokens.flatMap((token) => [token.from, token.to]);
  let offset = 0;
  return changedSegments(text, spans).flatMap((segment) => {
    const start = offset;
    offset += segment.text.length;
    const bounds = [...new Set([start, offset, ...tokenBounds])]
      .filter((bound) => bound >= start && bound <= offset)
      .toSorted((a, b) => a - b);
    return bounds.slice(0, -1).map((from, index) => {
      const to = bounds[index + 1];
      const scope = tokens.find((token) => from >= token.from && to <= token.to)?.scope;
      return {
        from,
        text: text.slice(from, to),
        className: [scope, segment.changed ? 'diff-changed' : undefined].filter(Boolean).join(' '),
      };
    });
  });
}
