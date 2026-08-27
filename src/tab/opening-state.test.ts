import { describe, it, expect, vi } from 'vitest';
import { TabManager } from './manager.js';
import type { Managers } from '../managers.js';

function makeTabManager(): TabManager {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  Object.assign(managers, {
    workspace: { remove: vi.fn(), cancel: vi.fn() },
    shell: { close: vi.fn() },
    acp: { close: vi.fn() },
    browser: { closeTab: vi.fn() },
    pty: { closeTab: vi.fn() },
    fileNavigator: { closeTab: vi.fn() },
    editorWatch: { closeTab: vi.fn(), watch: vi.fn() },
    editorAcp: { closeTab: vi.fn() },
    schedule: { delete: vi.fn() },
    questions: { cancelTab: vi.fn(), pendingFor: vi.fn() },
    database: { forgetTab: vi.fn(), closeAll: vi.fn() },
  } as unknown as Managers);
  return managers.tab;
}

describe('TabOpeningState.openPluginTab', () => {
  const openClip = (tm: TabManager, factory = vi.fn((registerFile: (path: string) => string) => ({
    title: 'clip.mp4',
    payload: { path: '/tmp/clip.mp4', url: registerFile('/tmp/clip.mp4') },
  }))) => {
    tm.openPluginTab('video', 'video', '/tmp/clip.mp4', 1, 'janus', (resources) =>
      factory(resources.registerFile));
    return factory;
  };

  it('adds a generic plugin tab and makes it active', () => {
    const tm = makeTabManager();
    const before = tm.tabs.length;

    openClip(tm);

    expect(tm.tabs.length).toBe(before + 1);
    expect(tm.activeTab).toBe(tm.tabs.length - 1);
    expect(tm.tabs[tm.activeTab].plugin).toMatchObject({
      id: 'video', instanceKey: '/tmp/clip.mp4', schemaVersion: 1,
      payload: { path: '/tmp/clip.mp4' }, sourceLabel: 'janus',
    });
    expect(tm.openFiles).toHaveLength(1);
  });

  it('deduplicates before running the payload factory or registering another file', () => {
    const tm = makeTabManager();
    openClip(tm);
    const opened = tm.tabs.length;
    tm.setActiveTab(0);
    const duplicateFactory = vi.fn(() => ({ title: 'wrong', payload: {} }));

    openClip(tm, duplicateFactory);

    expect(tm.tabs.length).toBe(opened);
    expect(tm.tabs[tm.activeTab].plugin?.instanceKey).toBe('/tmp/clip.mp4');
    expect(duplicateFactory).not.toHaveBeenCalled();
    expect(tm.openFiles).toHaveLength(1);
  });

  it('revokes a retained resource registrar after the synchronous factory returns', () => {
    const tm = makeTabManager();
    let registerFile: ((path: string) => string) | undefined;
    tm.openPluginTab('fixture', 'fixture', 'one', 1, 'janus', (resources) => {
      registerFile = resources.registerFile;
      return { title: 'one', payload: {} };
    });

    expect(() => registerFile?.('/tmp/late.fixture'))
      .toThrow('plugin tab resources are no longer available');
    expect(tm.openFiles).toHaveLength(0);
  });
});

describe('TabOpeningState.openEditorTab', () => {
  it('releases a duplicate open registration and retains the existing editor reference', () => {
    const tm = makeTabManager();
    const path = '/tmp/notes.txt';
    const existingUrl = tm.registerFile(path);
    tm.openEditorTab({ name: 'notes.txt', path, size: '1 B', url: existingUrl });
    const duplicateUrl = tm.registerFile(path);

    tm.openEditorTab({ name: 'notes.txt', path, size: '1 B', url: duplicateUrl });

    expect(tm.openFiles).toHaveLength(1);
    expect(tm.openFilePath(existingUrl.slice('/open/'.length))).toBe(path);
    expect(tm.openFilePath(duplicateUrl.slice('/open/'.length))).toBeUndefined();
  });
});
