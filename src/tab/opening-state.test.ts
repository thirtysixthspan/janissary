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

const videoPlugin = (url: string) => ({
  pluginId: 'video', schemaVersion: 1,
  payload: { name: 'clip.mp4', path: '/tmp/clip.mp4', size: '1 KB', url, player: 'QuickTime Player' },
  instanceKey: '/tmp/clip.mp4', originLabel: 'janus', resourceRefs: [url.slice('/open/'.length)],
});

describe('TabOpeningState.openMarkdownTab', () => {
  it('adds a new markdown tab and makes it active', () => {
    const tm = makeTabManager();
    const before = tm.tabs.length;

    tm.openMarkdownTab({ name: 'notes.md', path: '/tmp/notes.md', size: '1 KB', url: '/open/1' });

    expect(tm.tabs.length).toBe(before + 1);
    expect(tm.activeTab).toBe(tm.tabs.length - 1);
    expect(tm.tabs[tm.activeTab].markdown?.path).toBe('/tmp/notes.md');
  });
});

describe('TabOpeningState.openPluginTab', () => {
  it('adds a plugin tab and makes it active', () => {
    const tm = makeTabManager();
    const before = tm.tabs.length;

    tm.openPluginTab('video', 'clip.mp4', videoPlugin('/open/1'));

    expect(tm.tabs.length).toBe(before + 1);
    expect(tm.activeTab).toBe(tm.tabs.length - 1);
    expect(tm.tabs[tm.activeTab].plugin?.pluginId).toBe('video');
    expect(tm.tabs[tm.activeTab].title).toBe('clip.mp4');
  });

  it('focuses an existing stable plugin instance', () => {
    const tm = makeTabManager();
    tm.openPluginTab('video', 'clip.mp4', videoPlugin('/open/1'));
    const opened = tm.tabs.length;
    tm.setActiveTab(0);

    const label = tm.focusPluginTab('video', '/tmp/clip.mp4');

    expect(tm.tabs.length).toBe(opened);
    expect(label).toBe('video');
    expect(tm.tabs[tm.activeTab].plugin?.instanceKey).toBe('/tmp/clip.mp4');
  });
});
