import { describe, expect, it, vi } from 'vitest';
import { readTranscriptLines, revealTranscriptRow } from './transcript-lines';

type Row = { text: string; wrapped?: boolean };

function buffer(rows: Row[]) {
  return {
    length: rows.length,
    getLine: (row: number) => {
      const line = rows[row];
      return line && {
        isWrapped: line.wrapped ?? false,
        translateToString: (trimRight?: boolean) => (trimRight ? line.text.trimEnd() : line.text),
      };
    },
  } as unknown as Parameters<typeof readTranscriptLines>[0];
}

describe('readTranscriptLines', () => {
  it('reads one line per row, trimmed, with the row it starts on', () => {
    expect(readTranscriptLines(buffer([{ text: '> ls   ' }, { text: 'a.txt  ' }]))).toEqual({
      lines: ['> ls', 'a.txt'],
      rows: [0, 1],
    });
  });

  it('joins a wrapped line into one, keeping a space that fell at the wrap', () => {
    const result = readTranscriptLines(buffer([
      { text: '> echo' },
      { text: 'hello ' },
      { text: 'world   ', wrapped: true },
      { text: 'done' },
    ]));

    expect(result).toEqual({ lines: ['> echo', 'hello world', 'done'], rows: [0, 1, 3] });
  });

  it('reads an empty buffer as no lines', () => {
    expect(readTranscriptLines(buffer([]))).toEqual({ lines: [], rows: [] });
  });
});

describe('revealTranscriptRow', () => {
  it('scrolls the row a quarter of the way down the screen and selects it', () => {
    const terminal = { rows: 24, scrollToLine: vi.fn(), selectLines: vi.fn() };

    revealTranscriptRow(terminal, 50);

    expect(terminal.scrollToLine).toHaveBeenCalledWith(44);
    expect(terminal.selectLines).toHaveBeenCalledWith(50, 50);
  });

  it('never scrolls above the top of the buffer', () => {
    const terminal = { rows: 24, scrollToLine: vi.fn(), selectLines: vi.fn() };

    revealTranscriptRow(terminal, 2);

    expect(terminal.scrollToLine).toHaveBeenCalledWith(0);
  });
});
