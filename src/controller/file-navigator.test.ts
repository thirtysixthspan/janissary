import { describe, it, expect } from 'vitest';
import {
  fileNavigatorToggle,
  fileNavigatorCollapseAll,
  fileNavigatorReroot,
  moveFileNavigatorItem,
  deleteFileNavigatorItem,
  undoFileNavigatorItem,
  redoFileNavigatorItem,
  openFileNavigatorFor,
  fileNavigatorSearch,
  revealFileNavigatorItem,
} from './file-navigator.js';
import type { Managers } from '../managers.js';

function makeManagers(label: string | undefined, fileNavigator: Record<string, (...args: unknown[]) => unknown>) {
  return {
    tab: { tabs: label === undefined ? [] : [{ label }] },
    fileNavigator,
  } as unknown as Managers;
}

describe('controller-file-navigator', () => {
  it('fileNavigatorToggle delegates to FileNavigatorManager.toggle when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { toggle: (...args: unknown[]) => { calls.push(args); } });
    fileNavigatorToggle(managers, 0, 'src/foo.ts');
    expect(calls).toEqual([['agent', 'src/foo.ts']]);
  });

  it('fileNavigatorToggle is a no-op when the tab index has no label', () => {
    const calls: unknown[] = [];
    const managers = makeManagers(undefined, { toggle: (...args: unknown[]) => { calls.push(args); } });
    fileNavigatorToggle(managers, 0, 'src/foo.ts');
    expect(calls).toHaveLength(0);
  });

  it('fileNavigatorCollapseAll delegates to FileNavigatorManager.collapseAll when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { collapseAll: (...args: unknown[]) => { calls.push(args); } });
    fileNavigatorCollapseAll(managers, 0);
    expect(calls).toEqual([['agent']]);
  });

  it('fileNavigatorReroot delegates to FileNavigatorManager.reroot when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { reroot: (...args: unknown[]) => { calls.push(args); } });
    fileNavigatorReroot(managers, 0, 'sub/dir');
    expect(calls).toEqual([['agent', 'sub/dir']]);
  });

  it('moveFileNavigatorItem delegates to FileNavigatorManager.move when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { move: (...args: unknown[]) => { calls.push(args); } });
    moveFileNavigatorItem(managers, 0, 'a.ts', 'b.ts');
    expect(calls).toEqual([['agent', 'a.ts', 'b.ts']]);
  });

  it('deleteFileNavigatorItem delegates to FileNavigatorManager.delete when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { delete: (...args: unknown[]) => { calls.push(args); } });
    deleteFileNavigatorItem(managers, 0, 'a.ts');
    expect(calls).toEqual([['agent', 'a.ts']]);
  });

  it('undoFileNavigatorItem returns the manager result when the tab exists', () => {
    const conflict = { fromRelPath: 'a.ts', toRelPath: 'b.ts' };
    const managers = makeManagers('agent', { undo: () => ({ conflict }) });
    const result = undoFileNavigatorItem(managers, 0, true);
    expect(result).toEqual({ conflict });
  });

  it('undoFileNavigatorItem returns an empty object when the tab index has no label', () => {
    const managers = makeManagers(undefined, { undo: () => ({ conflict: { fromRelPath: 'a', toRelPath: 'b' } }) });
    const result = undoFileNavigatorItem(managers, 0);
    expect(result).toEqual({});
  });

  it('redoFileNavigatorItem returns the manager result when the tab exists', () => {
    const conflict = { fromRelPath: 'a.ts', toRelPath: 'b.ts' };
    const managers = makeManagers('agent', { redo: () => ({ conflict }) });
    const result = redoFileNavigatorItem(managers, 0, true);
    expect(result).toEqual({ conflict });
  });

  it('redoFileNavigatorItem returns an empty object when the tab index has no label', () => {
    const managers = makeManagers(undefined, { redo: () => ({ conflict: { fromRelPath: 'a', toRelPath: 'b' } }) });
    const result = redoFileNavigatorItem(managers, 0);
    expect(result).toEqual({});
  });

  it('openFileNavigatorFor delegates to FileNavigatorManager.openOrRetarget with the label', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { openOrRetarget: (...args: unknown[]) => { calls.push(args); } });
    openFileNavigatorFor(managers, 'agent');
    expect(calls).toEqual([['agent']]);
  });

  it('fileNavigatorSearch resolves the manager result when the tab exists', async () => {
    const managers = makeManagers('agent', { search: async () => ['a.ts', 'b.ts'] });
    const result = await fileNavigatorSearch(managers, 0);
    expect(result).toEqual(['a.ts', 'b.ts']);
  });

  it('fileNavigatorSearch resolves an empty array when the tab index has no label', async () => {
    const managers = makeManagers(undefined, { search: async () => ['a.ts'] });
    const result = await fileNavigatorSearch(managers, 0);
    expect(result).toEqual([]);
  });

  it('revealFileNavigatorItem delegates to FileNavigatorManager.reveal when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { reveal: (...args: unknown[]) => { calls.push(args); } });
    revealFileNavigatorItem(managers, 0, 'src/foo.ts');
    expect(calls).toEqual([['agent', 'src/foo.ts']]);
  });

  it('revealFileNavigatorItem is a no-op when the tab index has no label', () => {
    const calls: unknown[] = [];
    const managers = makeManagers(undefined, { reveal: (...args: unknown[]) => { calls.push(args); } });
    revealFileNavigatorItem(managers, 0, 'src/foo.ts');
    expect(calls).toHaveLength(0);
  });
});
