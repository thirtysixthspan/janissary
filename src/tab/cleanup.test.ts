import { describe, it, expect, vi } from 'vitest';
import { closeTabResources } from './cleanup.js';
import { makeTab } from './index.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

function makeManagers(): Managers {
  return {
    workspace: { release: vi.fn(), cancel: vi.fn() },
    shell: { close: vi.fn() },
    acp: { close: vi.fn() },
    browser: { closeTab: vi.fn() },
    pty: { closeTab: vi.fn() },
    tab: { deleteBusy: vi.fn() },
    fileNavigator: { closeTab: vi.fn() },
    editorWatch: { closeTab: vi.fn() },
    editorAcp: { closeTab: vi.fn() },
    schedule: { delete: vi.fn() },
    questions: { cancelTab: vi.fn() },
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
    expect(managers.fileNavigator.closeTab).toHaveBeenCalledWith('main');
    expect(managers.editorWatch.closeTab).toHaveBeenCalledWith('main');
    expect(managers.editorAcp.closeTab).toHaveBeenCalledWith('main');
    expect(managers.schedule.delete).toHaveBeenCalledWith('main');
    expect(managers.questions.cancelTab).toHaveBeenCalledWith('main');
    expect(managers.database.forgetTab).toHaveBeenCalledWith('main');
  });

  it('removes the workspace clone in the background only when the tab has one', async () => {
    const managers = makeManagers();
    closeTabResources(makeTab('main', 'red'), managers, new Map(), new Map(), new Map(), 2);

    const workspaced = { ...makeTab('ws', 'red'), workspaceDir: '/tmp/ws-main' };
    closeTabResources(workspaced, managers, new Map(), new Map(), new Map(), 2);
    // Deferred off the synchronous close path so the rmSync of the clone can't freeze the UI.
    expect(managers.workspace.release).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(managers.workspace.release).toHaveBeenCalledTimes(1);
    expect(managers.workspace.release).toHaveBeenCalledWith('/tmp/ws-main');
  });

  it('cancels an in-flight clone immediately when closing a still-provisioning tab', () => {
    const managers = makeManagers();
    const workspaced = { ...makeTab('ws', 'red'), label: 'ws', workspaceDir: '/tmp/ws-provisioning' };

    closeTabResources(workspaced, managers, new Map(), new Map(), new Map(), 2);

    expect(managers.workspace.cancel).toHaveBeenCalledWith('ws');
  });

  // The regression this guards: a remote tab's clone lives on the other host, so storing its path
  // in `workspaceDir` would point a local recursive delete at a path that means something else
  // entirely on this machine. A remote tab leaves that field unset, and closing it must delete
  // nothing locally.
  it('schedules no local workspace removal when closing a remote tab', async () => {
    const managers = makeManagers();
    const remote = {
      ...makeTab('claude', 'red'),
      label: 'claude',
      remote: { address: 'devbox:/srv/proj', host: 'devbox' },
    };

    closeTabResources(remote, managers, new Map(), new Map(), new Map(), 2);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(managers.workspace.release).not.toHaveBeenCalled();
    expect(managers.workspace.cancel).not.toHaveBeenCalled();
  });

  it('still removes a local workspaced tab\'s clone alongside remote tabs', async () => {
    const managers = makeManagers();
    const remote = { ...makeTab('claude', 'red'), remote: { address: 'devbox', host: 'devbox' } };
    const local = { ...makeTab('ws', 'red'), workspaceDir: '/tmp/ws-local' };

    closeTabResources(remote, managers, new Map(), new Map(), new Map(), 3);
    closeTabResources(local, managers, new Map(), new Map(), new Map(), 3);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(managers.workspace.release).toHaveBeenCalledTimes(1);
    expect(managers.workspace.release).toHaveBeenCalledWith('/tmp/ws-local');
  });

  it('does not cancel anything for a tab with no workspace', () => {
    const managers = makeManagers();

    closeTabResources(makeTab('main', 'red'), managers, new Map(), new Map(), new Map(), 2);

    expect(managers.workspace.cancel).not.toHaveBeenCalled();
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

  it('drops every plugin-owned reference and leaves unrelated references', () => {
    const managers = makeManagers();
    const tab = {
      ...makeTab('video', 'red'),
      plugin: {
        id: 'video', instanceKey: '/tmp/clip.mp4', schemaVersion: 1,
        payload: {}, fileRefs: ['video', 'poster'], sourceLabel: 'main',
      },
    };
    const openFiles = new Map([
      ['video', '/tmp/clip.mp4'], ['poster', '/tmp/poster.png'], ['keep', '/tmp/keep.txt'],
    ]);

    closeTabResources(tab, managers, openFiles, new Map(), new Map(), 2);

    expect([...openFiles]).toEqual([['keep', '/tmp/keep.txt']]);
  });

  it('leaves unrelated open-file entries untouched for a plain agent tab', () => {
    const managers = makeManagers();
    const openFiles = new Map([['keep', '/tmp/keep.png']]);

    closeTabResources(makeTab('main', 'red'), managers, openFiles, new Map(), new Map(), 2);

    expect(openFiles.has('keep')).toBe(true);
  });

  it('drops an editor-owned reference and leaves unrelated references', () => {
    const managers = makeManagers();
    const tab = {
      ...makeTab('notes.txt', 'red'),
      editor: { name: 'notes.txt', path: '/tmp/notes.txt', size: '1 B', url: '/open/editor' },
    };
    const openFiles = new Map([['editor', '/tmp/notes.txt'], ['keep', '/tmp/keep.txt']]);

    closeTabResources(tab, managers, openFiles, new Map(), new Map(), 2);

    expect([...openFiles]).toEqual([['keep', '/tmp/keep.txt']]);
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
