import { describe, expect, it } from 'vitest';
import { parseTabCommand } from './parse-tab.js';

describe('parseTabCommand', () => {
  it('parses each command into its structured form and matches keywords and sides without case', () => {
    expect(parseTabCommand('TAB FOCUS notes')).toEqual({ kind: 'focus', name: 'notes' });
    expect(parseTabCommand('tab MOVE notes 2')).toEqual({ target: 'notes', change: { kind: 'move', position: 2 } });
    expect(parseTabCommand('tab PANE notes RIGHT')).toEqual({ target: 'notes', change: { kind: 'pane', side: 'right' } });
    expect(parseTabCommand('tab split notes')).toEqual({ target: 'notes', change: { kind: 'split' } });
    expect(parseTabCommand('tab color notes #FF8800')).toEqual({ target: 'notes', change: { kind: 'color', color: '#FF8800' } });
    expect(parseTabCommand('tab group notes Review')).toEqual({ target: 'notes', change: { kind: 'group', selector: 'Review' } });
    expect(parseTabCommand('tab dock notes LEFT')).toEqual({ target: 'notes', change: { kind: 'dock', side: 'left' } });
    expect(parseTabCommand('tab undock notes')).toEqual({ target: 'notes', change: { kind: 'undock' } });
  });

  it('reads quoted names with spaces in every form and supports both quote styles and escaped quotes', () => {
    for (const command of [
      'tab focus "review notes"',
      'tab move "review notes" 2',
      'tab pane "review notes" right',
      'tab split "review notes"',
      'tab color "review notes" #aabbcc',
      'tab group "review notes" group-a',
      'tab dock "review notes" left',
      'tab undock "review notes"',
    ]) expect(parseTabCommand(command)).not.toHaveProperty('error');
    expect(parseTabCommand("tab focus 'review notes'")).toEqual({ kind: 'focus', name: 'review notes' });
    expect(parseTabCommand(String.raw`tab move "review \"notes\"" 2`))
      .toEqual({ target: 'review "notes"', change: { kind: 'move', position: 2 } });
  });

  it.each([
    ['tab focus', 'Usage: tab focus <name>.'],
    ['tab focus notes extra', 'Usage: tab focus <name>.'],
    ['tab focus "unfinished', 'Usage: tab focus <name>.'],
    ['tab focus ""', 'Usage: tab focus <name>.'],
    ['tab move', 'Usage: tab move <tab> <position>.'],
    ['tab move notes', 'Usage: tab move <tab> <position>.'],
    ['tab move notes 0', 'Usage: tab move <tab> <position>.'],
    ['tab move notes -1', 'Usage: tab move <tab> <position>.'],
    ['tab move notes 1.5', 'Usage: tab move <tab> <position>.'],
    ['tab move notes two', 'Usage: tab move <tab> <position>.'],
    ['tab move notes 9007199254740992', 'Usage: tab move <tab> <position>.'],
    ['tab pane notes north', 'Usage: tab pane <tab> left|right.'],
    ['tab pane', 'Usage: tab pane <tab> left|right.'],
    ['tab pane notes right extra', 'Usage: tab pane <tab> left|right.'],
    ['tab split', 'Usage: tab split <tab>.'],
    ['tab split notes extra', 'Usage: tab split <tab>.'],
    ['tab color', 'Usage: tab color <tab> <#rrggbb>.'],
    ['tab color notes #fff', 'Usage: tab color <tab> <#rrggbb>.'],
    ['tab color notes ff0000', 'Usage: tab color <tab> <#rrggbb>.'],
    ['tab color notes #gg0000', 'Usage: tab color <tab> <#rrggbb>.'],
    ['tab group notes 0', 'Usage: tab group <tab> <id|name>.'],
    ['tab group', 'Usage: tab group <tab> <id|name>.'],
    ['tab group notes', 'Usage: tab group <tab> <id|name>.'],
    ['tab dock', 'Usage: tab dock <tab> left|right.'],
    ['tab dock notes north', 'Usage: tab dock <tab> left|right.'],
    ['tab undock', 'Usage: tab undock <tab>.'],
    ['tab undock notes extra', 'Usage: tab undock <tab>.'],
  ])('returns exact usage for malformed input %s', (input, error) => {
    expect(parseTabCommand(input)).toEqual({ error });
  });

  it.each([
    ['tab move "unfinished 2', 'Usage: tab move <tab> <position>.'],
    ['tab pane "unfinished right', 'Usage: tab pane <tab> left|right.'],
    ['tab split "unfinished', 'Usage: tab split <tab>.'],
    ['tab color "unfinished #123456', 'Usage: tab color <tab> <#rrggbb>.'],
    ['tab group "unfinished 1', 'Usage: tab group <tab> <id|name>.'],
    ['tab dock "unfinished left', 'Usage: tab dock <tab> left|right.'],
    ['tab undock "unfinished', 'Usage: tab undock <tab>.'],
  ])('uses the known subcommand usage for unterminated target %s', (input, error) => {
    expect(parseTabCommand(input)).toEqual({ error });
  });

  it.each(['tab', 'tab close notes', 'tab "focus'])('returns summary usage for unknown or malformed subcommand %s', (input) => {
    expect(parseTabCommand(input)).toEqual({
      error: 'Usage: tab focus|move|pane|split|color|group|dock|undock <tab> [argument].',
    });
  });

  it('accepts a position larger than any group without clamping during parsing', () => {
    expect(parseTabCommand('tab move notes 999')).toEqual({
      target: 'notes', change: { kind: 'move', position: 999 },
    });
  });
});
