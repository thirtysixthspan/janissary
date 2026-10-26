import { describe, it, expect } from 'vitest';
import { command } from './clipboard.js';

describe('clipboard command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('clipboard');
  });

  it('matches "clipboard" case-insensitively', () => {
    expect(command.match('clipboard')).toBe(true);
    expect(command.match('CLIPBOARD')).toBe(true);
    expect(command.match('Clipboard')).toBe(true);
  });

  it('does not match other input, so it cannot swallow a longer command', () => {
    expect(command.match('clip')).toBe(false);
    expect(command.match('clipboards')).toBe(false);
    expect(command.match('clipboar')).toBe(false);
    expect(command.match('close')).toBe(false);
  });

  // The popup is interactive and client-side; reaching the server non-interactively — a scheduled
  // dispatch, a `send`, a drained queue entry, an agent message — is a no-op rather than an unknown
  // command that would prompt for a route.
  it('is a no-op on the server', () => {
    expect(command.run('clipboard', { label: 'a' }, {} as never)).toBeUndefined();
  });
});
