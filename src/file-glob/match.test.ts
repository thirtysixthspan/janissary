import { describe, it, expect } from 'vitest';
import { createGlobMatcher } from './match.js';

const ENV_EXAMPLE = '.env.example';
const CI_WORKFLOW = '.github/workflows/ci.yml';

describe('createGlobMatcher', () => {
  it('matches ** across zero or more directory segments', () => {
    const match = createGlobMatcher('**/*.ts', false);
    expect(match('a.ts')).toBe(true);
    expect(match('x/y/b.ts')).toBe(true);
  });

  it('keeps * within one segment', () => {
    const match = createGlobMatcher('*.ts', false);
    expect(match('a.ts')).toBe(true);
    expect(match('x/a.ts')).toBe(false);
  });

  it('matches ? against exactly one character', () => {
    const match = createGlobMatcher('?.ts', false);
    expect(match('a.ts')).toBe(true);
    expect(match('ab.ts')).toBe(false);
  });

  it('expands {a,b} alternation', () => {
    const match = createGlobMatcher('{a,b}.ts', false);
    expect(match('a.ts')).toBe(true);
    expect(match('b.ts')).toBe(true);
    expect(match('c.ts')).toBe(false);
  });

  it('matches case-sensitively on every host', () => {
    expect(createGlobMatcher('*.TS', false)('a.ts')).toBe(false);
    expect(createGlobMatcher('*.ts', false)('a.TS')).toBe(false);
  });

  it('does not let wildcards match dot-names without hidden', () => {
    expect(createGlobMatcher('*', false)(ENV_EXAMPLE)).toBe(false);
    expect(createGlobMatcher('**/*', false)(CI_WORKFLOW)).toBe(false);
  });

  it('lets wildcards match dot-names with hidden', () => {
    expect(createGlobMatcher('*', true)(ENV_EXAMPLE)).toBe(true);
    expect(createGlobMatcher('**/*', true)(CI_WORKFLOW)).toBe(true);
  });

  it('matches explicit-dot patterns with and without hidden', () => {
    for (const hidden of [false, true]) {
      expect(createGlobMatcher('.*', hidden)(ENV_EXAMPLE)).toBe(true);
      expect(createGlobMatcher('**/.github/**', hidden)(CI_WORKFLOW)).toBe(true);
    }
  });

  it('answers a catastrophically backtracking pattern quickly with no match', () => {
    const match = createGlobMatcher('*?'.repeat(12) + 'Z', false);
    const started = performance.now();
    expect(match('a'.repeat(60))).toBe(false);
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('answers many three-star {a,b} alternatives quickly with no match', () => {
    const match = createGlobMatcher('*?a*?a*?' + '{b,c}'.repeat(6), false);
    const started = performance.now();
    expect(match('a'.repeat(255))).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('answers backslash-escaped brace alternatives past the cap quickly with no match', () => {
    const started = performance.now();
    const match = createGlobMatcher('x' + String.raw`\{a,b}`.repeat(16), false);
    expect(match('a'.repeat(60))).toBe(false);
    expect(match('x' + '/a'.repeat(16))).toBe(false);
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('treats a backslash as a path separator', () => {
    expect(createGlobMatcher(String.raw`a\b.ts`, false)('a/b.ts')).toBe(true);
    expect(createGlobMatcher(String.raw`a\{b,c}.ts`, false)('a/c.ts')).toBe(true);
  });

  it('matches extglob groups literally', () => {
    expect(createGlobMatcher('+(a|b).ts', false)('a.ts')).toBe(false);
    expect(createGlobMatcher('+(a|b).ts', false)('+(a|b).ts')).toBe(true);
    const started = performance.now();
    expect(createGlobMatcher('+(a|aa)'.repeat(4) + 'Z', false)('a'.repeat(60))).toBe(false);
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('treats a pattern minimatch rejects as matching nothing', () => {
    const match = createGlobMatcher('a'.repeat(70_000), false);
    expect(() => match('a')).not.toThrow();
    expect(match('a'.repeat(70_000))).toBe(false);
  });
});
