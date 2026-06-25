import { describe, it, expect } from 'vitest';
import { abbreviatePath } from './paths.js';

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
