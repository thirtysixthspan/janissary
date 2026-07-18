import { describe, it, expect } from 'vitest';
import type { FileTreeRow } from '@shared/protocol';
import { fileTreeRowClass } from './file-tree-row-class';

const row = (overrides: Partial<FileTreeRow> = {}): FileTreeRow => ({
  path: 'src/index.ts', name: 'index.ts', depth: 1, dir: false, ...overrides,
});

describe('fileTreeRowClass', () => {
  it('adds files-name--changed to the name class when the row is changed', () => {
    expect(fileTreeRowClass(row({ gitStatus: 'changed' }), null, undefined).name).toContain('files-name--changed');
  });

  it('adds files-name--staged to the name class when the row is staged', () => {
    expect(fileTreeRowClass(row({ gitStatus: 'staged' }), null, undefined).name).toContain('files-name--staged');
  });

  it('adds files-name--conflict to the name class when the row is conflicted', () => {
    expect(fileTreeRowClass(row({ gitStatus: 'conflict' }), null, undefined).name).toContain('files-name--conflict');
  });

  it('omits every status modifier when the row has no gitStatus', () => {
    const name = fileTreeRowClass(row(), null, undefined).name;
    expect(name).not.toContain('files-name--changed');
    expect(name).not.toContain('files-name--staged');
    expect(name).not.toContain('files-name--conflict');
  });

  it('preserves the selected modifier on the row class', () => {
    expect(fileTreeRowClass(row(), 'src/index.ts', undefined).row).toContain('selected');
  });

  it('preserves the drop-target modifier on the row class', () => {
    expect(fileTreeRowClass(row(), null, 'src/index.ts').row).toContain('drop-target');
  });

  it('leaves the row class free of modifiers when neither selected nor a drop target', () => {
    const cls = fileTreeRowClass(row(), null, undefined);
    expect(cls.row).toBe('files-row');
    expect(cls.name).toBe('files-name');
  });
});
