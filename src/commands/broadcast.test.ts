import { describe, it, expect } from 'vitest';
import { command } from './broadcast.js';

describe('broadcast command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('broadcast');
  });

  it('matches broadcast commands', () => {
    expect(command.match('broadcast all info hi')).toBe(true);
    expect(command.match('BROADCAST all info hi')).toBe(true);
    expect(command.match('broadcast bilal,wali info hi')).toBe(true);
  });

  it('does not match non-broadcast input', () => {
    expect(command.match('broad cast')).toBe(false);
    expect(command.match('msg all info hi')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});
