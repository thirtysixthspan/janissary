import { describe, it, expect, vi } from 'vitest';
import { resyncEditorTab } from './resync.js';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';
import type { EditorView } from '../tab/types.js';
import { tabRuntime } from '../tab/runtime.js';
import { removeTabAt } from '../tab/reorder.js';

function setup(openSync: () => Promise<{ dir: string } | { error: string }>, sync: EditorView['sync'] = 'synced') {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  managers.editorWatch = { watch: () => {}, markSaved: () => {}, refresh: vi.fn() } as unknown as Managers['editorWatch'];
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

  it('calls editorWatch.refresh after a successful pull', async () => {
    const { managers, url } = setup(() => Promise.resolve({ dir: '/repo' }));
    await resyncEditorTab(managers, url);
    const tab = managers.tab.tabs.find((t) => t.editor);
    expect(managers.editorWatch.refresh).toHaveBeenCalledWith(tab?.label);
  });

  it('refreshes every other open synced tab too, since the pull can rewrite any of their files', async () => {
    const { managers, url } = setup(() => Promise.resolve({ dir: '/repo' }));
    const other = managers.tab.openEditorTab({ name: 'plans.md', path: '/repo/plans.md', size: '1 B', url: managers.tab.registerFile('/repo/plans.md'), sync: 'synced' });
    const plain = managers.tab.openEditorTab({ name: 'plain.md', path: '/plain.md', size: '1 B', url: managers.tab.registerFile('/plain.md') });
    await resyncEditorTab(managers, url);
    expect(managers.editorWatch.refresh).toHaveBeenCalledWith(other);
    expect(managers.editorWatch.refresh).not.toHaveBeenCalledWith(plain);
  });

  it('does not call editorWatch.refresh when the pull errors', async () => {
    const { managers, url } = setup(() => Promise.resolve({ error: 'network down' }));
    await resyncEditorTab(managers, url);
    expect(managers.editorWatch.refresh).not.toHaveBeenCalled();
  });

  it('does not let an older manual resync replace the latest request status', async () => {
    const first = Promise.withResolvers<{ dir: string } | { error: string }>();
    const second = Promise.withResolvers<{ dir: string } | { error: string }>();
    const openSync = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { managers, url } = setup(openSync);
    const tab = managers.tab.tabs.find((item) => item.editor)!;
    const firstRequest = resyncEditorTab(managers, url);
    tab.editor = { ...tab.editor!, sync: 'synced' };
    const secondRequest = resyncEditorTab(managers, url);

    first.resolve({ error: 'old failure' });
    await firstRequest;
    expect(tab.editor?.sync).toBe('syncing');

    second.resolve({ dir: '/repo' });
    await secondRequest;
    expect(tab.editor?.sync).toBe('synced');
  });

  it('does not attribute a pending pull to a replacement editor with a reused label', async () => {
    const pending = Promise.withResolvers<{ dir: string } | { error: string }>();
    const { managers, url } = setup(() => pending.promise);
    const previous = managers.tab.tabs.find((item) => item.editor)!;
    const request = resyncEditorTab(managers, url);
    tabRuntime(previous).closing = true;
    managers.tab.tabs = managers.tab.tabs.filter((item) => item !== previous);
    const replacementLabel = managers.tab.openEditorTab({
      name: 'replacement.txt', path: '/repo/replacement.txt', size: '1 B',
      url: managers.tab.registerFile('/repo/replacement.txt'), sync: 'synced',
    });
    const replacement = managers.tab.editorTab(replacementLabel)!;

    pending.resolve({ error: 'old editor failure' });
    await request;

    expect(replacementLabel).toBe(previous.label);
    expect(replacement.editor?.sync).toBe('synced');
  });

  it('keeps manual resync ownership when another tab is removed', async () => {
    const pending = Promise.withResolvers<{ dir: string }>();
    const { managers, url } = setup(() => pending.promise);
    const owner = managers.tab.tabs.find((item) => item.editor)!;
    managers.tab.openEditorTab({ name: 'other.txt', path: '/repo/other.txt', size: '1 B', url: managers.tab.registerFile('/repo/other.txt') });
    const request = resyncEditorTab(managers, url);
    managers.tab.tabs = removeTabAt(managers.tab.tabs, managers.tab.tabs.findIndex((item) => item.label === 'editor-2'));

    pending.resolve({ dir: '/repo' });
    await request;

    expect(owner.editor?.sync).toBe('synced');
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
