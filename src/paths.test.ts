import { describe, it, expect } from 'vitest';
import { abbreviatePath, expandUserPath } from './paths.js';

const root = '/Users/name/dev/janissary';
const home = '/Users/name';
const ab = (p: string) => abbreviatePath(p, { root, home });

describe('abbreviatePath', () => {
  it('shows the root directory itself as $root/', () => {
    expect(ab(root)).toBe('$root/');
  });

  it('abbreviates a path under the root', () => {
    expect(ab(`${root}/src/cli.ts`)).toBe('$root/src/cli.ts');
  });

  it('folds the state directory into the root, eliding .janissary', () => {
    expect(ab(`${root}/.janissary/workspace/emrah`)).toBe('$root/workspace/emrah');
  });

  it('abbreviates home elsewhere to ~', () => {
    expect(ab('/Users/name/other/file')).toBe('~/other/file');
    expect(ab(home)).toBe('~');
  });

  it('prefers $root over ~ for paths inside the root', () => {
    // The root is under home, but the more specific root prefix wins.
    expect(ab(`${root}/x`)).toBe('$root/x');
  });

  it('leaves unrelated paths unchanged', () => {
    expect(ab('/etc/hosts')).toBe('/etc/hosts');
  });

  it('does not match a sibling that merely shares the root prefix string', () => {
    // `…/janissary-extra` is not inside `…/janissary`; it falls back to the home shortcut.
    expect(ab('/Users/name/dev/janissary-extra/x')).toBe('~/dev/janissary-extra/x');
  });
});

const ex = (p: string) => expandUserPath(p, { root, home });

describe('expandUserPath', () => {
  it('expands $root to the project root directory', () => {
    expect(ex('$root')).toBe(root);
  });

  it('expands $root/ to the project root directory', () => {
    expect(ex('$root/')).toBe(root);
  });

  it('expands a path starting with $root/', () => {
    expect(ex('$root/src/cli.ts')).toBe(`${root}/src/cli.ts`);
  });

  it('expands ~ to the home directory', () => {
    expect(ex('~')).toBe(home);
  });

  it('expands a path starting with ~/', () => {
    expect(ex('~/other/file')).toBe(`${home}/other/file`);
  });

  it('leaves unrelated absolute paths unchanged', () => {
    expect(ex('/etc/hosts')).toBe('/etc/hosts');
  });

  it('leaves paths starting with neither ~ nor $root unchanged', () => {
    expect(ex('src/cli.ts')).toBe('src/cli.ts');
  });

  it('does not expand $root inside a longer token', () => {
    expect(ex('some-$root/path')).toBe('some-$root/path');
  });

  it('does not expand ~ in mid-path', () => {
    expect(ex('/home/~user/file')).toBe('/home/~user/file');
  });
});
