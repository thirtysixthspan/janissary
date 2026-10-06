import { describe, it, expect } from 'vitest';
import { castHeader } from './cast-header.js';

// The one line of every recording that says what produced it and what it looked like. Two things are
// load-bearing here and easy to break: the `command` is how a stray `.cast` in the shared directory
// is told apart from a harness or ssh one, and the theme is all three keys the format asks for.
describe('castHeader', () => {
  const base = { cols: 80, rows: 24, timestamp: 1_500_000_000_000, command: '/bin/zsh', title: 'devbox' };
  const palette = Array.from({ length: 16 }, (_, index) => `#0000${String(index).padStart(2, '0')}`);

  function theme(colors: Parameters<typeof castHeader>[0]['colors']) {
    return (castHeader({ ...base, colors }).term as { theme?: Record<string, unknown> }).theme;
  }

  it('carries the session\'s dimensions, command and title', () => {
    const header = castHeader(base);
    expect(header).toMatchObject({
      version: 3,
      term: { cols: 80, rows: 24, type: 'xterm-256color' },
      timestamp: 1_500_000_000,
      command: '/bin/zsh',
      title: 'devbox',
    });
  });

  it('writes the sixteen ANSI colors as one colon-joined list, in order', () => {
    // The list is written in ANSI order because that is the order a player's palette table indexes,
    // so a joined string read back is the same sequence the session rendered.
    expect(theme({ fg: '#123456', bg: '#654321', palette })?.palette).toBe(palette.join(':'));
  });

  it('carries all three theme keys when all three are known', () => {
    expect(Object.keys(theme({ fg: '#123456', bg: '#654321', palette }) ?? {}).toSorted((a, b) => a.localeCompare(b)))
      .toEqual(['bg', 'fg', 'palette']);
  });

  it('omits the palette rather than writing an empty one when no palette was reported', () => {
    // A surface predating the palette reports two colors, and its recording keeps exactly the
    // header it always had — a `palette: ''` would read as a palette of no colors at all.
    const colors = theme({ fg: '#123456', bg: '#654321' });
    expect(colors).toEqual({ fg: '#123456', bg: '#654321' });
    expect('palette' in (colors ?? {})).toBe(false);
  });

  it('writes no theme at all for a session that reported no colors', () => {
    expect(theme(undefined)).toBeUndefined();
  });

  it('writes no idle_time_limit, so a player plays the timing that happened', () => {
    // The format has the field and asciinema's player uses it to shorten inactivity. Writing it
    // would tell every other player to rewrite a run's timing, which is the one thing the recording
    // is the record of.
    expect('idle_time_limit' in castHeader(base)).toBe(false);
  });
});