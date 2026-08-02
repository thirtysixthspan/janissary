import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { OpenFileManager } from './open-file-manager.js';
import type { Managers } from './managers.js';
import { TabManager } from './tab/manager.js';
import { PluginHost } from './plugins/server/host.js';

const osOpen = vi.hoisted(() => ({ didOsOpen: vi.fn<(file: string, application?: string) => boolean>(() => true) }));

vi.mock('./config.js', () => ({
  getConfig: () => ({ syncPaths: ['synced/'], externalViewers: { video: 'QuickTime Player' } }),
}));
vi.mock('./openers/os-open.js', () => ({ didOsOpen: osOpen.didOsOpen }));

describe('OpenFileManager.edit', () => {
  it('opens the editor for a new file that does not exist on disk', () => {
    const appended: string[] = [];
    const opened: string[] = [];
    const managers = {
      tab: {
        cwdOf: () => '/working',
        append: (_label: string, _entry: unknown) => { appended.push(JSON.stringify(_entry)); },
        openEditorTab: (view: { path: string }) => { opened.push(view.path); },
        registerFile: (p: string) => `/open/test-${p.length}`,
      },
    } as unknown as Managers;
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit newfile.txt', 'newfile.txt', 'janus');

    expect(opened).toHaveLength(1);
    expect(opened[0]).toBe(path.resolve('/working', 'newfile.txt'));
    expect(appended).toHaveLength(0);
  });

  it('opens the editor for an absolute new file path', () => {
    const opened: string[] = [];
    const managers = {
      tab: {
        cwdOf: () => '/working',
        append: () => {},
        openEditorTab: (view: { path: string }) => { opened.push(view.path); },
        registerFile: (p: string) => `/open/test-${p.length}`,
      },
    } as unknown as Managers;
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit /tmp/newfile.txt', '/tmp/newfile.txt', 'janus');

    expect(opened).toHaveLength(1);
    expect(opened[0]).toBe('/tmp/newfile.txt');
  });

  it('forwards a target line through to the opened editor view', () => {
    const opened: { path: string; line?: number }[] = [];
    const managers = {
      tab: {
        cwdOf: () => '/working',
        append: () => {},
        openEditorTab: (view: { path: string; line?: number }) => { opened.push(view); },
        registerFile: (p: string) => `/open/test-${p.length}`,
      },
    } as unknown as Managers;
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit foo.txt:42', 'foo.txt', 'janus', 42);

    expect(opened).toHaveLength(1);
    expect(opened[0].line).toBe(42);
  });
});

describe('OpenFileManager.newFile', () => {
  const makeManagers = (dir: string, opened: string[]): Managers => ({
    tab: {
      cwdOf: () => dir,
      append: () => {},
      openEditorTab: (view: { path: string }) => { opened.push(view.path); },
      registerFile: (p: string) => `/open/test-${p.length}`,
    },
  } as unknown as Managers);

  it('opens the literal target when it does not exist yet', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newfile-'));
    const opened: string[] = [];
    const mgr = new OpenFileManager(makeManagers(dir, opened));

    mgr.newFile('newfile untitled.md', 'untitled.md', 'janus');

    expect(opened).toEqual([path.join(dir, 'untitled.md')]);
  });

  it('opens untitled-2.md when untitled.md already exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newfile-'));
    writeFileSync(path.join(dir, 'untitled.md'), 'existing', 'utf8');
    const opened: string[] = [];
    const mgr = new OpenFileManager(makeManagers(dir, opened));

    mgr.newFile('newfile untitled.md', 'untitled.md', 'janus');

    expect(opened).toEqual([path.join(dir, 'untitled-2.md')]);
  });

  it('opens untitled-3.md when both untitled.md and untitled-2.md already exist', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newfile-'));
    writeFileSync(path.join(dir, 'untitled.md'), 'existing', 'utf8');
    writeFileSync(path.join(dir, 'untitled-2.md'), 'existing', 'utf8');
    const opened: string[] = [];
    const mgr = new OpenFileManager(makeManagers(dir, opened));

    mgr.newFile('newfile untitled.md', 'untitled.md', 'janus');

    expect(opened).toEqual([path.join(dir, 'untitled-3.md')]);
  });
});

describe('OpenFileManager.newDirectory', () => {
  const makeManager = (dir: string) => new OpenFileManager({
    tab: { cwdOf: () => dir },
  } as unknown as Managers);

  it('creates the requested directory', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newdir-'));
    const manager = makeManager(dir);

    manager.newDirectory('untitled', 'janus');

    expect(existsSync(path.join(dir, 'untitled'))).toBe(true);
  });

  it('creates inside a nested target directory', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newdir-'));
    mkdirSync(path.join(dir, 'src'));
    const manager = makeManager(dir);

    manager.newDirectory('src/untitled', 'janus');

    expect(existsSync(path.join(dir, 'src', 'untitled'))).toBe(true);
  });

  it('uses the next free suffix when directories already exist', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-newdir-'));
    mkdirSync(path.join(dir, 'untitled'));
    mkdirSync(path.join(dir, 'untitled-2'));
    const manager = makeManager(dir);

    manager.newDirectory('untitled', 'janus');

    expect(existsSync(path.join(dir, 'untitled-3'))).toBe(true);
  });
});

