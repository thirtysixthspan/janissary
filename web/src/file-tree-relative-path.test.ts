import { describe, it, expect } from 'vitest';
import { relativePath } from './file-tree-relative-path';

describe('relativePath', () => {
  it('returns just the name for a target in the same directory', () => {
    expect(relativePath('/home/user/project', '/home/user/project/notes.txt')).toBe('notes.txt');
  });

  it('resolves a target nested several levels under the base', () => {
    expect(relativePath('/home/user/project', '/home/user/project/src/lib/util.ts')).toBe('src/lib/util.ts');
  });

  it('resolves a base nested several levels under the target', () => {
    expect(relativePath('/home/user/project/src/lib', '/home/user/project')).toBe('../..');
  });

  it('resolves sibling directories requiring .. segments', () => {
    expect(relativePath('/home/user/project-a', '/home/user/project-b/notes.txt')).toBe('../project-b/notes.txt');
  });

  it('returns an empty string when base and target are identical', () => {
    expect(relativePath('/home/user/project', '/home/user/project')).toBe('');
  });
});
