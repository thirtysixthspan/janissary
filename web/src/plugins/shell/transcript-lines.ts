import type { IBuffer, Terminal } from '@xterm/xterm';

// The terminal's transcript as the lines a reader sees: each logical line once, however many screen
// rows it wrapped across, with `rows[i]` the buffer row `lines[i]` starts on so a match can be shown.
export type TranscriptLines = { lines: string[]; rows: number[] };

// A wrapped row's text runs on into the next one, so every piece but the last keeps its full width:
// trimming each piece would drop a space that fell exactly at the wrap.
export function readTranscriptLines(buffer: Pick<IBuffer, 'length' | 'getLine'>): TranscriptLines {
  const lines: string[] = [];
  const rows: number[] = [];
  let text: string | undefined;
  for (let row = 0; row < buffer.length; row++) {
    const line = buffer.getLine(row);
    if (!line) continue;
    if (line.isWrapped && text !== undefined) {
      text += line.translateToString(false);
      continue;
    }
    if (text !== undefined) lines.push(text.trimEnd());
    text = line.translateToString(false);
    rows.push(row);
  }
  if (text !== undefined) lines.push(text.trimEnd());
  return { lines, rows };
}

// Brings a buffer row into view a quarter of the way down the screen, as the editor's find places the
// caret, and selects it so the eye lands on it.
export function revealTranscriptRow(terminal: Pick<Terminal, 'rows' | 'scrollToLine' | 'selectLines'>, row: number): void {
  terminal.scrollToLine(Math.max(0, row - Math.floor(terminal.rows / 4)));
  terminal.selectLines(row, row);
}
