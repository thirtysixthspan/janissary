// Pos ↔ absolute-offset conversion over the document as one string (the lines joined by '\n',
// exactly what `toText` produces). Shared by the multi-caret edit fold in ./multi-caret.ts and by
// the multiselect plugin's occurrence search, so both agree on what an offset means.

import type { Pos } from './model';

export function posToOffset(lines: readonly string[], pos: Pos): number {
  let offset = 0;
  for (let line = 0; line < pos.line; line++) offset += lines[line].length + 1;
  return offset + pos.col;
}

// Clamped to the document's end, so an offset past the last character lands on the last position
// rather than answering a line that does not exist.
export function offsetToPos(lines: readonly string[], offset: number): Pos {
  let remaining = Math.max(0, offset);
  for (const [line, text] of lines.entries()) {
    if (remaining <= text.length) return { line, col: remaining };
    remaining -= text.length + 1;
  }
  const last = lines.length - 1;
  return { line: last, col: lines[last].length };
}
