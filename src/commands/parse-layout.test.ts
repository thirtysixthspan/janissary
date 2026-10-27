import { describe, expect, it } from 'vitest';
import { LAYOUT_SUBCOMMANDS, LAYOUT_USAGE, parseLayoutCommand } from './parse-layout.js';

describe('parseLayoutCommand', () => {
  it.each([
    ['layout window 1280 800', { action: 'window', width: 1280, height: 800 }],
    ['LAYOUT WINDOW 1440 900', { action: 'window', width: 1440, height: 900 }],
    ['layout sidebar left 400', { action: 'sidebar', side: 'left', width: 400 }],
    ['layout sidebar RIGHT 250', { action: 'sidebar', side: 'right', width: 250 }],
    ['layout split 60', { action: 'split', percent: 60 }],
    ['layout reporting 25', { action: 'reporting', percent: 25 }],
    ['layout reporting 0', { action: 'reporting', percent: 0 }],
    ['layout reporting 100', { action: 'reporting', percent: 100 }],
    ['layout show', { action: 'show' }],
    ['layout sidebar left 100000', { action: 'sidebar', side: 'left', width: 100_000 }],
  ])('parses %s', (input, parsed) => {
    expect(parseLayoutCommand(input)).toEqual(parsed);
  });

  it.each([
    'layout',
    'layout unknown',
    'layout window',
    'layout window 800',
    'layout window 800 600 extra',
    'layout window zero 600',
    'layout window 800 600.5',
    'layout window 0 600',
    'layout window -800 600',
    'layout sidebar center 300',
    'layout sidebar left 0',
    'layout split',
    'layout split 0',
    'layout split 100',
    'layout split 15.5',
    'layout split 60 extra',
    'layout reporting -1',
    'layout reporting 101',
    'layout reporting 25 extra',
    'layout show extra',
  ])('returns the usage error for %s', (input) => {
    expect(parseLayoutCommand(input)).toEqual({ error: LAYOUT_USAGE });
  });

  it('exports the subcommand words used by completion', () => {
    expect(LAYOUT_SUBCOMMANDS).toEqual(['window', 'sidebar', 'split', 'reporting', 'show']);
  });
});
