import { describe, it, expect } from 'vitest';
import { parseOpen, isGlobPattern } from './open.js';

describe('parseOpen', () => {
  it('parses an inline open', () => {
    expect(parseOpen('open photo.png')).toEqual({ external: false, path: 'photo.png' });
  });

  it('parses an external open', () => {
    expect(parseOpen('open external photo.png')).toEqual({ external: true, path: 'photo.png' });
  });

  it('keeps a path containing spaces verbatim', () => {
    expect(parseOpen('open my holiday.png')).toEqual({ external: false, path: 'my holiday.png' });
    expect(parseOpen('open external my holiday.png')).toEqual({ external: true, path: 'my holiday.png' });
  });

  it('is case-insensitive on the keywords', () => {
    expect(parseOpen('OPEN EXTERNAL photo.png')).toEqual({ external: true, path: 'photo.png' });
  });

  it('errors with usage when no path is given', () => {
    expect(parseOpen('open')).toEqual({ error: 'Usage: open [external] <path>' });
    expect(parseOpen('open external')).toEqual({ error: 'Usage: open [external] <path>' });
  });

  it('does not treat a path that merely starts with "external..." as the keyword', () => {
    // `external` must be a whole word; `externals.png` is a filename, not the external surface.
    expect(parseOpen('open externals.png')).toEqual({ external: false, path: 'externals.png' });
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
