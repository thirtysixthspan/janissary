import { describe, it, expect } from 'vitest';
import { showsTerminalTakeover } from './interactive-signals.js';

const ESC = String.fromCodePoint(27);
const altScreen = `${ESC}[?1049h`;
const legacyAltScreen = `${ESC}[?47h`;
const moveTo = (row: number, col: number): string => `${ESC}[${row};${col}H`;

describe('showsTerminalTakeover', () => {
  it('fires on alternate-screen entry', () => {
    expect(showsTerminalTakeover(`some output${altScreen}`)).toBe(true);
  });

  it('fires on the legacy alternate-screen sequence', () => {
    expect(showsTerminalTakeover(legacyAltScreen)).toBe(true);
  });

  it('fires only once absolute cursor moves reach the threshold', () => {
    expect(showsTerminalTakeover(moveTo(1, 1))).toBe(false);
    expect(showsTerminalTakeover(moveTo(1, 1) + moveTo(2, 1))).toBe(false);
    expect(showsTerminalTakeover(moveTo(1, 1) + moveTo(2, 1) + moveTo(3, 1))).toBe(true);
  });

  it('does not inflate its count when re-run over a growing buffer', () => {
    let buffer = '';
    for (const line of ['first', 'second', 'third', 'fourth']) {
      buffer += `${moveTo(1, 1)}${line}`;
      // Each call recounts from scratch, so the same two moves seen twice must not reach three.
      if (buffer.split(moveTo(1, 1)).length - 1 < 3) expect(showsTerminalTakeover(buffer)).toBe(false);
    }
    expect(showsTerminalTakeover(buffer)).toBe(true);
  });

  it('ignores a spinner that hides the cursor and repaints with carriage returns', () => {
    const spinner = `${ESC}[?25l` + ['|', '/', '-', '\\'].map((f) => `\r${f} installing`).join('') + `${ESC}[?25h`;
    expect(showsTerminalTakeover(spinner)).toBe(false);
  });

  it('ignores plain and colored output', () => {
    expect(showsTerminalTakeover('total 8\ndrwxr-xr-x  4 user  staff  128 Jan  1 00:00 .\n')).toBe(false);
    expect(showsTerminalTakeover(`${ESC}[32mpassed${ESC}[0m`)).toBe(false);
  });
});
