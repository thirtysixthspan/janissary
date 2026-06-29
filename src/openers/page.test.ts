import { describe, it, expect } from 'vitest';
import { normalizeWebUrl, rootDomain } from './page.js';

describe('normalizeWebUrl', () => {
  it('keeps an https URL verbatim (normalized form)', () => {
    const result = normalizeWebUrl('https://slashdot.org');
    expect(result).toEqual({ url: 'https://slashdot.org/' });
  });

  it('keeps an http URL verbatim', () => {
    // eslint-disable-next-line unicorn/prefer-https
    const httpUrl = 'http://example.com/x';
    const result = normalizeWebUrl(httpUrl);
    expect(result).toEqual({ url: httpUrl });
  });

  it('prepends https:// to a bare hostname', () => {
    const result = normalizeWebUrl('slashdot.org');
    expect(result).toEqual({ url: 'https://slashdot.org/' });
  });

  it('prepends https:// to a bare domain with path', () => {
    const result = normalizeWebUrl('example.com/foo');
    expect(result).toEqual({ url: 'https://example.com/foo' });
  });

  it('rejects javascript: scheme', () => {
    const result = normalizeWebUrl('javascript:alert(1)');
    expect(result).toHaveProperty('error');
  });

  it('rejects ftp: scheme', () => {
    const result = normalizeWebUrl('ftp://example.com');
    expect(result).toHaveProperty('error');
  });

  it('rejects file: scheme', () => {
    const result = normalizeWebUrl('file:///etc/passwd');
    expect(result).toHaveProperty('error');
  });

  it('returns error for an empty string', () => {
    const result = normalizeWebUrl('');
    expect(result).toHaveProperty('error');
  });
});

describe('rootDomain', () => {
  it('strips www. from a hostname', () => {
    expect(rootDomain('www.website.com')).toBe('website.com');
  });

  it('returns the bare hostname for a two-label domain', () => {
    expect(rootDomain('example.com')).toBe('example.com');
  });

  it('reduces a three-label hostname to the last two labels', () => {
    expect(rootDomain('docs.example.com')).toBe('example.com');
  });

  it('keeps three labels when the SLD is a short well-known label (co)', () => {
    expect(rootDomain('foo.example.co.uk')).toBe('example.co.uk');
  });

  it('keeps three labels for .org.uk', () => {
    expect(rootDomain('www.foo.org.uk')).toBe('foo.org.uk');
  });

  it('strips www. before domain reduction', () => {
    expect(rootDomain('www.docs.example.com')).toBe('example.com');
  });

  it('handles a single-label hostname', () => {
    expect(rootDomain('localhost')).toBe('localhost');
  });
});
