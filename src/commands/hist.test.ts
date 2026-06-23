import { describe, it, expect } from 'vitest';
import { command } from './hist.js';

describe('hist command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('hist');
  });

  it('matches "hist" case-insensitively', () => {
    expect(command.match('hist')).toBe(true);
    expect(command.match('HIST')).toBe(true);
    expect(command.match('Hist')).toBe(true);
  });

  it('does not match non-hist input', () => {
    expect(command.match('history')).toBe(false);
    expect(command.match('his')).toBe(false);
    expect(command.match('next')).toBe(false);
  });
});
