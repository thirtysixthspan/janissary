import { describe, it, expect } from 'vitest';
import { command } from './rename.js';

describe('rename command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('rename');
  });

  it('matches "rename" case-insensitively, with or without an argument', () => {
    expect(command.match('rename')).toBe(true);
    expect(command.match('rename foo')).toBe(true);
    expect(command.match('RENAME foo')).toBe(true);
  });

  it('does not match non-rename input', () => {
    expect(command.match('renamed')).toBe(false);
    expect(command.match('rena')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});
