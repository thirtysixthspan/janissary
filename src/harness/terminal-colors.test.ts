import { describe, it, expect } from 'vitest';
import { isTerminalColors } from './terminal-colors.js';

// The one place that decides what a valid terminal color report is. What arrives here is untrusted
// input on its way into a recording's header and then into a terminal emulator, so the refusals are
// the substance of this file — the accepts only have to keep working.
describe('isTerminalColors', () => {
  const palette = Array.from({ length: 16 }, (_, index) => `#0000${String(index).padStart(2, '0')}`);

  it('accepts the two colors alone, which is what a surface predating the palette sends', () => {
    expect(isTerminalColors({ fg: '#123456', bg: '#654321' })).toBe(true);
  });

  it('accepts a full sixteen-color palette', () => {
    expect(isTerminalColors({ fg: '#123456', bg: '#654321', palette })).toBe(true);
  });

  it('refuses a palette of the wrong length rather than padding or truncating it', () => {
    // A partial palette would be written into the header as a shorter list, and every player's
    // palette table indexes sixteen slots — so one color missing shifts every color after it.
    expect(isTerminalColors({ fg: '#123456', bg: '#654321', palette: palette.slice(0, 15) })).toBe(false);
    expect(isTerminalColors({ fg: '#123456', bg: '#654321', palette: [...palette, '#000010'] })).toBe(false);
    expect(isTerminalColors({ fg: '#123456', bg: '#654321', palette: [] })).toBe(false);
  });

  it('refuses a palette that is not an array, and one holding something that is not a hex color', () => {
    expect(isTerminalColors({ fg: '#123456', bg: '#654321', palette: 'red' })).toBe(false);
    expect(isTerminalColors({ fg: '#123456', bg: '#654321', palette: { 0: '#000000' } })).toBe(false);
    expect(isTerminalColors({ fg: '#123456', bg: '#654321', palette: [...palette.slice(1), 42] })).toBe(false);
    // A CSS color a browser would accept, and this server will not: the value is written verbatim
    // into a file header that other tools read.
    expect(isTerminalColors({ fg: '#123456', bg: '#654321', palette: [...palette.slice(1), 'rebeccapurple'] })).toBe(false);
  });

  it('refuses a missing or non-hex fg or bg, as it always has', () => {
    expect(isTerminalColors({ fg: '#123456' })).toBe(false);
    expect(isTerminalColors({ bg: '#654321' })).toBe(false);
    expect(isTerminalColors({ fg: 'white', bg: 'black' })).toBe(false);
    expect(isTerminalColors(null)).toBe(false);
    expect(isTerminalColors([{ fg: '#123456', bg: '#654321' }])).toBe(false);
  });
});