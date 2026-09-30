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

  it('anchors a leading ./ on a glob as well as on a path', () => {
    // `./` is stripped before the glob is tried, so the anchoring a bare directory name has always
    // had covers every pattern rather than only the one form with no wildcard in it.
    expect(filterPaths(files, './src/**', '')).toEqual(['src/a.ts', 'src/nested/b.ts', 'src/a.test.ts']);
    expect(filterPaths(['lib/src/a.ts', 'src/b.ts', 'docs/c.md'], './src/**', '')).toEqual(['src/b.ts']);
  });

  it('reads a trailing slash and a backslash as the path separator', () => {
    // Both are how a user writes a path that names a directory, and both arrive as forward-slashed
    // project-relative paths on the other side of the match.
    expect(filterPaths(files, 'src/*/', '')).toEqual(['src/a.ts', 'src/a.test.ts']);
    expect(filterPaths(files, String.raw`src\**`, '')).toEqual(['src/a.ts', 'src/nested/b.ts', 'src/a.test.ts']);
  });

  it('excludes by prefix and by glob', () => {
    expect(filterPaths(files, '', 'src')).toEqual(['docs/a.md', 'Makefile']);
    expect(filterPaths(files, '', '**/*.test.ts')).toEqual(['src/a.ts', 'src/nested/b.ts', 'docs/a.md', 'Makefile']);
  });

  it('reads a bare wildcard as naming the file at any depth', () => {
    // The thing a user means by `*.test.ts` is every test file, and the thing they mean by `*.ts` is
    // every source file — not the two that happen to sit at the project root.
    expect(filterPaths(files, '', '*.test.ts')).toEqual(['src/a.ts', 'src/nested/b.ts', 'docs/a.md', 'Makefile']);
    expect(filterPaths(files, '*.ts', '')).toEqual(['src/a.ts', 'src/nested/b.ts', 'src/a.test.ts']);
  });

  it('reads a bare character class at any depth too', () => {
    // A character class names a file the way `*` does, so it takes the same second attempt and
    // reaches the same files in `src/` that it reaches at the project root.
    expect(filterPaths(files, '', '[ab].ts')).toEqual(['src/a.test.ts', 'docs/a.md', 'Makefile']);
    expect(filterPaths(files, '', '?s')).toEqual(files);
  });

  it('keeps a * inside a pattern that names a directory from crossing a boundary', () => {
    // The other half of the rule: a pattern that says where to look is a statement about that place,
    // so `src/*.ts` is about `src/` and nothing below it.
    expect(filterPaths(files, 'src/*.ts', '')).toEqual(['src/a.ts', 'src/a.test.ts']);
  });

  it('accepts several comma-separated patterns in either field', () => {
    expect(filterPaths(files, 'docs, Makefile', '')).toEqual(['docs/a.md', 'Makefile']);
    expect(filterPaths(files, '', 'src, docs')).toEqual(['Makefile']);
  });

  it('reads the comma as a separator and never as part of a pattern', () => {
    // A brace pattern has a comma in it, and the comma is what separates patterns — so `*.{ts,md}`
    // is two patterns neither of which compiles to anything, and neither field can narrow by a
    // brace list. Documented here so the field's syntax and the second attempt below cannot be
    // confused for support of one another.
    expect(filterPaths(files, '*.{ts,md}', '')).toEqual([]);
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
