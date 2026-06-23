import { describe, it, expect } from 'vitest';
import { command } from './next.js';

describe('next command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('next');
  });

  it('matches "next" case-insensitively', () => {
    expect(command.match('next')).toBe(true);
    expect(command.match('NEXT')).toBe(true);
    expect(command.match('Next')).toBe(true);
  });

  it('does not match non-next input', () => {
    expect(command.match('nextt')).toBe(false);
    expect(command.match('next next')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});
