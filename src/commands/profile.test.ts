import { describe, it, expect } from 'vitest';
import { command } from './profile.js';

describe('profile command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('profile');
  });

  it('matches profile commands case-insensitively', () => {
    expect(command.match('profile launch coding')).toBe(true);
    expect(command.match('PROFILE list')).toBe(true);
    expect(command.match('profile')).toBe(true);
  });

  it('does not match non-profile input', () => {
    expect(command.match('profiles')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});
