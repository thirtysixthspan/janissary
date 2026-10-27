import { describe, expect, it } from 'vitest';
import { toTreePath } from './view-paths.js';
import { expandUserPath } from '../paths.js';

const root = '/home/user/project';
const expand = (input: string) => expandUserPath(input, { root, home: '/home/user' });

describe('toTreePath', () => {
  it('normalizes relative paths', () => {
    expect(toTreePath('./src', root, expand)).toBe('src');
    expect(toTreePath('src/', root, expand)).toBe('src');
    expect(toTreePath('src//a', root, expand)).toBe('src/a');
  });

  it('converts absolute, home, and launch-root paths that land inside the tree', () => {
    expect(toTreePath(`${root}/src`, root, expand)).toBe('src');
    expect(toTreePath('~/project/src', root, expand)).toBe('src');
    expect(toTreePath('$root/src', root, expand)).toBe('src');
  });

  it('keeps the parent row, maps the tree root to an empty path, and drops outside paths', () => {
    expect(toTreePath('..', root, expand)).toBe('..');
    expect(toTreePath('.', root, expand)).toBe('');
    expect(toTreePath(root, root, expand)).toBe('');
    expect(toTreePath('../outside', root, expand)).toBeUndefined();
    expect(toTreePath('/home/user/elsewhere', root, expand)).toBeUndefined();
  });
});
