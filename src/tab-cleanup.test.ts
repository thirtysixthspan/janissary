import { describe, it, expect, vi } from 'vitest';
import { closeTabResources } from './tab-cleanup.js';
import { makeTab } from './tab.js';
import { messageBus } from './bus.js';
import type { Managers } from './managers.js';

function makeManagers(): Managers {
  return {
    workspace: { remove: vi.fn() },
    shell: { close: vi.fn() },
    acp: { close: vi.fn() },
    browser: { closeTab: vi.fn() },
    pty: { closeTab: vi.fn() },
    tab: { deleteBusy: vi.fn() },
    fileTree: { closeTab: vi.fn() },
    editorWatch: { closeTab: vi.fn() },
    schedule: { delete: vi.fn() },
    database: { forgetTab: vi.fn(), closeAll: vi.fn() },
  } as unknown as Managers;
}

describe('closeTabResources', () => {
  it('closes every per-tab resource keyed by the tab label', () => {
    const tab = makeTab('main', 'red');
    const managers = makeManagers();

    closeTabResources(tab, managers, new Map(), new Map(), new Map(), 2);

    expect(managers.shell.close).toHaveBeenCalledWith('main');
    expect(managers.acp.close).toHaveBeenCalledWith('main');
    expect(managers.browser.closeTab).toHaveBeenCalledWith('main');
    expect(managers.pty.closeTab).toHaveBeenCalledWith('main');
    expect(managers.tab.deleteBusy).toHaveBeenCalledWith('main');
    expect(managers.fileTree.closeTab).toHaveBeenCalledWith('main');
    expect(managers.editorWatch.closeTab).toHaveBeenCalledWith('main');
    expect(managers.schedule.delete).toHaveBeenCalledWith('main');
    expect(managers.database.forgetTab).toHaveBeenCalledWith('main');
  });

  it('removes the workspace clone only when the tab has one', () => {
    const managers = makeManagers();
    closeTabResources(makeTab('main', 'red'), managers, new Map(), new Map(), new Map(), 2);
    expect(managers.workspace.remove).not.toHaveBeenCalled();

    const workspaced = { ...makeTab('ws', 'red'), workspaceDir: '/tmp/ws-main' };
    closeTabResources(workspaced, managers, new Map(), new Map(), new Map(), 2);
    expect(managers.workspace.remove).toHaveBeenCalledWith('/tmp/ws-main');
  });

  it('closes every database connection only when this was the last tab', () => {
    const managers = makeManagers();
    closeTabResources(makeTab('main', 'red'), managers, new Map(), new Map(), new Map(), 2);
    expect(managers.database.closeAll).not.toHaveBeenCalled();

    closeTabResources(makeTab('main', 'red'), managers, new Map(), new Map(), new Map(), 1);
    expect(managers.database.closeAll).toHaveBeenCalledTimes(1);
  });

  it('emits a tab:removed transcript event', () => {
    const managers = makeManagers();
    const emitSpy = vi.spyOn(messageBus, 'emit');

    closeTabResources(makeTab('main', 'red'), managers, new Map(), new Map(), new Map(), 2);

    expect(emitSpy).toHaveBeenCalledWith('transcript', { type: 'tab:removed', tabLabel: 'main' });
    emitSpy.mockRestore();
  });

  it('drops an image tab\'s open-file entry', () => {
    const managers = makeManagers();
    const tab = { ...makeTab('image', 'red'), image: { name: 'pic.png', path: '/tmp/pic.png', size: '1 KB', url: '/open/abc' } };
    const openFiles = new Map([['abc', '/tmp/pic.png']]);

    closeTabResources(tab, managers, openFiles, new Map(), new Map(), 2);

    expect(openFiles.has('abc')).toBe(false);
  });

  it('drops a markdown tab\'s open-file entry', () => {
    const managers = makeManagers();
    const tab = { ...makeTab('markdown', 'red'), markdown: { name: 'readme.md', path: '/tmp/readme.md', size: '1 KB', url: '/open/xyz' } };
    const openFiles = new Map([['xyz', '/tmp/readme.md']]);

    closeTabResources(tab, managers, openFiles, new Map(), new Map(), 2);

    expect(openFiles.has('xyz')).toBe(false);
  });

  it('leaves unrelated open-file entries untouched for a plain agent tab', () => {
    const managers = makeManagers();
    const openFiles = new Map([['keep', '/tmp/keep.png']]);

    closeTabResources(makeTab('main', 'red'), managers, openFiles, new Map(), new Map(), 2);

    expect(openFiles.has('keep')).toBe(true);
  });

  it('removes the tab\'s context entry', () => {
    const managers = makeManagers();
    const context = new Map([['main', ['some context']]]);

    closeTabResources(makeTab('main', 'red'), managers, new Map(), context, new Map(), 2);

    expect(context.has('main')).toBe(false);
  });

  it('removes the tab\'s queue entry', () => {
    const managers = makeManagers();
    const queue = new Map([['main', ['echo hi']]]);

    closeTabResources(makeTab('main', 'red'), managers, new Map(), new Map(), queue, 2);

    expect(queue.has('main')).toBe(false);
  });
});
