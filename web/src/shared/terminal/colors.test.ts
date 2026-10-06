import { afterEach, describe, expect, it } from 'vitest';
import { terminalColors } from './colors';

// The 16 ANSI colors a terminal renders with, read from the same custom properties the emulator is
// built from. They go into a recording's asciicast header, where the format wants all sixteen, so
// what this reads has to be a complete ordered list on every theme — including one that overrides
// only some of them.
describe('terminalColors', () => {
  const PROPERTIES = ['--terminal-fg', '--terminal-bg', '--terminal-black', '--terminal-white',
    '--terminal-bright-black', '--terminal-bright-white'];

  afterEach(() => {
    for (const name of PROPERTIES) document.documentElement.style.removeProperty(name);
  });

  it('reads the foreground and background the app themes itself with', () => {
    document.documentElement.style.setProperty('--terminal-fg', '#123456');
    document.documentElement.style.setProperty('--terminal-bg', '#654321');

    const { fg, bg } = terminalColors();

    expect(fg).toBe('#123456');
    expect(bg).toBe('#654321');
  });

  it('always reads a complete sixteen-color palette, even when no theme declares one', () => {
    // The root block declares all sixteen, so this is what a theme that overrides none gets — and it
    // has to be sixteen, because the server refuses a palette of any other length and every
    // recording would then be written without one.
    expect(terminalColors().palette).toHaveLength(16);
  });

  it('reads the palette in ANSI order, black first and bright white last', () => {
    document.documentElement.style.setProperty('--terminal-black', '#010101');
    document.documentElement.style.setProperty('--terminal-white', '#080808');
    document.documentElement.style.setProperty('--terminal-bright-black', '#090909');
    document.documentElement.style.setProperty('--terminal-bright-white', '#101010');

    const { palette } = terminalColors();

    // Order is the whole point: the list is written into a header as one joined string and read back
    // into a theme whose sixteen slots are indexed by position.
    expect(palette?.[0]).toBe('#010101');
    expect(palette?.[7]).toBe('#080808');
    expect(palette?.[8]).toBe('#090909');
    expect(palette?.[15]).toBe('#101010');
  });

  it('falls back per color when a theme overrides only some of them', () => {
    const before = terminalColors().palette;
    document.documentElement.style.setProperty('--terminal-red', '#ff0000');

    const after = terminalColors().palette;

    // One theme property changes one slot; the other fifteen keep the root defaults rather than
    // becoming undefined, which would be a header no player's palette table could read.
    expect(after?.[1]).toBe('#ff0000');
    expect(after?.filter((color, index) => index !== 1 && color !== before?.[index])).toEqual([]);
    expect(after).toHaveLength(16);
  });

  it('falls back to the app default when a theme names no foreground', () => {
    expect(terminalColors().fg).toBe('#e4e5e7');
    expect(terminalColors().bg).toBe('#17181b');
  });
});