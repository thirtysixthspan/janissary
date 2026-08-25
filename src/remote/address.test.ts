import { describe, it, expect } from 'vitest';
import { parseRemoteAddress, bareHost } from './address.js';

describe('parseRemoteAddress', () => {
  it('parses a bare host', () => {
    expect(parseRemoteAddress('devbox')).toEqual({
      address: 'devbox', destination: 'devbox', host: 'devbox', path: undefined,
    });
  });

  it('keeps the user on the destination and strips it from the host', () => {
    expect(parseRemoteAddress('admin@devbox')).toEqual({
      address: 'admin@devbox', destination: 'admin@devbox', host: 'devbox', path: undefined,
    });
  });

  it('splits an absolute remote path off at the first colon', () => {
    expect(parseRemoteAddress('devbox:/srv/proj')).toEqual({
      address: 'devbox:/srv/proj', destination: 'devbox', host: 'devbox', path: '/srv/proj',
    });
  });

  it('parses a user, a host, and a home-relative path together', () => {
    expect(parseRemoteAddress('admin@devbox:~/dev/proj')).toEqual({
      address: 'admin@devbox:~/dev/proj', destination: 'admin@devbox', host: 'devbox', path: '~/dev/proj',
    });
  });

  // The clause accepts no ssh options at all, so there is nothing a port could mean here: a host
  // needing one is named by a `Host` alias in ~/.ssh/config instead.
  it('treats a trailing :<digits> as a path, not a port', () => {
    expect(parseRemoteAddress('devbox:2222')).toMatchObject({ destination: 'devbox', path: '2222' });
  });

  it('reports a usage error for an absent token', () => {
    expect(parseRemoteAddress(undefined)).toEqual({ error: expect.stringContaining('Usage: on') });
  });

  it('reports a usage error for an empty token', () => {
    expect(parseRemoteAddress(' '.repeat(3))).toEqual({ error: expect.stringContaining('Usage: on') });
  });

  it('rejects an address whose path half is empty', () => {
    expect(parseRemoteAddress('devbox:')).toEqual({ error: expect.stringContaining('devbox:') });
  });

  // Rejected rather than escaped: the address is interpolated into the `$SHELL -lc` line spawnPty
  // builds, and it can arrive from a profile file rather than from something just typed.
  it.each([
    ['devbox;rm', 'a semicolon'],
    ['dev`box', 'a backtick'],
    ['dev$box', 'a dollar sign'],
    ['devbox&', 'an ampersand'],
    ['dev box', 'a space'],
    ['dev"box', 'a double quote'],
    ["dev'box", 'a single quote'],
    ['devbox|cat', 'a pipe'],
    ['$(id)', 'a substitution'],
  ])('rejects %s, which carries %s', (address) => {
    const parsed = parseRemoteAddress(address);
    expect(parsed).toEqual({ error: expect.stringContaining(address) });
  });

  it('rejects a shell metacharacter in the path half too', () => {
    expect(parseRemoteAddress('devbox:/srv/$(id)')).toEqual({
      error: expect.stringContaining('devbox:/srv/$(id)'),
    });
  });
});

describe('bareHost', () => {
  it('strips a user prefix and leaves a bare host alone', () => {
    expect(bareHost('admin@devbox')).toBe('devbox');
    expect(bareHost('devbox')).toBe('devbox');
  });
});
