import { describe, it, expect } from 'vitest';
import { command } from './clear.js';

describe('clear command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('clear');
  });

  it('matches "clear" case-insensitively', () => {
    expect(command.match('clear')).toBe(true);
    expect(command.match('CLEAR')).toBe(true);
    expect(command.match('Clear')).toBe(true);
  });

  it('does not match non-clear input', () => {
    expect(command.match('clearer')).toBe(false);
    expect(command.match('clea')).toBe(false);
    expect(command.match('next')).toBe(false);
  });
});
