import { describe, it, expect } from 'vitest';
import { hljs } from './hljs';
import { languageForFile } from './registry';

describe('languageForFile', () => {
  it('maps extensions to their language, case-insensitively', () => {
    expect(languageForFile('a.md', hljs)).toBe('markdown');
    expect(languageForFile('a.MARKDOWN', hljs)).toBe('markdown');
    expect(languageForFile('a.js', hljs)).toBe('javascript');
    expect(languageForFile('a.mjs', hljs)).toBe('javascript');
    expect(languageForFile('a.cjs', hljs)).toBe('javascript');
    expect(languageForFile('a.jsx', hljs)).toBe('javascript');
    expect(languageForFile('a.ts', hljs)).toBe('typescript');
    expect(languageForFile('a.TSX', hljs)).toBe('typescript');
    expect(languageForFile('a.mts', hljs)).toBe('typescript');
    expect(languageForFile('a.cts', hljs)).toBe('typescript');
    expect(languageForFile('a.json', hljs)).toBe('json');
  });

  it('returns null for an unknown extension', () => {
    expect(languageForFile('a.txt', hljs)).toBeNull();
    expect(languageForFile('a.py', hljs)).toBeNull();
  });

  it('returns null for an extensionless name', () => {
    expect(languageForFile('README', hljs)).toBeNull();
  });
});
