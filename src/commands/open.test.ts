import { describe, it, expect } from 'vitest';
import { parseOpen, isGlobPattern } from './open.js';

describe('parseOpen', () => {
  it('parses an inline open', () => {
    expect(parseOpen('open photo.png')).toEqual({ external: false, web: false, target: 'photo.png' });
  });

  it('parses an external open', () => {
    expect(parseOpen('open external photo.png')).toEqual({ external: true, web: false, target: 'photo.png' });
  });

  it('keeps a path containing spaces verbatim', () => {
    expect(parseOpen('open my holiday.png')).toEqual({ external: false, web: false, target: 'my holiday.png' });
    expect(parseOpen('open external my holiday.png')).toEqual({ external: true, web: false, target: 'my holiday.png' });
  });

  it('is case-insensitive on the keywords', () => {
    expect(parseOpen('OPEN EXTERNAL photo.png')).toEqual({ external: true, web: false, target: 'photo.png' });
  });

  it('errors with usage when no target is given', () => {
    expect(parseOpen('open')).toEqual({ error: 'Usage: open [external] [page] <target>' });
    expect(parseOpen('open external')).toEqual({ error: 'Usage: open [external] [page] <target>' });
    expect(parseOpen('open page')).toEqual({ error: 'Usage: open [external] [page] <target>' });
  });

  it('does not treat a target that merely starts with "external..." as the keyword', () => {
    // `external` must be a whole word; `externals.png` is a filename, not the external surface.
    expect(parseOpen('open externals.png')).toEqual({ external: false, web: false, target: 'externals.png' });
  });

  it('sets web:true for an https URL target', () => {
    expect(parseOpen('open https://slashdot.org')).toEqual({ external: false, web: true, target: 'https://slashdot.org' });
  });

  it('sets web:true for an http URL target', () => {
    // eslint-disable-next-line unicorn/prefer-https
    const httpUrl = 'http://example.com';
    expect(parseOpen(`open ${httpUrl}`)).toEqual({ external: false, web: true, target: httpUrl });
  });

  it('sets web:true and external:true for external + https URL', () => {
    expect(parseOpen('open external https://x.com')).toEqual({ external: true, web: true, target: 'https://x.com' });
  });

  it('sets web:true for the page keyword with a bare domain', () => {
    expect(parseOpen('open page slashdot.org')).toEqual({ external: false, web: true, target: 'slashdot.org' });
  });

  it('sets web:true for page keyword with https URL', () => {
    expect(parseOpen('open page https://slashdot.org')).toEqual({ external: false, web: true, target: 'https://slashdot.org' });
  });

  it('accepts external and page keywords in either order', () => {
    expect(parseOpen('open external page slashdot.org')).toEqual({ external: true, web: true, target: 'slashdot.org' });
    expect(parseOpen('open page external slashdot.org')).toEqual({ external: true, web: true, target: 'slashdot.org' });
  });

  it('does not treat a target starting with "page..." as the keyword', () => {
    expect(parseOpen('open pages/index.html')).toEqual({ external: false, web: false, target: 'pages/index.html' });
  });
});

describe('isGlobPattern', () => {
  it('detects shell wildcard metacharacters', () => {
    expect(isGlobPattern('*.png')).toBe(true);
    expect(isGlobPattern('shot-?.jpg')).toBe(true);
    expect(isGlobPattern('img[0-9].png')).toBe(true);
    expect(isGlobPattern('photo.{png,jpg}')).toBe(true);
  });

  it('treats a plain path as a single literal target', () => {
    expect(isGlobPattern('photo.png')).toBe(false);
    expect(isGlobPattern('/abs/path/with spaces.png')).toBe(false);
  });
});
