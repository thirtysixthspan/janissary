import { describe, it, expect } from 'vitest';
import { command } from './msg.js';

describe('msg command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('msg');
  });

  it('matches msg commands', () => {
    expect(command.match('msg bilal info hi')).toBe(true);
    expect(command.match('MSG bilal info hi')).toBe(true);
    expect(command.match('msg')).toBe(true);
  });

  it('does not match non-msg input', () => {
    expect(command.match('message')).toBe(false);
    expect(command.match('ms g')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});
