import { describe, it, expect, vi } from 'vitest';
import {
  fileNavigatorToggle,
  fileNavigatorCollapseAll,
  fileNavigatorPull,
  fileNavigatorReroot,
  moveFileNavigatorItem,
  moveFileNavigatorItems,
  deleteFileNavigatorItem,
  deleteFileNavigatorItems,
  undoFileNavigatorItem,
  redoFileNavigatorItem,
  openFileNavigatorFor,
  fileNavigatorSearch,
  revealFileNavigatorItem,
  renameFileNavigatorItem,
  fileNavigatorOpeners,
} from './file-navigator.js';
import { NOTIFICATIONS_LABEL } from '../notifications-tab.js';
import type { Managers } from '../managers.js';

function makeManagers(label: string | undefined, fileNavigator: Record<string, (...args: unknown[]) => unknown>) {
  return {
    tab: { tabs: label === undefined ? [] : [{ label }] },
    fileNavigator,
  } as unknown as Managers;
}

// A managers mock whose tab list includes an open notifications tab, so `reportOperationFailure`
// actually appends — used by the tests that assert on notification posting.
function makeManagersWithNotifications(
  label: string,
  fileNavigator: Record<string, (...args: unknown[]) => unknown>,
  append: (...args: unknown[]) => void,
) {
  const notif = { label: NOTIFICATIONS_LABEL, view: 'notifications', log: [] };
  const active = { label, log: [] };
  return {
    tab: { tabs: [active, notif], cur: () => active, append },
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

  it('fileNavigatorPull delegates to FileNavigatorManager.pull when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { pull: (...args: unknown[]) => { calls.push(args); } });
    fileNavigatorPull(managers, 0);
    expect(calls).toEqual([['agent']]);
  });

  it('fileNavigatorPull is a no-op when the tab index has no label', () => {
    const calls: unknown[] = [];
    const managers = makeManagers(undefined, { pull: (...args: unknown[]) => { calls.push(args); } });
    fileNavigatorPull(managers, 0);
    expect(calls).toHaveLength(0);
  });

  it('fileNavigatorReroot delegates to FileNavigatorManager.reroot when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { reroot: (...args: unknown[]) => { calls.push(args); } });
    fileNavigatorReroot(managers, 0, 'sub/dir');
    expect(calls).toEqual([['agent', 'sub/dir']]);
  });

  it('moveFileNavigatorItem delegates to FileNavigatorManager.move when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', {
      move: (...args: unknown[]) => { calls.push(args); return { total: 1, failedPaths: [] }; },
    });
    moveFileNavigatorItem(managers, 0, 'a.ts', 'b.ts');
    expect(calls).toEqual([['agent', 'a.ts', 'b.ts']]);
  });

  it('deleteFileNavigatorItem delegates to FileNavigatorManager.delete when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', {
      delete: (...args: unknown[]) => { calls.push(args); return { total: 1, failedPaths: [] }; },
    });
    deleteFileNavigatorItem(managers, 0, 'a.ts');
    expect(calls).toEqual([['agent', 'a.ts']]);
  });

  it('moveFileNavigatorItem posts one notification when the move fails', () => {
    const append = vi.fn();
    const managers = makeManagersWithNotifications('agent', {
      move: () => ({ total: 1, failedPaths: ['a.ts'] }),
    }, append);
    moveFileNavigatorItem(managers, 0, 'a.ts', 'b.ts');
    expect(append).toHaveBeenCalledTimes(1);
  });

  it('deleteFileNavigatorItem posts one notification when the delete fails', () => {
    const append = vi.fn();
    const managers = makeManagersWithNotifications('agent', {
      delete: () => ({ total: 1, failedPaths: ['a.ts'] }),
    }, append);
    deleteFileNavigatorItem(managers, 0, 'a.ts');
    expect(append).toHaveBeenCalledTimes(1);
  });

  it('undoFileNavigatorItem posts no notification when the result is a conflict', () => {
    const append = vi.fn();
    const conflict = { fromRelPath: 'a.ts', toRelPath: 'b.ts' };
    const managers = makeManagersWithNotifications('agent', { undo: () => ({ conflict }) }, append);
    undoFileNavigatorItem(managers, 0);
    expect(append).not.toHaveBeenCalled();
  });

  it('moveFileNavigatorItems delegates to FileNavigatorManager.moveMany', () => {
    const managers = makeManagers('agent', {
      moveMany: (...args: unknown[]) => ({ total: args.length, failedPaths: [] }),
    });
    const result = moveFileNavigatorItems(managers, 0, ['a', 'b'], 'dest', 'skip-conflicts');
    expect(result).toEqual({ total: 4, failedPaths: [] });
  });

  it('moveFileNavigatorItems returns a structured result for a missing tab', () => {
    const managers = makeManagers(undefined, { moveMany: () => ({ conflictPaths: ['a'] }) });
    expect(moveFileNavigatorItems(managers, 0, ['a'], 'dest')).toEqual({ total: 0, failedPaths: [] });
  });

  it('deleteFileNavigatorItems delegates and handles a missing tab', () => {
    const managers = makeManagers('agent', {
      deleteMany: (...args: unknown[]) => ({ total: (args[1] as string[]).length, failedPaths: [] }),
    });
    expect(deleteFileNavigatorItems(managers, 0, ['a', 'b'])).toEqual({ total: 2, failedPaths: [] });
    expect(deleteFileNavigatorItems(makeManagers(undefined, {}), 0, ['a'])).toEqual({
      total: 0,
      failedPaths: [],
    });
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

  it('renameFileNavigatorItem delegates to FileNavigatorManager.rename when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', {
      rename: (...args: unknown[]) => { calls.push(args); return { total: 1, failedPaths: [] }; },
    });
    renameFileNavigatorItem(managers, 0, 'src/foo.ts', 'bar.ts');
    expect(calls).toEqual([['agent', 'src/foo.ts', 'bar.ts']]);
  });

  it('renameFileNavigatorItem posts one notification with the failure reason', () => {
    const append = vi.fn();
    const managers = makeManagersWithNotifications('agent', {
      rename: () => ({
        total: 1,
        failedPaths: ['src/foo.ts'],
        failureReasons: { 'src/foo.ts': 'Permission denied; check permissions, then try again' },
      }),
    }, append);
    renameFileNavigatorItem(managers, 0, 'src/foo.ts', 'bar.ts');
    expect(append).toHaveBeenCalledWith(
      NOTIFICATIONS_LABEL,
      expect.objectContaining({ output: expect.stringContaining('Permission denied') }),
    );
  });

  it('renameFileNavigatorItem is a no-op when the tab index has no label', () => {
    const calls: unknown[] = [];
    const managers = makeManagers(undefined, { rename: (...args: unknown[]) => { calls.push(args); } });
    renameFileNavigatorItem(managers, 0, 'src/foo.ts', 'bar.ts');
    expect(calls).toHaveLength(0);
  });

  it('fileNavigatorOpeners returns the manager result when the tab exists', () => {
    const managers = makeManagers('agent', {
      openers: (...args: unknown[]) => ({ command: 'edit', choices: [{ id: args[1] as string }] }),
    });
    const result = fileNavigatorOpeners(managers, 0, 'src/foo.ts', true);
    expect(result).toEqual({ command: 'edit', choices: [{ id: 'src/foo.ts' }] });
  });

  it('fileNavigatorOpeners returns an empty choices list when the tab index has no label', () => {
    const managers = makeManagers(undefined, { openers: () => ({ command: 'open', choices: [{ id: 'a' }] }) });
    const result = fileNavigatorOpeners(managers, 0, 'src/foo.ts', false);
    expect(result).toEqual({ choices: [] });
  });
});
