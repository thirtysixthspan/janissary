import { describe, it, expect } from 'vitest';
import { contentHash } from './save-conflict.js';

describe('contentHash', () => {
  it('is stable for the same text', () => {
    expect(contentHash('record 1\nrecord 2\n')).toBe(contentHash('record 1\nrecord 2\n'));
  });

  it('differs when the text changes, including by one character or only its length', () => {
    const base = 'record 1\nrecord 2\n';
    expect(contentHash(base)).not.toBe(contentHash('record 1\nrecord 3\n'));
    expect(contentHash(base)).not.toBe(contentHash(`${base}\n`));
    expect(contentHash('')).not.toBe(contentHash(' '));
  });

  it('distinguishes line endings, since they are part of what is on disk', () => {
    expect(contentHash('a\nb')).not.toBe(contentHash('a\r\nb'));
  });
});
