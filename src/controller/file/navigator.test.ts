import { describe, it, expect, vi } from 'vitest';
import {
  fileNavigatorToggle, fileNavigatorCollapseAll, fileNavigatorPull, fileNavigatorReroot,
  moveFileNavigatorItem, moveFileNavigatorItems, pasteFileNavigatorItems, deleteFileNavigatorItem,
  deleteFileNavigatorItems, undoFileNavigatorItem, redoFileNavigatorItem, openFileNavigatorFor,
  fileNavigatorSearch, revealFileNavigatorItem, renameFileNavigatorItem, fileNavigatorOpeners,
  fileNavigatorCreateFile, fileNavigatorCreateDirectory,
} from './navigator.js';
import { fileNavigatorCommit, fileNavigatorNothingToCommit } from './navigator-commit.js';
import { NOTIFICATIONS_LABEL } from '../../notifications/tab.js';
import { NOTIFICATION_QUEUE_LIMIT, NotificationQueue } from '../../notifications/queue.js';
import type { Managers } from '../../managers.js';

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
  const tabs = [active, notif];
  return {
    tab: { tabs, byLabel: (l: string) => tabs.find((t) => t.label === l), cur: () => active, append },
    fileNavigator,
    notifications: new NotificationQueue(),
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

  it('fileNavigatorCommit delegates with the resolved label, message, and paths', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', { commit: (...args: unknown[]) => { calls.push(args); } });
    fileNavigatorCommit(managers, 0, 'commit: a.md', ['a.md']);
    expect(calls).toEqual([['agent', 'commit: a.md', ['a.md']]]);
  });

  it('fileNavigatorCommit is a no-op when the tab index has no label', () => {
    const calls: unknown[] = [];
    const managers = makeManagers(undefined, { commit: (...args: unknown[]) => { calls.push(args); } });
    fileNavigatorCommit(managers, 0, 'commit: a.md', ['a.md']);
    expect(calls).toHaveLength(0);
  });

  it('fileNavigatorNothingToCommit posts the nothing-to-commit line attributed to the tab', () => {
    const append = vi.fn();
    const managers = makeManagersWithNotifications('agent', {}, append);
    fileNavigatorNothingToCommit(managers, 0);
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith(
      NOTIFICATIONS_LABEL,
      expect.objectContaining({ output: 'Nothing to commit' }),
      NOTIFICATION_QUEUE_LIMIT,
    );
  });

  it('fileNavigatorNothingToCommit is a no-op when the tab index has no label', () => {
    const managers = makeManagers(undefined, {});
    expect(() => fileNavigatorNothingToCommit(managers, 0)).not.toThrow();
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
    moveFileNavigatorItem(managers, 'agent', 'a.ts', 'b.ts');
    moveFileNavigatorItem(managers, 'agent', 'c.ts', 'b.ts', true);
    expect(calls).toEqual([['agent', 'a.ts', 'b.ts', undefined], ['agent', 'c.ts', 'b.ts', true]]);
  });

  it('moveFileNavigatorItem returns a conflict answer to the caller and posts no notification', () => {
    const append = vi.fn();
    const managers = makeManagersWithNotifications('agent', {
      move: () => ({ conflictPaths: ['a.ts'] }),
    }, append);
    expect(moveFileNavigatorItem(managers, 'agent', 'a.ts', 'b.ts')).toEqual({ conflictPaths: ['a.ts'] });
    expect(append).not.toHaveBeenCalled();
  });

  it('moveFileNavigatorItem answers an empty result for a label no open tab carries', () => {
    const managers = makeManagers('agent', {});
    expect(moveFileNavigatorItem(managers, 'gone', 'a.ts', 'b.ts')).toEqual({ total: 0, failedPaths: [] });
  });

  it('deleteFileNavigatorItem delegates to FileNavigatorManager.delete when the tab exists', () => {
    const calls: unknown[] = [];
    const managers = makeManagers('agent', {
      delete: (...args: unknown[]) => { calls.push(args); return { total: 1, failedPaths: [] }; },
    });
    deleteFileNavigatorItem(managers, 'agent', 'a.ts');
    expect(calls).toEqual([['agent', 'a.ts']]);
  });

  it('moveFileNavigatorItem posts one notification when the move fails', () => {
    const append = vi.fn();
    const managers = makeManagersWithNotifications('agent', {
      move: () => ({ total: 1, failedPaths: ['a.ts'] }),
    }, append);
    moveFileNavigatorItem(managers, 'agent', 'a.ts', 'b.ts');
    expect(append).toHaveBeenCalledTimes(1);
  });

  it('deleteFileNavigatorItem posts one notification when the delete fails', () => {
    const append = vi.fn();
    const managers = makeManagersWithNotifications('agent', {
      delete: () => ({ total: 1, failedPaths: ['a.ts'] }),
    }, append);
    deleteFileNavigatorItem(managers, 'agent', 'a.ts');
    expect(append).toHaveBeenCalledTimes(1);
  });

  it('undoFileNavigatorItem posts no notification when the result is a conflict', () => {
    const append = vi.fn();
    const conflict = { fromRelPath: 'a.ts', toRelPath: 'b.ts' };
    const managers = makeManagersWithNotifications('agent', { undo: () => ({ conflict }) }, append);
    undoFileNavigatorItem(managers, 'agent');
    expect(append).not.toHaveBeenCalled();
  });

  it('moveFileNavigatorItems delegates to FileNavigatorManager.moveMany', () => {
    const managers = makeManagers('agent', {
      moveMany: (...args: unknown[]) => ({ total: args.length, failedPaths: [] }),
    });
    const result = moveFileNavigatorItems(managers, 'agent', ['a', 'b'], 'dest', 'skip-conflicts');
    expect(result).toEqual({ total: 4, failedPaths: [] });
  });

  it('moveFileNavigatorItems returns a structured result for a missing tab', () => {
    const managers = makeManagers(undefined, { moveMany: () => ({ conflictPaths: ['a'] }) });
    expect(moveFileNavigatorItems(managers, 'agent', ['a'], 'dest')).toEqual({ total: 0, failedPaths: [] });
  });

  it('deleteFileNavigatorItems delegates and handles a missing tab', () => {
    const managers = makeManagers('agent', {
      deleteMany: (...args: unknown[]) => ({ total: (args[1] as string[]).length, failedPaths: [] }),
    });
    expect(deleteFileNavigatorItems(managers, 'agent', ['a', 'b'])).toEqual({ total: 2, failedPaths: [] });
    expect(deleteFileNavigatorItems(makeManagers(undefined, {}), 'agent', ['a'])).toEqual({
      total: 0,
      failedPaths: [],
    });
  });

  it('undoFileNavigatorItem returns the manager result when the tab exists', () => {
    const conflict = { fromRelPath: 'a.ts', toRelPath: 'b.ts' };
    const managers = makeManagers('agent', { undo: () => ({ conflict }) });
    const result = undoFileNavigatorItem(managers, 'agent', true);
    expect(result).toEqual({ conflict });
  });

  it('undoFileNavigatorItem returns an empty object when no open tab carries the label', () => {
    const managers = makeManagers(undefined, { undo: () => ({ conflict: { fromRelPath: 'a', toRelPath: 'b' } }) });
    const result = undoFileNavigatorItem(managers, 'agent');
    expect(result).toEqual({});
  });

  it('redoFileNavigatorItem returns the manager result when the tab exists', () => {
    const conflict = { fromRelPath: 'a.ts', toRelPath: 'b.ts' };
    const managers = makeManagers('agent', { redo: () => ({ conflict }) });
    const result = redoFileNavigatorItem(managers, 'agent', true);
    expect(result).toEqual({ conflict });
  });

  it('redoFileNavigatorItem returns an empty object when no open tab carries the label', () => {
    const managers = makeManagers(undefined, { redo: () => ({ conflict: { fromRelPath: 'a', toRelPath: 'b' } }) });
    const result = redoFileNavigatorItem(managers, 'agent');
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
    renameFileNavigatorItem(managers, 'agent', 'src/foo.ts', 'bar.ts');
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
    renameFileNavigatorItem(managers, 'agent', 'src/foo.ts', 'bar.ts');
    expect(append).toHaveBeenCalledWith(
      NOTIFICATIONS_LABEL,
      expect.objectContaining({ output: expect.stringContaining('Permission denied') }),
      NOTIFICATION_QUEUE_LIMIT,
    );
  });

  it('renameFileNavigatorItem is a no-op when no open tab carries the label', () => {
    const calls: unknown[] = [];
    const managers = makeManagers(undefined, { rename: (...args: unknown[]) => { calls.push(args); } });
    renameFileNavigatorItem(managers, 'agent', 'src/foo.ts', 'bar.ts');
    expect(calls).toHaveLength(0);
  });

  // A navigator that closed while its request was in flight: the label names no open tab, even
  // though another navigator now sits at the index it used to hold.
  it('mutates nothing and reports nothing for a label no open tab carries', async () => {
    const append = vi.fn();
    const mutate = vi.fn(() => ({ total: 1, failedPaths: ['a.ts'] }));
    const managers = makeManagersWithNotifications('other', {
      move: mutate, moveMany: mutate, paste: mutate, delete: mutate, deleteMany: mutate, rename: mutate,
      undo: mutate, redo: mutate, createFile: mutate, createDirectory: mutate,
    }, append);
    await moveFileNavigatorItem(managers, 'gone', 'a.ts', 'b');
    await moveFileNavigatorItems(managers, 'gone', ['a.ts'], 'b');
    await pasteFileNavigatorItems(managers, 'gone', ['/x/a.ts'], 'b', 'copy');
    await deleteFileNavigatorItem(managers, 'gone', 'a.ts');
    await deleteFileNavigatorItems(managers, 'gone', ['a.ts']);
    await renameFileNavigatorItem(managers, 'gone', 'a.ts', 'c.ts');
    expect(await undoFileNavigatorItem(managers, 'gone')).toEqual({});
    expect(await redoFileNavigatorItem(managers, 'gone', true)).toEqual({});
    expect(await fileNavigatorCreateFile(managers, 'gone', 'src')).toBeUndefined();
    expect(await fileNavigatorCreateDirectory(managers, 'gone', 'src')).toBeUndefined();
    expect(mutate).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('reaches the named navigator after a tab ahead of it has closed', () => {
    const deleteItem = vi.fn(() => ({ total: 1, failedPaths: [] }));
    const tabs = [{ label: 'agent' }, { label: 'files' }, { label: 'files-2' }];
    const managers = { tab: { tabs }, fileNavigator: { delete: deleteItem } } as unknown as Managers;
    tabs.shift();
    deleteFileNavigatorItem(managers, 'files-2', 'a.ts');
    expect(deleteItem).toHaveBeenCalledWith('files-2', 'a.ts');
  });

  // Undo of a copy-paste deletes the pasted files, so replaying another tree's history after a tab
  // ahead closed would delete files the user never asked about.
  it('replays and creates in the named navigator after a tab ahead of it has closed', () => {
    const undo = vi.fn(() => ({}));
    const createFile = vi.fn();
    const createDirectory = vi.fn(() => 'src/new');
    const tabs = [{ label: 'agent' }, { label: 'files' }, { label: 'files-2' }];
    const managers = { tab: { tabs }, fileNavigator: { undo, createFile, createDirectory } } as unknown as Managers;
    tabs.shift();
    undoFileNavigatorItem(managers, 'files-2');
    fileNavigatorCreateFile(managers, 'files-2', 'src');
    expect(fileNavigatorCreateDirectory(managers, 'files-2', 'src')).toBe('src/new');
    expect(undo).toHaveBeenCalledWith('files-2', undefined, undefined);
    expect(createFile).toHaveBeenCalledWith('files-2', 'src');
    expect(createDirectory).toHaveBeenCalledWith('files-2', 'src');
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
