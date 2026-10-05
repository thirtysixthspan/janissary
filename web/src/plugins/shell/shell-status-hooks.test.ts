import { describe, expect, it } from 'vitest';
import { createShellMarkerNonce, shellStatusHooks } from './shell-status-hooks';

describe('createShellMarkerNonce', () => {
  it('returns a fresh 32-character hex nonce each time', () => {
    const first = createShellMarkerNonce();
    const second = createShellMarkerNonce();

    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(second).toMatch(/^[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
  });
});

describe('shellStatusHooks', () => {
  it('signs every marker the hooks emit with the nonce', () => {
    const hooks = shellStatusHooks('abc123');

    expect(hooks).toContain(String.raw`printf '\033]133;C;abc123;%s\a'`);
    expect(hooks).toContain(String.raw`printf '\033]133;D;abc123\a'`);
    expect(hooks).toContain(String.raw`printf '\033]133;E;abc123\a'`);
    expect(hooks).toContain(String.raw`printf '\033]7;abc123;file://%s%s\a' "$HOST" "$PWD"`);
  });

  it('writes the nonce only into the markers, never into a shell variable', () => {
    expect(shellStatusHooks('abc123').split('abc123')).toHaveLength(5);
  });
});
