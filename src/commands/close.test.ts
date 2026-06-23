import { describe, it, expect } from 'vitest';
import { command } from './close.js';

describe('close command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('close');
  });

  it('matches "close" case-insensitively', () => {
    expect(command.match('close')).toBe(true);
    expect(command.match('CLOSE')).toBe(true);
    expect(command.match('Close')).toBe(true);
  });

  it('does not match non-close input', () => {
    expect(command.match('closer')).toBe(false);
    expect(command.match('clos')).toBe(false);
    expect(command.match('quit')).toBe(false);
  });
});
