import { describe, it, expect } from 'vitest';
import { command } from './quit.js';

describe('quit command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('quit');
  });

  it('matches "quit" and "exit" case-insensitively', () => {
    expect(command.match('quit')).toBe(true);
    expect(command.match('QUIT')).toBe(true);
    expect(command.match('exit')).toBe(true);
    expect(command.match('EXIT')).toBe(true);
    expect(command.match('Exit')).toBe(true);
  });

  it('does not match non-quit input', () => {
    expect(command.match('quits')).toBe(false);
    expect(command.match('exits')).toBe(false);
    expect(command.match('close')).toBe(false);
  });
});
