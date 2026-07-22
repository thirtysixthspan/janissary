import { describe, it, expect } from 'vitest';
import { parseHunks } from './reply-format.js';

describe('parseHunks', () => {
  it('parses a single hunk', () => {
    const reply = '[HUNK]\n[ANCHOR]: old text\n[REPLACEMENT]: new text\n[/HUNK]';
    expect(parseHunks(reply)).toEqual([{ anchor: 'old text', replacement: 'new text' }]);
  });

  it('parses multiple hunks', () => {
    const reply = [
      '[HUNK]\n[ANCHOR]: first\n[REPLACEMENT]: 1st\n[/HUNK]',
      '[HUNK]\n[ANCHOR]: second\n[REPLACEMENT]: 2nd\n[/HUNK]',
    ].join('\n');
    expect(parseHunks(reply)).toEqual([
      { anchor: 'first', replacement: '1st' },
      { anchor: 'second', replacement: '2nd' },
    ]);
  });

  it('treats an empty anchor as an insertion', () => {
    const reply = '[HUNK]\n[ANCHOR]: \n[REPLACEMENT]: appended text\n[/HUNK]';
    expect(parseHunks(reply)).toEqual([{ anchor: '', replacement: 'appended text' }]);
  });

  it('treats an empty replacement as a deletion', () => {
    const reply = '[HUNK]\n[ANCHOR]: delete me\n[REPLACEMENT]: \n[/HUNK]';
    expect(parseHunks(reply)).toEqual([{ anchor: 'delete me', replacement: '' }]);
  });

  it('returns an empty list for a reply proposing no edit', () => {
    expect(parseHunks('OK, nothing to change here.')).toEqual([]);
  });

  it('drops a malformed hunk block missing a required field', () => {
    const reply = '[HUNK]\n[ANCHOR]: only anchor, no replacement field\n[/HUNK]';
    expect(parseHunks(reply)).toEqual([]);
  });

  it('drops a partial/unterminated hunk block', () => {
    const reply = '[HUNK]\n[ANCHOR]: text\n[REPLACEMENT]: replacement, but never closed';
    expect(parseHunks(reply)).toEqual([]);
  });
});
