import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { containedAbsolute, containedPath, containedStrictly } from './path-containment.js';

describe('containedAbsolute', () => {
  it('counts the root itself and anything beneath it', () => {
    expect(containedAbsolute('/repo', '/repo')).toBe(true);
    expect(containedAbsolute('/repo', '/repo/src/a.ts')).toBe(true);
    expect(containedAbsolute('/repo/', '/repo/src')).toBe(true);
  });

  it('refuses .. and anything beneath it', () => {
    expect(containedAbsolute('/repo', '/')).toBe(false);
    expect(containedAbsolute('/repo', '/repo/..')).toBe(false);
    expect(containedAbsolute('/repo', '/repo/../x')).toBe(false);
    expect(containedAbsolute('/repo', '/repo/src/../../etc/passwd')).toBe(false);
  });

  it('refuses a sibling whose name merely starts with the root\'s', () => {
    expect(containedAbsolute('/repo', '/repo-evil')).toBe(false);
    expect(containedAbsolute('/repo', '/repo-evil/a.ts')).toBe(false);
  });

  it('accepts a child whose name merely starts with ..', () => {
    expect(containedAbsolute('/repo', '/repo/..notes')).toBe(true);
    expect(containedAbsolute('/repo', '/repo/..notes/a.md')).toBe(true);
  });

  it('compares tree-relative paths the same way', () => {
    expect(containedAbsolute('src', 'src')).toBe(true);
    expect(containedAbsolute('src', 'src/nested')).toBe(true);
    expect(containedAbsolute('src', 'other')).toBe(false);
    expect(containedAbsolute('src', 'src-backup')).toBe(false);
    expect(containedAbsolute('src', 'src/../other')).toBe(false);
  });

  it('treats an empty root as the process directory', () => {
    expect(containedAbsolute('', path.join(process.cwd(), 'a.ts'))).toBe(true);
    expect(containedAbsolute('', path.dirname(process.cwd()))).toBe(false);
  });
});

describe('containedStrictly', () => {
  it('excludes the root itself', () => {
    expect(containedStrictly('/repo', '/repo')).toBe(false);
    expect(containedStrictly('/repo/', '/repo')).toBe(false);
  });

  it('accepts anything beneath the root, a ..notes child included', () => {
    expect(containedStrictly('/repo', '/repo/src')).toBe(true);
    expect(containedStrictly('/repo', '/repo/..notes')).toBe(true);
  });

  it('refuses .., a path beneath it, and a prefix-sharing sibling', () => {
    expect(containedStrictly('/repo', '/repo/..')).toBe(false);
    expect(containedStrictly('/repo', '/repo/../x')).toBe(false);
    expect(containedStrictly('/repo', '/repo-evil')).toBe(false);
  });

  it('treats an empty root as the process directory', () => {
    expect(containedStrictly('', process.cwd())).toBe(false);
    expect(containedStrictly('', path.join(process.cwd(), 'a.ts'))).toBe(true);
  });
});

describe('containedPath', () => {
  it('resolves a relative path inside the root', () => {
    expect(containedPath('/repo', 'src/a.ts')).toBe('/repo/src/a.ts');
    expect(containedPath('/repo', '..notes')).toBe('/repo/..notes');
  });

  it('refuses an empty path, the root, and ..', () => {
    expect(containedPath('/repo', '')).toBeUndefined();
    expect(containedPath('/repo', '.')).toBeUndefined();
    expect(containedPath('/repo', '..')).toBeUndefined();
  });

  it('refuses a path that escapes the root', () => {
    expect(containedPath('/repo', '../x')).toBeUndefined();
    expect(containedPath('/repo', '../repo-evil/a.ts')).toBeUndefined();
    expect(containedPath('/repo', 'src/../../x')).toBeUndefined();
  });

  it('refuses an absolute path, even one inside the root', () => {
    expect(containedPath('/repo', '/repo/src')).toBeUndefined();
    expect(containedPath('/repo', '/etc/passwd')).toBeUndefined();
  });

  it('resolves against the process directory for an empty root', () => {
    expect(containedPath('', 'a.ts')).toBe(path.join(process.cwd(), 'a.ts'));
  });
});
