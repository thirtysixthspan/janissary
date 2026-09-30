// How many display lines of context an entry shows either side of the display line holding its
// match. Display lines, not buffer lines: a line long enough to wrap is several of them.
export const CONTEXT_DISPLAY_LINES = 2;

// Which part of a wrapped match line an entry shows, and how much of the neighbouring context is
// left to draw. `first` and `count` are display lines of the match line itself; `above` and `below`
// are the display lines each context block may still use once the match line has supplied its own.
export type MatchWindow = { first: number; count: number; above: number; below: number };

// The window around the display line `matchLine` of a match line `total` display lines tall. The
// match line fills as much of the two lines either side as it can, and the neighbouring buffer lines
// make up whatever it could not — so a match line that fits on one display line leaves the context
// its full two lines on both sides, and one deep inside a long line leaves them none.
export function matchWindow(matchLine: number, total: number): MatchWindow {
  const last = Math.max(0, total - 1);
  const line = Math.min(Math.max(0, matchLine), last);
  const first = Math.max(0, line - CONTEXT_DISPLAY_LINES);
  const end = Math.min(last, line + CONTEXT_DISPLAY_LINES);
  return {
    first,
    count: end - first + 1,
    above: CONTEXT_DISPLAY_LINES - (line - first),
    below: CONTEXT_DISPLAY_LINES - (end - line),
  };
}

// How many display lines a block of this height holds. Rounded rather than floored, because a
// measured height carries sub-pixel error, and never less than one — an empty line is still a line.
export function displayLineCount(height: number, lineHeight: number): number {
  return Math.max(1, Math.round(height / lineHeight));
}

// Which display line an offset from the top of the block falls on. Floored, because a line box's
// text sits a little below the top of the box, not on it.
export function displayLineOf(offset: number, lineHeight: number): number {
  return Math.max(0, Math.floor(offset / lineHeight));
}

// A match line cut into the text before the match, the match, and the text after. Offsets outside
// the line are clamped, so a row whose offsets do not fit its text still renders all of it.
export function splitAtMatch(
  text: string, start: number, end: number,
): [before: string, match: string, after: string] {
  const from = Math.min(Math.max(0, start), text.length);
  const to = Math.min(Math.max(from, end), text.length);
  return [text.slice(0, from), text.slice(from, to), text.slice(to)];
}
