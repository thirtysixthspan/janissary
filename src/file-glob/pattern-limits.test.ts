import { describe, it, expect } from 'vitest';
import {
  FILE_GLOB_MAX_ALTERNATIVES,
  FILE_GLOB_MAX_NAME_STARS,
  FILE_GLOB_MAX_PATTERN_LENGTH,
  isGlobPatternTooComplex,
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
});
