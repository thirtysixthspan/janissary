import { describe, it, expect, vi } from 'vitest';
import { resyncEditorTab } from './resync.js';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';
import type { EditorView } from '../tab/types.js';

function setup(openSync: () => Promise<{ dir: string } | { error: string }>, sync: EditorView['sync'] = 'synced') {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  managers.editorWatch = { watch: () => {}, markSaved: () => {} } as unknown as Managers['editorWatch'];
  managers.gitSync = { openSync } as unknown as Managers['gitSync'];
  const url = managers.tab.registerFile('/repo/synced.txt');
  managers.tab.openEditorTab({ name: 'synced.txt', path: '/repo/synced.txt', size: '8 B', url, sync });
  return { managers, url };
}

describe('resyncEditorTab', () => {
  it('transitions sync from syncing to synced once the pull resolves', async () => {
    const { managers, url } = setup(() => Promise.resolve({ dir: '/repo' }));
    const promise = resyncEditorTab(managers, url);
    const tab = managers.tab.tabs.find((t) => t.editor);
    expect(tab?.editor?.sync).toBe('syncing');

    await promise;
    expect(tab?.editor?.sync).toBe('synced');
  });

  it('transitions sync to error when the pull rejects', async () => {
    const { managers, url } = setup(() => Promise.resolve({ error: 'network down' }));
    await resyncEditorTab(managers, url);
    const tab = managers.tab.tabs.find((t) => t.editor);
    expect(tab?.editor?.sync).toBe('error');
  });

  it('stays syncing while the pull is still pending', async () => {
    const { promise, resolve } = Promise.withResolvers<{ dir: string }>();
    const { managers, url } = setup(() => promise);
    const resyncPromise = resyncEditorTab(managers, url);
    const tab = managers.tab.tabs.find((t) => t.editor);
    expect(tab?.editor?.sync).toBe('syncing');

    resolve({ dir: '/repo' });
    await resyncPromise;
  });

  it('calls openSync', async () => {
    const openSync = vi.fn().mockResolvedValue({ dir: '/repo' });
    const { managers, url } = setup(openSync);
    await resyncEditorTab(managers, url);
    expect(openSync).toHaveBeenCalledTimes(1);
  });

  it('no-ops for a tab with no sync field', async () => {
    const openSync = vi.fn();
    const managers = {} as Managers;
    managers.tab = new TabManager(managers);
    managers.editorWatch = { watch: () => {}, markSaved: () => {} } as unknown as Managers['editorWatch'];
    managers.gitSync = { openSync } as unknown as Managers['gitSync'];
    const url = managers.tab.registerFile('/repo/plain.txt');
    managers.tab.openEditorTab({ name: 'plain.txt', path: '/repo/plain.txt', size: '8 B', url });

    await resyncEditorTab(managers, url);
    expect(openSync).not.toHaveBeenCalled();
  });

  it('no-ops for a tab still provisioning', async () => {
    const openSync = vi.fn();
    const { managers, url } = setup(openSync, 'provisioning');
    await resyncEditorTab(managers, url);
    expect(openSync).not.toHaveBeenCalled();
  });

  it('no-ops for a tab already syncing', async () => {
    const openSync = vi.fn();
    const { managers, url } = setup(openSync, 'syncing');
    await resyncEditorTab(managers, url);
    expect(openSync).not.toHaveBeenCalled();
  });

  it('no-ops for an unresolvable url', async () => {
    const openSync = vi.fn();
    const managers = {} as Managers;
    managers.tab = new TabManager(managers);
    managers.gitSync = { openSync } as unknown as Managers['gitSync'];

    await expect(resyncEditorTab(managers, '/open/ghost')).resolves.toBeUndefined();
    expect(openSync).not.toHaveBeenCalled();
  });
});