describe('OpenFileManager.run', () => {
  it('opens a markdown file inline via the markdown opener', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-run-'));
    writeFileSync(path.join(dir, 'readme.md'), '# Hello', 'utf8');
    const opened: { name: string; path: string }[] = [];
    const managers = {
      tab: {
        cwdOf: () => dir,
        launchDir: dir,
        append: () => {},
        openMarkdownTab: (view: { name: string; path: string }) => { opened.push(view); },
        registerFile: (p: string) => `/open/test-${p.length}`,
      },
    } as unknown as Managers;
    const mgr = new OpenFileManager(managers);

    mgr.run('open readme.md', 'janus');

    expect(opened).toHaveLength(1);
    expect(opened[0].path).toBe(path.join(dir, 'readme.md'));
    expect(opened[0].name).toBe('readme.md');
  });
});

describe('OpenFileManager.run (video)', () => {
  const makeVideoManagers = (directory: string): Managers => {
    const managers = {} as Managers;
    managers.tab = new TabManager(managers, directory);
    managers.plugins = new PluginHost(managers);
    return managers;
  };

  beforeEach(() => {
    osOpen.didOsOpen.mockReset();
    osOpen.didOsOpen.mockReturnValue(true);
  });

  it('opens a playable video through the plugin host', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-video-'));
    writeFileSync(path.join(dir, 'clip.mp4'), Buffer.alloc(10));
    const managers = makeVideoManagers(dir);
    const mgr = new OpenFileManager(managers);

    await mgr.run('open clip.mp4', 'janus');

    const opened = managers.tab.tabs.find((tab) => tab.view === 'plugin');
    expect(opened?.plugin?.pluginId).toBe('video');
    expect(opened?.plugin?.payload).toMatchObject({
      path: path.join(dir, 'clip.mp4'), player: 'QuickTime Player',
    });
    expect(osOpen.didOsOpen).not.toHaveBeenCalled();
  });

  it('deduplicates before building another payload or registering another file', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-video-'));
    writeFileSync(path.join(dir, 'clip.mp4'), Buffer.alloc(10));
    const managers = makeVideoManagers(dir);
    const mgr = new OpenFileManager(managers);
    await mgr.run('open clip.mp4', 'janus');
    const refs = managers.tab.openFiles.size;
    managers.tab.setActiveTab(0);

    await mgr.run('open clip.mp4', 'janus');

    expect(managers.tab.tabs.filter((tab) => tab.view === 'plugin')).toHaveLength(1);
    expect(managers.tab.openFiles.size).toBe(refs);
    expect(managers.tab.cur().view).toBe('plugin');
  });

  it('hands a video to the configured player on `open external`, opening no tab', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-video-'));
    writeFileSync(path.join(dir, 'clip.mp4'), Buffer.alloc(10));
    const managers = makeVideoManagers(dir);
    const mgr = new OpenFileManager(managers);

    await mgr.run('open external clip.mp4', 'janus');

    expect(managers.tab.tabs.filter((tab) => tab.view === 'plugin')).toHaveLength(0);
    expect(osOpen.didOsOpen).toHaveBeenCalledWith(path.join(dir, 'clip.mp4'), 'QuickTime Player');
    expect(managers.tab.tabs[0].log.at(-1)?.output).toBe('Opening clip.mp4 in QuickTime Player…');
  });

  it('reports no such file before plugin activation', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-video-'));
    const managers = makeVideoManagers(dir);
    const mgr = new OpenFileManager(managers);

    await mgr.run('open missing.mp4', 'janus');

    expect(managers.plugins.status('video').state).toBe('inactive');
    expect(managers.tab.tabs[0].log.at(-1)?.output).toContain('no such file');
  });
});

describe('OpenFileManager.edit (synced path)', () => {
  type EditorTab = { label: string; editor?: { path: string; size: string; url: string; sync?: string } };

  const makeSyncedManagers = (dir: string, tabs: EditorTab[], openSync: () => Promise<{ dir: string } | { error: string }>) => ({
    tab: {
      cwdOf: () => dir,
      launchDir: dir,
      append: () => {},
      openEditorTab: (view: { name: string; path: string; size: string; url: string; sync?: string }) => {
        tabs.push({ label: 'janus', editor: view });
      },
      registerFile: (p: string) => `/open/test-${p.length}`,
      tabs,
    },
    gitSync: {
      workspaceFilePath: (relative: string) => path.join('/workspace', relative),
      openSync,
    },
    editorWatch: {
      watch: vi.fn(),
    },
  } as unknown as Managers);

  it('marks the tab synced once the workspace pull succeeds', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-synced-'));
    mkdirSync(path.join(dir, 'synced'));
    writeFileSync(path.join(dir, 'synced', 'foo.md'), 'hello', 'utf8');
    const tabs: EditorTab[] = [];
    const managers = makeSyncedManagers(dir, tabs, async () => ({ dir: '/workspace' }));
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit synced/foo.md', 'synced/foo.md', 'janus');

    expect(tabs).toHaveLength(1);
    expect(tabs[0].editor?.sync).toBe('provisioning');

    await vi.waitFor(() => expect(tabs[0].editor?.sync).toBe('synced'));

    expect(managers.editorWatch.watch).toHaveBeenCalledWith('janus', path.join('/workspace', 'synced/foo.md'));
  });

  it('marks the tab errored when the workspace pull fails', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-synced-'));
    mkdirSync(path.join(dir, 'synced'));
    writeFileSync(path.join(dir, 'synced', 'foo.md'), 'hello', 'utf8');
    const tabs: EditorTab[] = [];
    const managers = makeSyncedManagers(dir, tabs, async () => ({ error: 'clone failed' }));
    const mgr = new OpenFileManager(managers);

    mgr.edit('edit synced/foo.md', 'synced/foo.md', 'janus');

    await vi.waitFor(() => expect(tabs[0].editor?.sync).toBe('error'));

    expect(managers.editorWatch.watch).not.toHaveBeenCalled();
  });
});
