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
    ['tab focus', String.raw`Usage: tab focus \<name\>.`],
    ['tab focus notes extra', String.raw`Usage: tab focus \<name\>.`],
    ['tab focus "unfinished', String.raw`Usage: tab focus \<name\>.`],
    ['tab focus ""', String.raw`Usage: tab focus \<name\>.`],
    ['tab move', String.raw`Usage: tab move \<tab\> \<position\>.`],
    ['tab move notes', String.raw`Usage: tab move \<tab\> \<position\>.`],
    ['tab move notes 0', String.raw`Usage: tab move \<tab\> \<position\>.`],
    ['tab move notes -1', String.raw`Usage: tab move \<tab\> \<position\>.`],
    ['tab move notes 1.5', String.raw`Usage: tab move \<tab\> \<position\>.`],
    ['tab move notes two', String.raw`Usage: tab move \<tab\> \<position\>.`],
    ['tab move notes 9007199254740992', String.raw`Usage: tab move \<tab\> \<position\>.`],
    ['tab pane notes north', String.raw`Usage: tab pane \<tab\> left|right.`],
    ['tab pane', String.raw`Usage: tab pane \<tab\> left|right.`],
    ['tab pane notes right extra', String.raw`Usage: tab pane \<tab\> left|right.`],
    ['tab split', String.raw`Usage: tab split \<tab\>.`],
    ['tab split notes extra', String.raw`Usage: tab split \<tab\>.`],
    ['tab color', String.raw`Usage: tab color \<tab\> \<#rrggbb\>.`],
    ['tab color notes #fff', String.raw`Usage: tab color \<tab\> \<#rrggbb\>.`],
    ['tab color notes ff0000', String.raw`Usage: tab color \<tab\> \<#rrggbb\>.`],
    ['tab color notes #gg0000', String.raw`Usage: tab color \<tab\> \<#rrggbb\>.`],
    ['tab group notes 0', String.raw`Usage: tab group \<tab\> \<id|name\>.`],
    ['tab group', String.raw`Usage: tab group \<tab\> \<id|name\>.`],
    ['tab group notes', String.raw`Usage: tab group \<tab\> \<id|name\>.`],
    ['tab dock', String.raw`Usage: tab dock \<tab\> left|right.`],
    ['tab dock notes north', String.raw`Usage: tab dock \<tab\> left|right.`],
    ['tab undock', String.raw`Usage: tab undock \<tab\>.`],
    ['tab undock notes extra', String.raw`Usage: tab undock \<tab\>.`],
  ])('returns exact usage for malformed input %s', (input, error) => {
    expect(parseTabCommand(input)).toEqual({ error });
  });

  it.each([
    ['tab move "unfinished 2', String.raw`Usage: tab move \<tab\> \<position\>.`],
    ['tab pane "unfinished right', String.raw`Usage: tab pane \<tab\> left|right.`],
    ['tab split "unfinished', String.raw`Usage: tab split \<tab\>.`],
    ['tab color "unfinished #123456', String.raw`Usage: tab color \<tab\> \<#rrggbb\>.`],
    ['tab group "unfinished 1', String.raw`Usage: tab group \<tab\> \<id|name\>.`],
    ['tab dock "unfinished left', String.raw`Usage: tab dock \<tab\> left|right.`],
    ['tab undock "unfinished', String.raw`Usage: tab undock \<tab\>.`],
  ])('uses the known subcommand usage for unterminated target %s', (input, error) => {
    expect(parseTabCommand(input)).toEqual({ error });
  });

  it.each(['tab', 'tab close notes', 'tab "focus'])('returns summary usage for unknown or malformed subcommand %s', (input) => {
    expect(parseTabCommand(input)).toEqual({
      error: String.raw`Usage: tab focus|move|pane|split|color|group|dock|undock \<tab\> [argument].`,
    });
  });

  it('accepts a position larger than any group without clamping during parsing', () => {
    expect(parseTabCommand('tab move notes 999')).toEqual({
      target: 'notes', change: { kind: 'move', position: 999 },
    });
  });
});
