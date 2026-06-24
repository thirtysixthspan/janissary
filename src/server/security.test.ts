import { describe, it, expect } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { makeToken, originAllowed, tokenFromReq, tokenMatches } from './security.js';

const req = (headers: Record<string, string>, url = '/'): IncomingMessage =>
  ({ headers, url } as unknown as IncomingMessage);

describe('security', () => {
  it('mints distinct, non-empty tokens', () => {
    const a = makeToken();
    const b = makeToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(16);
  });

  it('allows loopback host with no origin', () => {
    expect(originAllowed(req({ host: '127.0.0.1:8080' }))).toBe(true);
    expect(originAllowed(req({ host: 'localhost:3000' }))).toBe(true);
  });

  it('rejects non-loopback host (DNS-rebinding guard)', () => {
    expect(originAllowed(req({ host: 'evil.example.com' }))).toBe(false);
    expect(originAllowed(req({ host: '192.168.1.5:8080' }))).toBe(false);
  });

  it('rejects a non-loopback origin even on a loopback host', () => {
    expect(originAllowed(req({ host: '127.0.0.1:8080', origin: 'http://evil.example.com' }))).toBe(false);
    expect(originAllowed(req({ host: '127.0.0.1:8080', origin: 'http://localhost:8080' }))).toBe(true);
  });

  it('extracts and compares the token in constant time', () => {
    expect(tokenFromReq(req({}, '/?token=abc123'))).toBe('abc123');
    expect(tokenFromReq(req({}, '/'))).toBeNull();
    expect(tokenMatches('secret', 'secret')).toBe(true);
    expect(tokenMatches('secret', 'nope')).toBe(false);
    expect(tokenMatches('secret', null)).toBe(false);
  });
});
