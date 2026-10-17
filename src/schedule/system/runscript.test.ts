import { describe, expect, it } from 'vitest';
import { isRunscriptName, parseRunscriptText } from './runscript.js';

describe('runscript text', () => {
  it('keeps one command per physical line and preserves meaningful text', () => {
    expect(parseRunscriptText('  # note\r\n\r\n  echo hi  # inline\nif true; then\n  echo yes\nfi\n'))
      .toEqual(['  echo hi  # inline', 'if true; then', '  echo yes', 'fi']);
  });

  it('accepts only lowercase hyphen-separated words', () => {
    for (const valid of ['morning-checks', 'a1', '1-a']) expect(isRunscriptName(valid)).toBe(true);
    for (const invalid of ['', '.', '..', 'a/b', String.raw`a\b`, 'Name', 'a--b', 'a.rs', 'a b']) {
      expect(isRunscriptName(invalid)).toBe(false);
    }
  });
});
