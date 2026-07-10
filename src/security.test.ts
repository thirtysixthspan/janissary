import { describe, it, expect } from 'vitest';
import { makeToken, originAllowed, tokenFromReq, tokenMatches } from './security.js';

describe('makeToken', () => {
  it('returns a base64url string 32 characters long', () => {
    const token = makeToken();
    expect(token).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('originAllowed', () => {
  it('returns false for a non-loopback host', () => {
    const request = { headers: { host: 'evil.com' } };
    expect(originAllowed(request as never)).toBe(false);
  });

  it('returns false for a loopback host with a non-loopback origin', () => {
    const request = { headers: { host: 'localhost:3000', origin: 'https://evil.com' } };
    expect(originAllowed(request as never)).toBe(false);
  });

  it('returns false when origin is not a valid URL', () => {
    const request = { headers: { host: '127.0.0.1', origin: ':::' } };
    expect(originAllowed(request as never)).toBe(false);
  });

  it('returns true for a loopback host with no origin header', () => {
    const request = { headers: { host: 'localhost' } };
    expect(originAllowed(request as never)).toBe(true);
  });

  it('returns true for a loopback host with a loopback origin', () => {
    const request = { headers: { host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080' } };
    expect(originAllowed(request as never)).toBe(true);
  });
});

describe('tokenFromReq', () => {
  it('extracts the token query parameter from a request URL', () => {
    const request = { url: '/?token=abc123' };
    expect(tokenFromReq(request as never)).toBe('abc123');
  });

  it('returns null when the request URL is invalid', () => {
    const request = { url: 'http://' };
    expect(tokenFromReq(request as never)).toBeNull();
  });

  it('returns null when there is no token parameter', () => {
    const request = { url: '/path' };
    expect(tokenFromReq(request as never)).toBeNull();
  });
});

describe('tokenMatches', () => {
  it('returns false when got is null', () => {
    expect(tokenMatches('secret', null)).toBe(false);
  });

  it('returns false when lengths differ', () => {
    expect(tokenMatches('long-secret-key', 'short')).toBe(false);
  });

  it('returns true when tokens match', () => {
    expect(tokenMatches('same-token', 'same-token')).toBe(true);
  });

  it('returns false when tokens do not match', () => {
    expect(tokenMatches('real-token', 'fake-token')).toBe(false);
  });
});
