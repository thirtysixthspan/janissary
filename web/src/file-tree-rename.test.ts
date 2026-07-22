import { describe, expect, it } from 'vitest';
import { hasRenameCollision, renameResult, renameSelectionRange } from './file-tree-rename';

describe('renameResult', () => {
  it('treats unchanged and blank names as no-ops', () => {
    expect(renameResult('src/index.ts', 'index.ts')).toEqual({ type: 'noop' });
    expect(renameResult('src/index.ts', '  ')).toEqual({ type: 'noop' });
  });

  it('keeps a renamed item in its current directory', () => {
    expect(renameResult('src/index.ts', 'main.ts')).toEqual({ type: 'rename', newName: 'main.ts', newPath: 'src/main.ts' });
  });
});

describe('rename helpers', () => {
  it('finds sibling-name collisions', () => {
    expect(hasRenameCollision('main.ts', new Set(['main.ts']))).toBe(true);
    expect(hasRenameCollision('main.ts', new Set(['index.ts']))).toBe(false);
  });

  it('selects a file basename or an entire directory name', () => {
    expect(renameSelectionRange('index.ts', false)).toEqual([0, 5]);
    expect(renameSelectionRange('src', true)).toEqual([0, 3]);
  });
});
