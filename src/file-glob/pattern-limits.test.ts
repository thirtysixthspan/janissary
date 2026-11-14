import { describe, it, expect } from 'vitest';
import {
  FILE_GLOB_MANY_ALTERNATIVES_NAME_STARS,
  FILE_GLOB_MAX_ALTERNATIVES,
  FILE_GLOB_MAX_ALTERNATIVES_AT_MAX_STARS,
  FILE_GLOB_MAX_NAME_STARS,
  FILE_GLOB_MAX_PATTERN_LENGTH,
  FILE_GLOB_PARENT_SEGMENT,
  FILE_GLOB_TOO_COMPLEX,
  globPatternRefusal,
  isGlobPatternTooComplex,
  normalizeGlobPattern,
} from './pattern-limits.js';

describe('isGlobPatternTooComplex', () => {
  it('allows ordinary patterns', () => {
    for (const pattern of ['**/*.test.ts', '*.{js,md}', '*-*-*.ts', '{*.ts,*.js,*.md,*.json}', '?.ts', '**/a/**/b/**']) {
      expect(isGlobPatternTooComplex(pattern)).toBe(false);
    }
  });

  it('caps the pattern length', () => {
    expect(isGlobPatternTooComplex('a'.repeat(FILE_GLOB_MAX_PATTERN_LENGTH))).toBe(false);
    expect(isGlobPatternTooComplex('a'.repeat(FILE_GLOB_MAX_PATTERN_LENGTH + 1))).toBe(true);
  });

  it('caps the * wildcards in one name', () => {
    expect(isGlobPatternTooComplex('*a'.repeat(FILE_GLOB_MAX_NAME_STARS))).toBe(false);
    expect(isGlobPatternTooComplex('*a'.repeat(FILE_GLOB_MAX_NAME_STARS + 1))).toBe(true);
    expect(isGlobPatternTooComplex('*?*?*?*?*?*?*?*?*?*?*?*?Z')).toBe(true);
  });

  it('counts stars per name, skipping globstars and counting a run once', () => {
    expect(isGlobPatternTooComplex('*a*/*b*/**/*c*')).toBe(false);
    expect(isGlobPatternTooComplex('**/**/**/**/x')).toBe(false);
    expect(isGlobPatternTooComplex('***a***b***')).toBe(false);
    expect(isGlobPatternTooComplex(String.raw`*a*\*b*`)).toBe(false);
  });

  it('counts stars within each {a,b} alternative', () => {
    expect(isGlobPatternTooComplex('{*a*a*,b}')).toBe(false);
    expect(isGlobPatternTooComplex('{*a*a*a*,b}')).toBe(true);
    expect(isGlobPatternTooComplex('*a*{*,b}')).toBe(false);
    expect(isGlobPatternTooComplex('*a*a{*b,c}*')).toBe(true);
  });

  it('caps the number of {a,b} combinations', () => {
    expect(2 ** 6).toBe(FILE_GLOB_MAX_ALTERNATIVES);
    expect(isGlobPatternTooComplex('{a,b}'.repeat(6))).toBe(false);
    expect(isGlobPatternTooComplex('{a,b}'.repeat(6) + '{c,d}')).toBe(true);
    expect(isGlobPatternTooComplex('{a,b}'.repeat(30))).toBe(true);
  });

  it('allows three * wildcards in one name only up to two {a,b} combinations', () => {
    expect(FILE_GLOB_MAX_ALTERNATIVES_AT_MAX_STARS).toBe(2);
    expect(isGlobPatternTooComplex('*-*-*.{ts,js}')).toBe(false);
    expect(isGlobPatternTooComplex('*-*-*.{ts,js,md}')).toBe(true);
    expect(isGlobPatternTooComplex('*a*a*' + '{b,c}'.repeat(6))).toBe(true);
  });

  it('normalizes each backslash to the / separator minimatch reads it as', () => {
    expect(normalizeGlobPattern(String.raw`a\{b,c}\*.ts`)).toBe('a/{b,c}/*.ts');
    expect(normalizeGlobPattern('src/*.ts')).toBe('src/*.ts');
  });

  it('counts {a,b} combinations behind a backslash', () => {
    const group = String.raw`\{a,b}`;
    expect(isGlobPatternTooComplex('x' + group.repeat(6))).toBe(false);
    expect(isGlobPatternTooComplex('x' + group.repeat(7))).toBe(true);
    expect(isGlobPatternTooComplex('x' + group.repeat(16))).toBe(true);
  });

  it('counts three-star alternatives behind a backslash toward the combined budget', () => {
    expect(isGlobPatternTooComplex(String.raw`*a*a*\{b,c}`)).toBe(false);
    expect(isGlobPatternTooComplex(String.raw`*a*a*\{b,c,d}`)).toBe(true);
  });

  it('refuses a .. folder in any alternative, after backslashes become separators', () => {
    for (const pattern of ['../a', 'a/..', '**/../a/b/c', '{..,x}/a', '.{.,}/a', String.raw`a\..\b`, '**/../a/b/'.repeat(13) + 'c']) {
      expect(globPatternRefusal(pattern)).toBe(FILE_GLOB_PARENT_SEGMENT);
      expect(isGlobPatternTooComplex(pattern)).toBe(true);
    }
  });

  it('allows names that only contain dots', () => {
    for (const pattern of ['..a', 'a..', '...', '.env', '**/.github/**', 'src/./a.ts']) {
      expect(globPatternRefusal(pattern)).toBeUndefined();
    }
  });

  it('keeps the too-complex refusal for the other caps', () => {
    expect(globPatternRefusal('a'.repeat(FILE_GLOB_MAX_PATTERN_LENGTH + 1))).toBe(FILE_GLOB_TOO_COMPLEX);
    expect(globPatternRefusal('{a,b}'.repeat(7))).toBe(FILE_GLOB_TOO_COMPLEX);
    expect(globPatternRefusal('*a'.repeat(4))).toBe(FILE_GLOB_TOO_COMPLEX);
  });

  it('keeps two * wildcards in one name legal at the full combination cap', () => {
    const groups = '{b,c}'.repeat(6);
    expect(isGlobPatternTooComplex('*a'.repeat(FILE_GLOB_MANY_ALTERNATIVES_NAME_STARS) + groups)).toBe(false);
    expect(isGlobPatternTooComplex('*a'.repeat(FILE_GLOB_MANY_ALTERNATIVES_NAME_STARS + 1) + groups)).toBe(true);
    expect(isGlobPatternTooComplex('*a*a*/' + groups)).toBe(true);
  });
});
