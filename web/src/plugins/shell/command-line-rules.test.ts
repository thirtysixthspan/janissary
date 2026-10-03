import { describe, expect, it } from 'vitest';
import {
  controlCharacterFor, routeFor, shellLine,
} from './command-line-rules';

describe('shell command line rules', () => {
  it('offers a line to the application unless it opens with the shell marker', () => {
    expect(routeFor('ls')).toBe('application');
    expect(routeFor('theme')).toBe('application');
    expect(routeFor('!theme')).toBe('shell');
    // Not the first character: a `!` mid-line is an ordinary character to a shell and to a command.
    expect(routeFor('echo !')).toBe('application');
  });

  it('strips the marker before the shell sees the line', () => {
    expect(shellLine('!ls -la')).toBe('ls -la');
    expect(shellLine('ls -la')).toBe('ls -la');
    expect(shellLine('!  ls  ')).toBe('ls');
  });

  // A stray marker on its own would otherwise submit a blank command to the shell, which is a
  // different thing from submitting nothing.
  it('turns a bare marker into nothing at all', () => {
    expect(shellLine('!')).toBe('');
    expect(shellLine('!   ')).toBe('');
  });

  it('sends the terminal\'s own control characters for the keys the shell claims', () => {
    expect(controlCharacterFor('ctrl+d', false)).toBe(String.fromCodePoint(4));
    expect(controlCharacterFor('ctrl+z', false)).toBe(String.fromCodePoint(26));
    expect(controlCharacterFor('ctrl+c', false)).toBe(String.fromCodePoint(3));
  });

  it('copies instead of interrupting when the bar holds a selection', () => {
    expect(controlCharacterFor('ctrl+c', true)).toBeUndefined();
    // The other two keep their meaning: a selection in the command bar is text, not a running program.
    expect(controlCharacterFor('ctrl+d', true)).toBe(String.fromCodePoint(4));
    expect(controlCharacterFor('ctrl+z', true)).toBe(String.fromCodePoint(26));
  });
});