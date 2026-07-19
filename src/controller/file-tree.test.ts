import { describe, it, expect } from 'vitest';
import {
  fileTreeToggle,
  fileTreeCollapseAll,
  fileTreeReroot,
  moveFileTreeItem,
  deleteFileTreeItem,
  undoFileTreeItem,
  redoFileTreeItem,
} from './file-tree.js';
import type { Managers } from '../managers.js';

function makeManagers(label: string | undefined, fileTree: Record<string, (...args: unknown[]) => unknown>) {
  return {
    tab: { tabs: label === undefined ? [] : [{ label }] },
    fileTree,
  } as unknown as Managers;
}

describe('controller-file-tree', () => {
  it('fileTreeToggle delegates to FileTreeManager.toggle when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { toggle: (...args: unknown[]) => { calls.push(args); } });
    fileTreeToggle(managers, 0, 'src/foo.ts');
    expect(calls).toEqual([['agent', 'src/foo.ts']]);
  });

  it('fileTreeToggle is a no-op when the tab index has no label', () => {
    const calls: unknown[] = [];
    const managers = makeManagers(undefined, { toggle: (...args: unknown[]) => { calls.push(args); } });
    fileTreeToggle(managers, 0, 'src/foo.ts');
    expect(calls).toHaveLength(0);
  });

  it('fileTreeCollapseAll delegates to FileTreeManager.collapseAll when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { collapseAll: (...args: unknown[]) => { calls.push(args); } });
    fileTreeCollapseAll(managers, 0);
    expect(calls).toEqual([['agent']]);
  });

  it('fileTreeReroot delegates to FileTreeManager.reroot when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { reroot: (...args: unknown[]) => { calls.push(args); } });
    fileTreeReroot(managers, 0, 'sub/dir');
    expect(calls).toEqual([['agent', 'sub/dir']]);
  });

  it('moveFileTreeItem delegates to FileTreeManager.move when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { move: (...args: unknown[]) => { calls.push(args); } });
    moveFileTreeItem(managers, 0, 'a.ts', 'b.ts');
    expect(calls).toEqual([['agent', 'a.ts', 'b.ts']]);
  });

  it('deleteFileTreeItem delegates to FileTreeManager.delete when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { delete: (...args: unknown[]) => { calls.push(args); } });
    deleteFileTreeItem(managers, 0, 'a.ts');
    expect(calls).toEqual([['agent', 'a.ts']]);
  });

  it('undoFileTreeItem returns the manager result when the tab exists', () => {
    const conflict = { fromRelPath: 'a.ts', toRelPath: 'b.ts' };
    const managers = makeManagers('agent', { undo: () => ({ conflict }) });
    const result = undoFileTreeItem(managers, 0, true);
    expect(result).toEqual({ conflict });
  });

  it('undoFileTreeItem returns an empty object when the tab index has no label', () => {
    const managers = makeManagers(undefined, { undo: () => ({ conflict: { fromRelPath: 'a', toRelPath: 'b' } }) });
    const result = undoFileTreeItem(managers, 0);
    expect(result).toEqual({});
  });

  it('redoFileTreeItem returns the manager result when the tab exists', () => {
    const conflict = { fromRelPath: 'a.ts', toRelPath: 'b.ts' };
    const managers = makeManagers('agent', { redo: () => ({ conflict }) });
    const result = redoFileTreeItem(managers, 0, true);
    expect(result).toEqual({ conflict });
  });

  it('redoFileTreeItem returns an empty object when the tab index has no label', () => {
    const managers = makeManagers(undefined, { redo: () => ({ conflict: { fromRelPath: 'a', toRelPath: 'b' } }) });
    const result = redoFileTreeItem(managers, 0);
    expect(result).toEqual({});
  });
});
