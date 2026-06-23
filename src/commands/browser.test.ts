import { describe, it, expect } from 'vitest';
import { command } from './browser.js';

describe('browser command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('browser');
  });

  it('matches browser commands', () => {
    expect(command.match('browser goto https://example.com')).toBe(true);
    expect(command.match('BROWSER goto https://example.com')).toBe(true);
    expect(command.match('browser')).toBe(true);
  });

  it('does not match non-browser input', () => {
    expect(command.match('browserr')).toBe(false);
    expect(command.match('brows')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});
