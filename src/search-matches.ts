import type { BufferLine } from './types.js';

// Line types with no meaningful text to search: a terminal card renders a live PTY (no static
// text) and a spacer is blank.
const UNSEARCHABLE = new Set<BufferLine['type']>(['terminal', 'spacer']);

// Compile a search pattern as a case-insensitive regex, or null for an empty or invalid pattern.
// Pure — no Node imports — so both the server command and the web client (via the `@shared`
// alias) can use it.
export function compilePattern(pattern: string): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

// Indices (into `lines`) of every searchable line whose text matches `pattern`, oldest first.
// Returns [] for an empty or invalid pattern.
export function findMatches(lines: BufferLine[], pattern: string): number[] {
  const regex = compilePattern(pattern);
  if (!regex) return [];
  const indices: number[] = [];
  for (const [index, line] of lines.entries()) {
    if (UNSEARCHABLE.has(line.type)) continue;
    if (regex.test(line.text)) indices.push(index);
  }
  return indices;
}

// The first match's [start, end) character range in `text`, for substring highlighting. Null
// when the pattern doesn't match (or is empty/invalid).
export function matchRange(text: string, pattern: string): { start: number; end: number } | null {
  const regex = compilePattern(pattern);
  const match = regex?.exec(text);
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length };
}
