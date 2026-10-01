import { describe, it, expect } from 'vitest';
import { command } from './clip.js';

describe('clip command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('clip');
  });

  it('matches "clip" case-insensitively', () => {
    expect(command.match('clip')).toBe(true);
    expect(command.match('CLIP')).toBe(true);
    expect(command.match('Clip')).toBe(true);
  });

  it('does not match other input, so it cannot swallow a longer command', () => {
    expect(command.match('clips')).toBe(false);
    expect(command.match('cli')).toBe(false);
    expect(command.match('close')).toBe(false);
  });

  // The popup is interactive and client-side; reaching the server non-interactively — a scheduled
  // dispatch, a `send`, a drained queue entry, an agent message — is a no-op rather than an unknown
  // command that would prompt for a route.
  it('is a no-op on the server', () => {
    expect(command.run('clip', { label: 'a' }, {} as never)).toBeUndefined();
  });
});
