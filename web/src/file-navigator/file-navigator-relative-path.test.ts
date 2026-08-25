import { describe, expect, it } from 'vitest';
import { joinCommandPaths, relativeNavigatorPath } from './file-navigator-relative-path';

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
});
