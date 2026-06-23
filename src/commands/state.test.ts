import { describe, it, expect } from 'vitest';
import { command } from './state.js';

describe('state command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('state');
  });

  it('matches "state" case-insensitively', () => {
    expect(command.match('state')).toBe(true);
    expect(command.match('STATE')).toBe(true);
    expect(command.match('State')).toBe(true);
  });

  it('does not match non-state input', () => {
    expect(command.match('stated')).toBe(false);
    expect(command.match('stat')).toBe(false);
    expect(command.match('next')).toBe(false);
  });
});
