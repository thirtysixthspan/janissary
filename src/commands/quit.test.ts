import { describe, it, expect } from 'vitest';
import { command } from './quit.js';

describe('quit command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('quit');
  });

  it('matches "quit" case-insensitively', () => {
    expect(command.match('quit')).toBe(true);
    expect(command.match('QUIT')).toBe(true);
    expect(command.match('  quit  ')).toBe(true);
  });

  it('does not match non-quit input, including "exit" (now an alias of close)', () => {
    expect(command.match('quits')).toBe(false);
    expect(command.match('exit')).toBe(false);
    expect(command.match('close')).toBe(false);
  });
});
