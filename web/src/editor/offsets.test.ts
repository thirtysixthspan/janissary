import { describe, it, expect } from 'vitest';
import { offsetToPos, posToOffset } from './offsets';

const LINES = ['one', 'two', 'three'];

describe('posToOffset', () => {
  it('counts the line break between lines', () => {
    expect(posToOffset(LINES, { line: 0, col: 0 })).toBe(0);
    expect(posToOffset(LINES, { line: 0, col: 3 })).toBe(3);
    expect(posToOffset(LINES, { line: 1, col: 0 })).toBe(4);
    expect(posToOffset(LINES, { line: 2, col: 5 })).toBe(13);
  });

  it('agrees with the joined document', () => {
    expect(LINES.join('\n')).toHaveLength(posToOffset(LINES, { line: 2, col: 5 }));
  });
});

describe('offsetToPos', () => {
  it('round-trips every position of the document', () => {
    for (const [line, text] of LINES.entries()) {
      for (let col = 0; col <= text.length; col++) {
        expect(offsetToPos(LINES, posToOffset(LINES, { line, col }))).toEqual({ line, col });
      }
    }
  });

  it('clamps to the document end rather than naming a line that does not exist', () => {
    expect(offsetToPos(LINES, 99)).toEqual({ line: 2, col: 5 });
    expect(offsetToPos(LINES, -1)).toEqual({ line: 0, col: 0 });
  });

  it('handles a one-line document', () => {
    expect(offsetToPos(['abc'], 2)).toEqual({ line: 0, col: 2 });
    expect(offsetToPos([''], 0)).toEqual({ line: 0, col: 0 });
  });
});
