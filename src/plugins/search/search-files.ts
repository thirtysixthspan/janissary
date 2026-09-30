import type { Matcher } from './compile-matcher.js';
import type { SearchMatch } from './shared.js';

// How many lines of context a match carries either side. Clipped at the start and end of a file
// rather than padded, so a block may hold fewer than this many lines on either side.
const CONTEXT = 2;

// Split file text into lines, dropping a single trailing newline so a file ending in a newline does
// not contribute a phantom final line. Empty text yields no lines at all, while a file holding only
// a newline is the one empty line it plainly is.
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const withoutFinalNewline = text.endsWith('\n') ? text.slice(0, -1) : text;
  return withoutFinalNewline === '' ? [''] : withoutFinalNewline.split('\n');
}

// Whether any line of a file matches. The cheap question the scan's first phase asks, and it must
// agree exactly with `matchFile` finding at least one row — the two are the same test over the same
// lines, so a file that answers yes here is a file `matchFile` will produce rows for.
export function fileMatches(lines: readonly string[], matcher: Matcher): boolean {
  return lines.some((line) => matcher.test(line));
}

// Every match in one file, as self-describing rows: the path, the 1-based line number, the match
// line itself, and up to two lines of context either side.
export function matchFile(relPath: string, text: string, matcher: Matcher): SearchMatch[] {
  const lines = splitLines(text);
  const rows: SearchMatch[] = [];
  for (const [index, line] of lines.entries()) {
    if (!matcher.test(line)) continue;
    rows.push({
      path: relPath,
      line: index + 1,
      above: lines.slice(Math.max(0, index - CONTEXT), index),
      match: line,
      below: lines.slice(index + 1, Math.min(lines.length, index + 1 + CONTEXT)),
    });
  }
  return rows;
}
