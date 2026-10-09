import { describe, expect, it } from 'vitest';
import { createFileTokenizer } from './file-tokenize';

describe('filename-based syntax tokenization', () => {
  it.each([
    ['a.JS', 'const value = 1;', 'hljs-keyword'],
    ['a.tsx', 'const value: number = 1;', 'hljs-built_in'],
    ['a.json', '{"value": 1}', 'hljs-attr'],
    ['a.md', '# Heading', 'hljs-section'],
  ])('uses the editor language grammar for %s', (fileName, text, scope) => {
    expect(createFileTokenizer()(text, fileName).flat().some((token) => token.scope.includes(scope))).toBe(true);
  });

  it('falls back to plain text for unsupported or missing extensions', () => {
    const tokenize = createFileTokenizer();
    expect(tokenize('const value = 1;', 'a.txt')).toEqual([]);
    expect(tokenize('const value = 1;', 'README')).toEqual([]);
  });

  it('skips oversized text and recovers for a subsequent supported document', () => {
    const tokenize = createFileTokenizer();
    expect(tokenize('a'.repeat(1_000_001), 'a.js')).toEqual([]);
    expect(tokenize('\n'.repeat(10_000), 'a.js')).toEqual([]);
    expect(tokenize('const value = 1;', 'a.js')[0]).not.toEqual([]);
  });
});
