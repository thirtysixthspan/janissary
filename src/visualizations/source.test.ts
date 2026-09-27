import { describe, expect, it } from 'vitest';
import { parseSource } from './source.js';

describe('parseSource', () => {
  it('reads an http or https address as a url and normalizes it', () => {
    expect(parseSource('https://example.com/data.json')).toEqual({
      kind: 'url', url: 'https://example.com/data.json',
    });
    expect(parseSource('  https://example.com/a.csv  ')).toEqual({
      kind: 'url', url: 'https://example.com/a.csv',
    });
  });

  it('defaults a bare host to https, the way every other web target does', () => {
    expect(parseSource('example.com/data.csv')).toEqual({
      kind: 'url', url: 'https://example.com/data.csv',
    });
  });

  it('reads a path, a tilde path, and a relative path as a file', () => {
    expect(parseSource('/tmp/rows.csv')).toEqual({ kind: 'file', path: '/tmp/rows.csv' });
    expect(parseSource('~/rows.csv')).toEqual({ kind: 'file', path: '~/rows.csv' });
    expect(parseSource('./rows.csv')).toEqual({ kind: 'file', path: './rows.csv' });
  });

  it('refuses an empty line', () => {
    expect(parseSource(' '.repeat(3))).toEqual({ error: 'empty source' });
  });

  // The scheme rules are `normalizeWebUrl`'s, deliberately: a source that `open` would refuse to
  // fetch is refused here for the same reason rather than by a second opinion that could drift.
  it('refuses a scheme that is not http or https, with the reason the web normalizer gives', () => {
    expect(parseSource('javascript:alert(1)')).toEqual({ error: 'unsupported scheme in "javascript:alert(1)"' });
    expect(parseSource('file:///etc/passwd')).toEqual({ error: 'unsupported scheme in "file:///etc/passwd"' });
    expect(parseSource('ftp://example.com/a.csv')).toEqual({ error: 'unsupported scheme in "ftp://example.com/a.csv"' });
  });
});
