import { describe, expect, it } from 'vitest';
import {
  joinCommandPaths, joinEditorPaths, relativeNavigatorPath, remoteNavigatorPath,
} from './file-navigator-relative-path';

describe('relativeNavigatorPath', () => {
  it.each([
    ['/work', 'src/a.ts', '/work', 'src/a.ts'],
    ['/work/project', 'a.ts', '/work', 'project/a.ts'],
    ['/work', 'src/a.ts', '/work/project', '../src/a.ts'],
    ['/work/one', 'a.ts', '/work/two', '../one/a.ts'],
    ['/work', '', '/work', '.'],
  ])('maps %s and %s from %s', (root, source, cwd, expected) => {
    expect(relativeNavigatorPath(root, source, cwd)).toBe(expected);
  });

  it('joins multiple paths in source order', () => {
    expect(joinCommandPaths('/work', ['a.ts', 'src/b.ts'], '/work')).toBe('a.ts src/b.ts');
  });

  it('qualifies remote paths with their host', () => {
    expect(joinCommandPaths('/remote/ws', ['a.ts', 'src/b.ts'], '/local', 'devbox'))
      .toBe('devbox:/remote/ws/a.ts devbox:/remote/ws/src/b.ts');
  });

  it('keeps the host-qualified form when the remote root is slash', () => {
    expect(remoteNavigatorPath('devbox', '/', 'tmp/a.txt')).toBe('devbox:/tmp/a.txt');
  });
});

describe('joinEditorPaths', () => {
  it('leaves a single tree-relative path as it is', () => {
    expect(joinEditorPaths('/work', ['src/a.ts'])).toBe('src/a.ts');
  });

  it('separates several paths with newlines in source order', () => {
    expect(joinEditorPaths('/work', ['a.ts', 'src/b.ts'])).toBe('a.ts\nsrc/b.ts');
  });

  it('qualifies remote paths with their host, one per line', () => {
    expect(joinEditorPaths('/remote/ws', ['a.ts', 'src/b.ts'], 'devbox'))
      .toBe('devbox:/remote/ws/a.ts\ndevbox:/remote/ws/src/b.ts');
  });

  it('produces nothing for an empty list', () => {
    expect(joinEditorPaths('/work', [])).toBe('');
  });
});
