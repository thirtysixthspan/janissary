import { describe, expect, it } from 'vitest';
import { filterPaths } from './filter-paths.js';

const files = [
  'src/a.ts',
  'src/nested/b.ts',
  'src/a.test.ts',
  'docs/a.md',
  'Makefile',
];

describe('filterPaths', () => {
  it('returns everything when both fields are empty', () => {
    expect(filterPaths(files, '', '')).toEqual(files);
  });

  it('treats whitespace-only fields as empty', () => {
    expect(filterPaths(files, '  ', ' , ')).toEqual(files);
  });

  it('includes a directory prefix and everything beneath it', () => {
    expect(filterPaths(files, 'src', '')).toEqual(['src/a.ts', 'src/nested/b.ts', 'src/a.test.ts']);
  });

  it('includes a glob at any depth', () => {
    expect(filterPaths(files, '**/*.ts', '')).toEqual(['src/a.ts', 'src/nested/b.ts', 'src/a.test.ts']);
  });

  it('anchors a leading ./ to the launch directory', () => {
    expect(filterPaths(files, './src', '')).toEqual(['src/a.ts', 'src/nested/b.ts', 'src/a.test.ts']);
    expect(filterPaths(['lib/src/a.ts', 'src/b.ts'], './src', '')).toEqual(['src/b.ts']);
  });

  it('excludes by prefix and by glob', () => {
    expect(filterPaths(files, '', 'src')).toEqual(['docs/a.md', 'Makefile']);
    expect(filterPaths(files, '', '**/*.test.ts')).toEqual(['src/a.ts', 'src/nested/b.ts', 'docs/a.md', 'Makefile']);
  });

  it('does not let a bare * cross a directory boundary', () => {
    expect(filterPaths(files, '', '*.test.ts')).toEqual(files);
  });

  it('accepts several comma-separated patterns in either field', () => {
    expect(filterPaths(files, 'docs, Makefile', '')).toEqual(['docs/a.md', 'Makefile']);
    expect(filterPaths(files, '', 'src, docs')).toEqual(['Makefile']);
  });

  it('trims whitespace around each pattern', () => {
    expect(filterPaths(files, '  docs ,  Makefile  ', '')).toEqual(['docs/a.md', 'Makefile']);
  });

  it('lets exclude win over include', () => {
    expect(filterPaths(files, 'src', '**/*.test.ts')).toEqual(['src/a.ts', 'src/nested/b.ts']);
  });

  it('selects nothing when an include matches no file', () => {
    expect(filterPaths(files, 'nowhere', '')).toEqual([]);
  });

  it('selects nothing when an include pattern does not compile', () => {
    expect(filterPaths(files, 'src/[', '')).toEqual([]);
  });

  it('includes an extensionless file named exactly', () => {
    expect(filterPaths(files, 'Makefile', '')).toEqual(['Makefile']);
  });

  it('does not select a file whose name merely starts with the pattern', () => {
    expect(filterPaths(['src/abc.ts'], 'src/ab', '')).toEqual([]);
  });
});
