import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import type * as NodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LogEntry, Tab } from '../tab/types.js';

const watchMock = vi.fn();

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return { ...actual, watch: (...args: unknown[]) => watchMock(...args) };
});

const changedPathsMock = vi.fn((_root: string): Promise<Map<string, string>> => Promise.resolve(new Map<string, string>()));
const currentBranchMock = vi.fn((_root: string): Promise<string | undefined> => Promise.resolve(undefined));
const remoteUrlMock = vi.fn((_root: string): Promise<string | undefined> => Promise.resolve(undefined));
const pullRootMock = vi.fn((_root: string): Promise<string> => Promise.resolve(''));

vi.mock('../git-status.js', () => ({
  changedPaths: (...args: [string]) => changedPathsMock(...args),
  currentBranch: (...args: [string]) => currentBranchMock(...args),
  remoteUrl: (...args: [string]) => remoteUrlMock(...args),
}));

vi.mock('../git-pull.js', () => ({
  pullRoot: (...args: [string]) => pullRootMock(...args),
}));

const { FileNavigatorManager } = await import('./manager.js');
type FileNavigatorManagerInstance = InstanceType<typeof FileNavigatorManager>;

describe('FileNavigatorManager', () => {
  let root: string;
  let otherRoot: string;
  let outputs: string[];
  let tabs: Tab[];
  let activeTab: number;
  let managers: unknown;
  let closeFns: (() => void)[];
  let retargetEditorTabMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'file-navigator-mgr-'));
    otherRoot = mkdtempSync(path.join(tmpdir(), 'file-navigator-mgr-other-'));
    outputs = [];
    activeTab = 0;
    closeFns = [];
    watchMock.mockReset();
    changedPathsMock.mockReset();
    changedPathsMock.mockResolvedValue(new Map());
    currentBranchMock.mockReset();
    currentBranchMock.mockResolvedValue(undefined);
    remoteUrlMock.mockReset();
    remoteUrlMock.mockResolvedValue(undefined);
    pullRootMock.mockReset();
    pullRootMock.mockResolvedValue('');
    watchMock.mockImplementation(() => {
      const close = vi.fn();
      closeFns.push(close);
      return { close };
    });
    const janus: Tab = {
      label: 'janus', dotColor: '#fff', number: 1, group: 1, groupColor: '#fff',
      log: [], cmdHistory: [], cmdHistoryIdx: -1, scrollOffset: 0,
    };
    const other: Tab = {
      label: 'other', dotColor: '#fff', number: 1, group: 1, groupColor: '#fff',
      log: [], cmdHistory: [], cmdHistoryIdx: -1, scrollOffset: 0,
    };
    tabs = [janus, other];
    retargetEditorTabMock = vi.fn();
    managers = {
      tab: {
        get tabs() { return tabs; },
        cwdOf: (label: string) => (label === 'other' ? otherRoot : root),
        append: (_label: string, entry: LogEntry) => { outputs.push(entry.output); },
        findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
        setActiveTab: (index: number) => { activeTab = index; },
        setDock: (index: number, dock: 'left' | 'right' | null) => {
          const tab = tabs[index];
          if (!tab) return;
          tab.dock = dock ?? undefined;
          if (dock === null) activeTab = index;
        },
        cur: () => tabs[activeTab],
        mostRecentFileNavigatorLabel: () => tabs.find((t) => t.files)?.label,
        setCwd: () => {},
        openFilesTab: (view: { root: string; rows: unknown[] }) => {
          const label = `navigator${tabs.length > 2 ? `-${tabs.length}` : ''}`;
          tabs = [...tabs, { ...janus, label, files: view as never }];
          activeTab = tabs.length - 1;
        },
        retargetEditorTab: retargetEditorTabMock,
      },
    };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const run = (): FileNavigatorManagerInstance => new FileNavigatorManager(managers as never);

  function installRemoteWorkspace() {
    const source = tabs.find((tab) => tab.label === 'other')!;
    source.remote = { host: 'devbox', address: 'devbox:/srv/project' };
    const channel = {
      attachNavigator: vi.fn(), detachNavigator: vi.fn(), send: vi.fn(),
    };
    const remote = {
      get: vi.fn(() => channel),
      readyOf: vi.fn(() => Promise.resolve('/remote/ws')),
      workspaceOf: vi.fn(() => '/remote/ws'),
      attach: vi.fn(() => true),
      release: vi.fn(),
    };
    (managers as { remote: typeof remote }).remote = remote;
    return { channel, remote, source };
  }

  it('opens a files tab rooted at the issuing tab cwd and watches the root', () => {
    const manager = run();
    manager.open('files', 'janus');
    const tab = tabs.find((t) => t.label.startsWith('navigator'));
    expect(tab).toBeDefined();
    expect(tab!.files!.root).toBe(root);
    expect(watchMock).toHaveBeenCalledTimes(1);
  });

  it('opens files in a remote label over that label\'s existing workspace channel', () => {
    const { remote, source } = installRemoteWorkspace();
    const manager = run();
    manager.open('files in other', 'janus');
    const tab = tabs.find((candidate) => candidate.label.startsWith('navigator'))!;
    expect(tab.files).toMatchObject({ root: '/remote/ws', remote: source.remote });
    expect(remote.attach).toHaveBeenCalledWith(tab.label, 'other');
  });

  it('opens the metadata-row navigator remotely and keeps focus on its source tab', () => {
    const { remote, source } = installRemoteWorkspace();
    const manager = run();
    manager.openOrRetarget('other');
    const tab = tabs.find((candidate) => candidate.label.startsWith('navigator'))!;
    expect(tab.files).toMatchObject({ root: '/remote/ws', remote: source.remote });
    expect(tab.dock).toBe('left');
    expect(remote.attach).toHaveBeenCalledWith(tab.label, 'other');
    expect(tabs[activeTab].label).toBe('other');
  });

  it('resolves a relative path against cwd', () => {
    mkdirSync(path.join(root, 'sub'));
    const manager = run();
    manager.open('files sub', 'janus');
    const tab = tabs.find((t) => t.label.startsWith('navigator'));
    expect(tab!.files!.root).toBe(path.join(root, 'sub'));
  });

  it('errors into the creator transcript when the target is not a directory', () => {
    writeFileSync(path.join(root, 'file.txt'), '');
    const manager = run();
    manager.open('files file.txt', 'janus');
    expect(outputs.at(-1)).toContain('not a directory');
    expect(tabs.some((t) => t.label.startsWith('navigator'))).toBe(false);
  });

  it('opens a waiting tab for a not-yet-existing path instead of erroring', () => {
    const manager = run();
    const missing = path.join(root, 'not-yet-there');
    manager.open('files not-yet-there', 'janus');
    const tab = tabs.find((t) => t.label.startsWith('navigator'));
    expect(tab).toBeDefined();
    expect(tab!.files!.waitingFor).toBe(missing);
    expect(tab!.files!.rows).toEqual([]);
    expect(outputs).toEqual([]);
  });

  it('populates the tree and clears waitingFor once the directory is created', () => {
    vi.useFakeTimers();
    try {
      const manager = run();
      const missing = path.join(root, 'not-yet-there');
      manager.open('files not-yet-there', 'janus');
      mkdirSync(missing);
      writeFileSync(path.join(missing, 'new.txt'), '');
      vi.advanceTimersByTime(500);
      const tab = tabs.find((t) => t.label.startsWith('navigator'));
      expect(tab!.files!.waitingFor).toBeUndefined();
      expect(tab!.files!.rows.some((r) => r.path === 'new.txt')).toBe(true);
      expect(watchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops polling when the waiting tab is closed', () => {
    vi.useFakeTimers();
    try {
      const manager = run();
      const missing = path.join(root, 'not-yet-there');
      manager.open('files not-yet-there', 'janus');
      const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
      manager.closeTab(label);
      mkdirSync(missing);
      expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
      expect(watchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('focuses the existing tab instead of duplicating for the same root', () => {
    const manager = run();
    manager.open('files', 'janus');
    const countAfterFirst = tabs.length;
    manager.open('files', 'janus');
    expect(tabs.length).toBe(countAfterFirst);
  });

  it('toggle expands a directory (adds a watcher) and collapses it (closes the watcher)', () => {
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'index.ts'), '');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.toggle(label, 'src');
    const tabAfterExpand = tabs.find((t) => t.label === label)!;
    expect(tabAfterExpand.files!.rows.some((r) => r.path === 'src/index.ts')).toBe(true);
    expect(watchMock).toHaveBeenCalledTimes(2);

    manager.toggle(label, 'src');
    const tabAfterCollapse = tabs.find((t) => t.label === label)!;
    expect(tabAfterCollapse.files!.rows.some((r) => r.path === 'src/index.ts')).toBe(false);
    expect(closeFns[1]).toHaveBeenCalled();
  });

  it('ignores toggle paths that escape the navigator root', () => {
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.toggle(label, '../outside');
    expect(watchMock).toHaveBeenCalledTimes(1);
  });

  it('collapseAll leaves only the root watcher open', () => {
    mkdirSync(path.join(root, 'a'));
    mkdirSync(path.join(root, 'b'));
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.toggle(label, 'a');
    manager.toggle(label, 'b');
    expect(watchMock).toHaveBeenCalledTimes(3);
    manager.collapseAll(label);
    expect(closeFns[1]).toHaveBeenCalled();
    expect(closeFns[2]).toHaveBeenCalled();
    expect(closeFns[0]).not.toHaveBeenCalled();
    const tab = tabs.find((t) => t.label === label)!;
    expect(tab.files!.rows.map((r) => r.path)).toEqual(['..', 'a', 'b']);
  });

  it('search resolves the tab-root-relative file list for the Search-files pop-up', async () => {
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'index.ts'), '');
    writeFileSync(path.join(root, 'README.md'), '');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    const paths = await manager.search(label);
    expect(paths.toSorted((a, b) => a.localeCompare(b))).toEqual(['README.md', 'src/index.ts']);
  });

  it('search resolves to an empty list for an unknown tab label', async () => {
    const manager = run();
    expect(await manager.search('missing')).toEqual([]);
  });

  it('reveal adds every ancestor of a nested path to expanded and rebuilds so the target row is visible', () => {
    mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
    writeFileSync(path.join(root, 'a', 'b', 'c.txt'), '');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.reveal(label, 'a/b/c.txt');
    const tab = tabs.find((t) => t.label === label)!;
    expect(tab.files!.rows.map((r) => r.path)).toEqual(expect.arrayContaining(['a', 'a/b', 'a/b/c.txt']));
    expect(watchMock).toHaveBeenCalledTimes(3);
  });

  it('reveal on a root-level path adds nothing to expanded and still rebuilds harmlessly', () => {
    writeFileSync(path.join(root, 'top.txt'), '');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.reveal(label, 'top.txt');
    const tab = tabs.find((t) => t.label === label)!;
    expect(tab.files!.rows.map((r) => r.path)).toContain('top.txt');
    expect(watchMock).toHaveBeenCalledTimes(1);
  });

  it('reveal is a no-op for an unknown tab label', () => {
    const manager = run();
    expect(() => manager.reveal('missing', 'a/b.txt')).not.toThrow();
  });

  it('a watch event triggers exactly one rebuild after the debounce window', () => {
    vi.useFakeTimers();
    try {
      const manager = run();
      manager.open('files', 'janus');
      const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
      const onEvent = watchMock.mock.calls[0][1] as () => void;
      writeFileSync(path.join(root, 'new.txt'), '');
      onEvent();
      onEvent();
      onEvent();
      vi.advanceTimersByTime(150);
      const tab = tabs.find((t) => t.label === label)!;
      expect(tab.files!.rows.some((r) => r.path === 'new.txt')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('prunes a deleted expanded dir from expanded and closes its watcher', () => {
    vi.useFakeTimers();
    try {
      mkdirSync(path.join(root, 'gone'));
      const manager = run();
      manager.open('files', 'janus');
      const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
      manager.toggle(label, 'gone');
      rmSync(path.join(root, 'gone'), { recursive: true, force: true });
      const onEvent = watchMock.mock.calls[0][1] as () => void;
      onEvent();
      vi.advanceTimersByTime(150);
      expect(closeFns[1]).toHaveBeenCalled();
      const tab = tabs.find((t) => t.label === label)!;
      expect(tab.files!.rows.some((r) => r.path === 'gone')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reroot walks up to the parent directory, swaps watchers, updates cwd, and rebuilds rows', () => {
    const setCwdCalls: [string, string][] = [];
    (managers as { tab: { setCwd: (label: string, cwd: string) => void } }).tab.setCwd = (label, cwd) => { setCwdCalls.push([label, cwd]); };
    mkdirSync(path.join(root, 'sub'));
    const manager = run();
    manager.open('files sub', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    expect(watchMock).toHaveBeenCalledTimes(1);

    manager.reroot(label);

    const tab = tabs.find((t) => t.label === label)!;
    expect(tab.files!.root).toBe(root);
    expect(tab.files!.rows.some((r) => r.path === 'sub')).toBe(true);
    expect(watchMock).toHaveBeenCalledTimes(2);
    expect(closeFns[0]).toHaveBeenCalled();
    expect(setCwdCalls).toContainEqual([label, root]);
  });

  it('reroot clears expanded directories and closes their watchers too', () => {
    mkdirSync(path.join(root, 'sub'));
    mkdirSync(path.join(root, 'sub', 'inner'));
    const manager = run();
    manager.open('files sub', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.toggle(label, 'inner');
    expect(watchMock).toHaveBeenCalledTimes(2);

    manager.reroot(label);

    expect(closeFns[0]).toHaveBeenCalled();
    expect(closeFns[1]).toHaveBeenCalled();
    expect(watchMock).toHaveBeenCalledTimes(3);
  });

  it('reroot is a no-op once already at the filesystem root', () => {
    const manager = run();
    manager.open('files /', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    watchMock.mockClear();

    manager.reroot(label);

    const tab = tabs.find((t) => t.label === label)!;
    expect(tab.files!.root).toBe('/');
    expect(watchMock).not.toHaveBeenCalled();
  });

  it('reroot on an unknown tab is a no-op', () => {
    const manager = run();
    expect(() => manager.reroot('ghost')).not.toThrow();
  });

  it('reroot with a relPath sets the target directory as the new root', () => {
    mkdirSync(path.join(root, 'sub'));
    mkdirSync(path.join(root, 'sub', 'inner'));
    const manager = run();
    manager.open('files sub', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    expect(watchMock).toHaveBeenCalledTimes(1);

    manager.reroot(label, 'inner');

    const tab = tabs.find((t) => t.label === label)!;
    expect(tab.files!.root).toBe(path.join(root, 'sub', 'inner'));
    expect(watchMock).toHaveBeenCalledTimes(2);
    expect(closeFns[0]).toHaveBeenCalled();
  });

  it('ignores reroot paths that escape the navigator root', () => {
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.reroot(label, '../outside');
    expect(tabs.find((t) => t.label === label)!.files!.root).toBe(root);
  });

  it('files left docks a newly created tab into the left sidebar', () => {
    const manager = run();
    manager.open('files left', 'janus');
    const tab = tabs.find((t) => t.label.startsWith('navigator'));
    expect(tab!.dock).toBe('left');
    expect(tab!.files!.root).toBe(root);
  });

  it('files right <path> resolves the path and docks right', () => {
    mkdirSync(path.join(root, 'sub'));
    const manager = run();
    manager.open('files right sub', 'janus');
    const tab = tabs.find((t) => t.label.startsWith('navigator'));
    expect(tab!.dock).toBe('right');
    expect(tab!.files!.root).toBe(path.join(root, 'sub'));
  });

  it('a directory literally named left/right is reachable via a path form', () => {
    mkdirSync(path.join(root, 'left'));
    const manager = run();
    manager.open('files ./left', 'janus');
    const tab = tabs.find((t) => t.label.startsWith('navigator'));
    expect(tab!.files!.root).toBe(path.join(root, 'left'));
    expect(tab!.dock).toBeUndefined();
  });

  it('files in <label> roots the tree at the referenced tab\'s cwd', () => {
    const manager = run();
    manager.open('files in other', 'janus');
    const tab = tabs.find((t) => t.label.startsWith('navigator'));
    expect(tab!.files!.root).toBe(otherRoot);
    expect(tab!.dock).toBeUndefined();
  });

  it('files in <label> on <side> roots at the referenced tab\'s cwd and docks', () => {
    const manager = run();
    manager.open('files in other on left', 'janus');
    const tab = tabs.find((t) => t.label.startsWith('navigator'));
    expect(tab!.files!.root).toBe(otherRoot);
    expect(tab!.dock).toBe('left');
  });

  it('files on <side> in <label> supports the reversed clause order', () => {
    const manager = run();
    manager.open('files on right in other', 'janus');
    const tab = tabs.find((t) => t.label.startsWith('navigator'));
    expect(tab!.files!.root).toBe(otherRoot);
    expect(tab!.dock).toBe('right');
  });

  it('files on <side> docks without changing the root', () => {
    const manager = run();
    manager.open('files on left', 'janus');
    const tab = tabs.find((t) => t.label.startsWith('navigator'));
    expect(tab!.dock).toBe('left');
    expect(tab!.files!.root).toBe(root);
  });

  it('files in <unknown label> errors into the creator transcript and creates no tab', () => {
    const manager = run();
    manager.open('files in ghost', 'janus');
    expect(outputs.at(-1)).toContain('No tab named "ghost".');
    expect(tabs.some((t) => t.label.startsWith('navigator'))).toBe(false);
  });

  it('a directory literally named in/on is reachable via a path form', () => {
    mkdirSync(path.join(root, 'in'));
    const manager = run();
    manager.open('files ./in', 'janus');
    const tab = tabs.find((t) => t.label.startsWith('navigator'));
    expect(tab!.files!.root).toBe(path.join(root, 'in'));
    expect(tab!.dock).toBeUndefined();
  });

  it('re-docking an existing root moves it instead of duplicating', () => {
    const manager = run();
    manager.open('files', 'janus');
    const countAfterFirst = tabs.length;
    manager.open('files left', 'janus');
    expect(tabs.length).toBe(countAfterFirst);
    const tab = tabs.find((t) => t.label.startsWith('navigator'));
    expect(tab!.dock).toBe('left');
  });

  it('bare files on an existing docked root undocks it (no duplicate, dock cleared)', () => {
    const manager = run();
    manager.open('files left', 'janus');
    const countAfterDock = tabs.length;
    manager.open('files', 'janus');
    expect(tabs.length).toBe(countAfterDock);
    const tab = tabs.find((t) => t.label.startsWith('navigator'));
    expect(tab!.dock).toBeUndefined();
  });

  it('move renames the file on disk and rebuilds the tree', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'notes.txt'), 'hi');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.move(label, 'notes.txt', 'dest');
    const tab = tabs.find((t) => t.label === label)!;
    expect(tab.files!.rows.some((r) => r.path === 'notes.txt')).toBe(false);
    expect(readFileSync(path.join(root, 'dest', 'notes.txt'), 'utf8')).toBe('hi');
  });

  it('rejects moving an item onto itself', () => {
    writeFileSync(path.join(root, 'notes.txt'), 'hi');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.move(label, 'notes.txt', 'notes.txt');
    expect(readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('hi');
  });

  it('rejects moving a directory into its own descendant', () => {
    mkdirSync(path.join(root, 'src'));
    mkdirSync(path.join(root, 'src', 'nested'));
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.move(label, 'src', 'src/nested');
    const tab = tabs.find((t) => t.label === label)!;
    expect(tab.files!.rows.some((r) => r.path === 'src')).toBe(true);
  });

  it('delete removes a file from disk and rebuilds the tree', () => {
    writeFileSync(path.join(root, 'notes.txt'), 'hi');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.delete(label, 'notes.txt');
    const tab = tabs.find((t) => t.label === label)!;
    expect(tab.files!.rows.some((r) => r.path === 'notes.txt')).toBe(false);
    expect(existsSync(path.join(root, 'notes.txt'))).toBe(false);
  });

  it('delete removes a directory recursively', () => {
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'index.ts'), '');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.delete(label, 'src');
    const tab = tabs.find((t) => t.label === label)!;
    expect(tab.files!.rows.some((r) => r.path === 'src')).toBe(false);
    expect(existsSync(path.join(root, 'src'))).toBe(false);
  });

  it('rename renames a file on disk, rebuilds, and syncs an open editor tab', () => {
    writeFileSync(path.join(root, 'notes.txt'), 'hi');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.rename(label, 'notes.txt', 'renamed.txt');
    const tab = tabs.find((t) => t.label === label)!;
    expect(tab.files!.rows.some((r) => r.path === 'renamed.txt')).toBe(true);
    expect(tab.files!.rows.some((r) => r.path === 'notes.txt')).toBe(false);
    expect(readFileSync(path.join(root, 'renamed.txt'), 'utf8')).toBe('hi');
    expect(retargetEditorTabMock).toHaveBeenCalledWith(path.join(root, 'notes.txt'), path.join(root, 'renamed.txt'));
  });

  it('rename renames a directory', () => {
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'index.ts'), '');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.rename(label, 'src', 'lib');
    const tab = tabs.find((t) => t.label === label)!;
    expect(tab.files!.rows.some((r) => r.path === 'lib')).toBe(true);
    expect(existsSync(path.join(root, 'src'))).toBe(false);
  });

  it('rename is a silent no-op when the source is missing', () => {
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.rename(label, 'missing.txt', 'renamed.txt');
    expect(retargetEditorTabMock).not.toHaveBeenCalled();
    expect(existsSync(path.join(root, 'renamed.txt'))).toBe(false);
  });

  it('rename is a no-op when newName contains a path separator', () => {
    writeFileSync(path.join(root, 'notes.txt'), 'hi');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.rename(label, 'notes.txt', 'dest/renamed.txt');
    expect(readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('hi');
    expect(retargetEditorTabMock).not.toHaveBeenCalled();
  });

  it('delete on an unknown tab is a no-op', () => {
    writeFileSync(path.join(root, 'notes.txt'), 'hi');
    const manager = run();
    manager.delete('nonexistent', 'notes.txt');
    expect(existsSync(path.join(root, 'notes.txt'))).toBe(true);
  });

  it('a failed delete leaves the tree unchanged', () => {
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    expect(() => manager.delete(label, 'does-not-exist.txt')).not.toThrow();
    const tab = tabs.find((t) => t.label === label)!;
    expect(tab.files!.rows.some((r) => r.path === 'does-not-exist.txt')).toBe(false);
  });

  it('undo reverses the most recent move', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'notes.txt'), 'hi');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.move(label, 'notes.txt', 'dest');

    const result = manager.undo(label);

    expect(result).toEqual({});
    expect(existsSync(path.join(root, 'notes.txt'))).toBe(true);
    expect(existsSync(path.join(root, 'dest', 'notes.txt'))).toBe(false);
  });

  it('undo reverses multiple moves in stack order', () => {
    mkdirSync(path.join(root, 'a'));
    mkdirSync(path.join(root, 'b'));
    writeFileSync(path.join(root, 'x.txt'), 'x');
    writeFileSync(path.join(root, 'y.txt'), 'y');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.move(label, 'x.txt', 'a');
    manager.move(label, 'y.txt', 'b');

    manager.undo(label);
    expect(existsSync(path.join(root, 'b', 'y.txt'))).toBe(false);
    expect(existsSync(path.join(root, 'y.txt'))).toBe(true);
    expect(existsSync(path.join(root, 'a', 'x.txt'))).toBe(true);

    manager.undo(label);
    expect(existsSync(path.join(root, 'a', 'x.txt'))).toBe(false);
    expect(existsSync(path.join(root, 'x.txt'))).toBe(true);
  });

  it('redo re-applies an undone move', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'notes.txt'), 'hi');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.move(label, 'notes.txt', 'dest');
    manager.undo(label);

    const result = manager.redo(label);

    expect(result).toEqual({});
    expect(existsSync(path.join(root, 'dest', 'notes.txt'))).toBe(true);
    expect(existsSync(path.join(root, 'notes.txt'))).toBe(false);
  });

  it('a fresh move after an undo clears the redo stack', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'notes.txt'), 'hi');
    writeFileSync(path.join(root, 'other.txt'), 'hi');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.move(label, 'notes.txt', 'dest');
    manager.undo(label);
    manager.move(label, 'other.txt', 'dest');

    const result = manager.redo(label);

    expect(result).toEqual({});
    expect(existsSync(path.join(root, 'dest', 'notes.txt'))).toBe(false);
  });

  it('undo on an empty stack is a silent no-op', () => {
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    expect(manager.undo(label)).toEqual({});
  });

  it('redo on an empty stack is a silent no-op', () => {
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    expect(manager.redo(label)).toEqual({});
  });

  it('undo reports a conflict without mutating either stack when the destination is occupied', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'notes.txt'), 'moved');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.move(label, 'notes.txt', 'dest');
    writeFileSync(path.join(root, 'notes.txt'), 'new file at original location');

    const result = manager.undo(label);

    expect(result).toEqual({ conflict: { fromRelPath: 'dest/notes.txt', toRelPath: '' } });
    expect(existsSync(path.join(root, 'dest', 'notes.txt'))).toBe(true);
    expect(readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('new file at original location');
  });

  it('a follow-up overwrite call consumes the pending undo entry', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'notes.txt'), 'moved');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.move(label, 'notes.txt', 'dest');
    writeFileSync(path.join(root, 'notes.txt'), 'stale');
    manager.undo(label);

    const result = manager.undo(label, true);

    expect(result).toEqual({});
    expect(readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('moved');
  });

  it('redo reports a conflict without mutating either stack when the destination is occupied', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'notes.txt'), 'hi');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.move(label, 'notes.txt', 'dest');
    manager.undo(label);
    writeFileSync(path.join(root, 'dest', 'notes.txt'), 'blocked');

    const result = manager.redo(label);

    expect(result).toEqual({ conflict: { fromRelPath: 'notes.txt', toRelPath: 'dest' } });
    expect(readFileSync(path.join(root, 'dest', 'notes.txt'), 'utf8')).toBe('blocked');
    expect(existsSync(path.join(root, 'notes.txt'))).toBe(true);
  });

  it('moves a batch as one undo and redo history step', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'a.txt'), 'a');
    writeFileSync(path.join(root, 'b.txt'), 'b');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((tab) => tab.label.startsWith('navigator'))!.label;

    expect(manager.moveMany(label, ['a.txt', 'b.txt'], 'dest')).toEqual({
      total: 2,
      failedPaths: [],
    });
    expect(manager.undo(label)).toEqual({ total: 2, failedPaths: [] });
    expect(existsSync(path.join(root, 'a.txt'))).toBe(true);
    expect(existsSync(path.join(root, 'b.txt'))).toBe(true);
    expect(manager.redo(label)).toEqual({ total: 2, failedPaths: [] });
    expect(existsSync(path.join(root, 'dest', 'a.txt'))).toBe(true);
    expect(existsSync(path.join(root, 'dest', 'b.txt'))).toBe(true);
  });

  it('keeps a vanished source reason through grouped undo bookkeeping', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'a.txt'), 'a');
    writeFileSync(path.join(root, 'b.txt'), 'b');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((tab) => tab.label.startsWith('navigator'))!.label;
    manager.moveMany(label, ['a.txt', 'b.txt'], 'dest');
    rmSync(path.join(root, 'dest', 'b.txt'));

    const result = manager.undo(label);

    expect(result).toMatchObject({ total: 2, failedPaths: ['dest/b.txt'] });
    expect(result.failureReasons?.['dest/b.txt']).toContain('no longer exists');
    expect(existsSync(path.join(root, 'a.txt'))).toBe(true);
  });

  it('preflights all grouped undo conflicts before moving anything', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'a.txt'), 'a');
    writeFileSync(path.join(root, 'b.txt'), 'b');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((tab) => tab.label.startsWith('navigator'))!.label;
    manager.moveMany(label, ['a.txt', 'b.txt'], 'dest');
    writeFileSync(path.join(root, 'a.txt'), 'blocked a');
    writeFileSync(path.join(root, 'b.txt'), 'blocked b');

    expect(manager.undo(label)).toEqual({
      total: 2,
      failedPaths: [],
      conflicts: [
        { fromRelPath: 'dest/b.txt', toRelPath: '' },
        { fromRelPath: 'dest/a.txt', toRelPath: '' },
      ],
    });
    expect(existsSync(path.join(root, 'dest', 'a.txt'))).toBe(true);
    expect(existsSync(path.join(root, 'dest', 'b.txt'))).toBe(true);
  });

  it('skips grouped undo conflicts and moves the remaining entries', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'a.txt'), 'a');
    writeFileSync(path.join(root, 'b.txt'), 'b');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((tab) => tab.label.startsWith('navigator'))!.label;
    manager.moveMany(label, ['a.txt', 'b.txt'], 'dest');
    writeFileSync(path.join(root, 'a.txt'), 'blocked');

    expect(manager.undo(label, false, true)).toEqual({ total: 2, failedPaths: [] });
    expect(existsSync(path.join(root, 'dest', 'a.txt'))).toBe(true);
    expect(existsSync(path.join(root, 'b.txt'))).toBe(true);
  });

  it('paste (copy) creates the item and undo removes what it created', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'a.txt'), 'a');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;

    expect(manager.paste(label, [path.join(root, 'a.txt')], 'dest', 'copy')).toEqual({ total: 1, failedPaths: [] });
    expect(existsSync(path.join(root, 'dest', 'a.txt'))).toBe(true);
    expect(existsSync(path.join(root, 'a.txt'))).toBe(true);

    expect(manager.undo(label)).toEqual({ total: 1, failedPaths: [] });
    expect(existsSync(path.join(root, 'dest', 'a.txt'))).toBe(false);
    expect(existsSync(path.join(root, 'a.txt'))).toBe(true);
  });

  it('keeps a vanished copy destination reason through undo bookkeeping', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'a.txt'), 'a');
    writeFileSync(path.join(root, 'b.txt'), 'b');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((tab) => tab.label.startsWith('navigator'))!.label;
    manager.paste(label, [path.join(root, 'a.txt'), path.join(root, 'b.txt')], 'dest', 'copy');
    const missing = path.join(root, 'dest', 'b.txt');
    rmSync(missing);

    const result = manager.undo(label);

    expect(result).toMatchObject({ total: 2, failedPaths: [missing] });
    expect(result.failureReasons?.[missing]).toContain('no longer exists');
    expect(existsSync(path.join(root, 'dest', 'a.txt'))).toBe(false);
  });

  it('paste (cut) moves the item and undo restores it, including across two different roots', () => {
    mkdirSync(path.join(otherRoot, 'dest'));
    writeFileSync(path.join(root, 'a.txt'), 'a');
    const manager = run();
    manager.open('files', 'janus');
    manager.open('files', 'other');
    const label = tabs.find((t) => t.files?.root === otherRoot)!.label;

    expect(manager.paste(label, [path.join(root, 'a.txt')], 'dest', 'cut')).toEqual({ total: 1, failedPaths: [] });
    expect(existsSync(path.join(root, 'a.txt'))).toBe(false);
    expect(existsSync(path.join(otherRoot, 'dest', 'a.txt'))).toBe(true);

    expect(manager.undo(label)).toEqual({ total: 1, failedPaths: [] });
    expect(existsSync(path.join(otherRoot, 'dest', 'a.txt'))).toBe(false);
    expect(existsSync(path.join(root, 'a.txt'))).toBe(true);
  });

  it('redo re-applies a paste (copy) after undo', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'a.txt'), 'a');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.paste(label, [path.join(root, 'a.txt')], 'dest', 'copy');
    manager.undo(label);

    expect(manager.redo(label)).toEqual({ total: 1, failedPaths: [] });
    expect(existsSync(path.join(root, 'dest', 'a.txt'))).toBe(true);
  });

  it('a plain move step still undoes exactly as before, alongside a paste step', () => {
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'a.txt'), 'a');
    writeFileSync(path.join(root, 'b.txt'), 'b');
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.move(label, 'a.txt', 'dest');
    manager.paste(label, [path.join(root, 'b.txt')], 'dest', 'copy');

    expect(manager.undo(label)).toEqual({ total: 1, failedPaths: [] });
    expect(existsSync(path.join(root, 'dest', 'b.txt'))).toBe(false);
    expect(manager.undo(label)).toEqual({});
    expect(existsSync(path.join(root, 'a.txt'))).toBe(true);
    expect(existsSync(path.join(root, 'dest', 'a.txt'))).toBe(false);
  });

  it('closeTab closes every watcher for that tab', () => {
    mkdirSync(path.join(root, 'src'));
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('navigator'))!.label;
    manager.toggle(label, 'src');
    manager.closeTab(label);
    expect(closeFns[0]).toHaveBeenCalled();
    expect(closeFns[1]).toHaveBeenCalled();
  });

  it('openOrRetarget opens a fresh, left-docked tree at the tab cwd but leaves the originating tab focused', () => {
    const manager = run();
    activeTab = 1; // simulate clicking the button from "other", not the first tab
    manager.openOrRetarget('other');
    const nav = tabs.find((t) => t.files);
    expect(nav).toBeDefined();
    expect(nav!.files!.root).toBe(otherRoot);
    expect(nav!.dock).toBe('left');
    expect(tabs[activeTab].label).toBe('other');
  });

  it('openOrRetarget retargets the existing navigator in place, preserving dock and tab position', () => {
    const manager = run();
    manager.openOrRetarget('janus');
    const nav = tabs.find((t) => t.files)!;
    const label = nav.label;
    const indexBefore = tabs.indexOf(nav);
    const lengthBefore = tabs.length;

    manager.openOrRetarget('other');

    const after = tabs.find((t) => t.label === label)!;
    expect(after.files!.root).toBe(otherRoot);
    expect(tabs.length).toBe(lengthBefore);
    expect(tabs.indexOf(after)).toBe(indexBefore);
    expect(after.dock).toBe('left');
  });

  it('openOrRetarget leaves the originating tab focused when retargeting an existing navigator', () => {
    const manager = run();
    manager.openOrRetarget('janus');
    activeTab = 1; // simulate the button now being clicked from "other"
    manager.openOrRetarget('other');
    expect(tabs[activeTab].label).toBe('other');
  });

  it('openOrRetarget clears the retargeted tab\'s expanded set, watchers, and undo/redo stacks', () => {
    mkdirSync(path.join(root, 'sub'));
    mkdirSync(path.join(root, 'dest'));
    writeFileSync(path.join(root, 'notes.txt'), 'hi');
    writeFileSync(path.join(root, 'other.txt'), 'hi');
    const manager = run();
    manager.openOrRetarget('janus');
    const label = tabs.find((t) => t.files)!.label;
    manager.toggle(label, 'sub');
    manager.move(label, 'notes.txt', 'dest');
    manager.move(label, 'other.txt', 'dest');
    manager.undo(label);

    type Introspect = { tabs: Map<string, { expanded: Set<string>; undoStack: unknown[]; redoStack: unknown[] }> };
    const before = (manager as unknown as Introspect).tabs.get(label)!;
    expect(before.expanded.size).toBe(1);
    expect(before.undoStack).toHaveLength(1);
    expect(before.redoStack).toHaveLength(1);

    manager.openOrRetarget('other');

    const after = (manager as unknown as Introspect).tabs.get(label)!;
    expect(after.expanded.size).toBe(0);
    expect(after.undoStack).toHaveLength(0);
    expect(after.redoStack).toHaveLength(0);
    expect(closeFns[0]).toHaveBeenCalled();
    expect(closeFns[1]).toHaveBeenCalled();
  });

  it('openOrRetarget opening a fresh tree also refreshes its branch and github url', async () => {
    currentBranchMock.mockResolvedValue('main');
    remoteUrlMock.mockResolvedValue('git@github.com:owner/repo.git');
    const manager = run();
    manager.openOrRetarget('other');
    const label = tabs.find((t) => t.files)!.label;
    await vi.waitFor(() => {
      expect(tabs.find((t) => t.label === label)!.files!.githubUrl).toBe('https://github.com/owner/repo/commits/main/');
    });
  });

  it('openOrRetarget retargeting an existing navigator also refreshes its branch and github url', async () => {
    currentBranchMock.mockResolvedValue('main');
    remoteUrlMock.mockResolvedValue('git@github.com:owner/repo.git');
    const manager = run();
    manager.openOrRetarget('janus');
    const label = tabs.find((t) => t.files)!.label;
    await vi.waitFor(() => expect(remoteUrlMock).toHaveBeenCalledTimes(1));
    currentBranchMock.mockResolvedValue('feature');

    manager.openOrRetarget('other');

    await vi.waitFor(() => {
      expect(tabs.find((t) => t.label === label)!.files!.githubUrl).toBe('https://github.com/owner/repo/commits/feature/');
    });
  });

  describe('git pull', () => {
    const navLabel = () => tabs.find((t) => t.label.startsWith('navigator'))!.label;
    const navTab = () => tabs.find((t) => t.label.startsWith('navigator'))!;
    const openNotificationsTab = () => {
      tabs = [...tabs, {
        label: 'notifications', dotColor: '#fff', number: 1, group: 1, groupColor: '#fff',
        log: [], cmdHistory: [], cmdHistoryIdx: -1, scrollOffset: 0, view: 'notifications',
      } as Tab];
    };

    it('re-reads cached rows from disk and refreshes git metadata', async () => {
      const manager = run();
      manager.open('files', 'janus');
      writeFileSync(path.join(root, 'pulled.txt'), 'new');
      currentBranchMock.mockResolvedValue('main');
      remoteUrlMock.mockResolvedValue('git@github.com:owner/repo.git');

      manager.pull(navLabel());

      await vi.waitFor(() => {
        expect(navTab().files!.rows.some((row) => row.path === 'pulled.txt')).toBe(true);
      });
      await vi.waitFor(() => {
        expect(navTab().files!.githubUrl).toBe('https://github.com/owner/repo/commits/main/');
      });
      expect(pullRootMock).toHaveBeenCalledWith(root);
    });

    it('reports a successful pull as one notifications-feed line carrying git\'s summary', async () => {
      openNotificationsTab();
      pullRootMock.mockResolvedValue('3 files changed, 12 insertions(+), 4 deletions(-)');
      const manager = run();
      manager.open('files', 'janus');

      manager.pull(navLabel());

      await vi.waitFor(() => {
        expect(outputs).toContain('Pulled from origin: 3 files changed, 12 insertions(+), 4 deletions(-)');
      });
      expect(outputs).toHaveLength(1);
    });

    it('reports a pull that brought nothing without a summary suffix', async () => {
      openNotificationsTab();
      const manager = run();
      manager.open('files', 'janus');

      manager.pull(navLabel());

      await vi.waitFor(() => expect(outputs).toContain('Pulled from origin'));
      expect(outputs).toHaveLength(1);
    });

    it('reports a failed pull as one notifications-feed line and rebuilds nothing', async () => {
      openNotificationsTab();
      pullRootMock.mockRejectedValue(new Error('git pull failed'));
      const manager = run();
      manager.open('files', 'janus');
      writeFileSync(path.join(root, 'failed-pull.txt'), 'new');

      manager.pull(navLabel());
      await vi.waitFor(() => expect(outputs).toContain('Could not pull: git pull failed'));

      expect(outputs).toHaveLength(1);
      expect(pullRootMock).toHaveBeenCalledWith(root);
      expect(navTab().files!.rows.some((row) => row.path === 'failed-pull.txt')).toBe(false);
    });

    it('ignores a second pull while one is still in flight', async () => {
      openNotificationsTab();
      const { promise, resolve } = Promise.withResolvers<string>();
      pullRootMock.mockReturnValue(promise);
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();

      manager.pull(label);
      manager.pull(label);
      expect(pullRootMock).toHaveBeenCalledTimes(1);

      resolve('Already up to date.');
      await vi.waitFor(() => expect(navTab().files!.pull).toBe('pulled'));
      expect(outputs).toEqual(['Pulled from origin: Already up to date.']);
      manager.pull(label);
      expect(pullRootMock).toHaveBeenCalledTimes(2);
    });

    it('signals working, then success, then returns the button to rest', async () => {
      vi.useFakeTimers();
      try {
        pullRootMock.mockResolvedValue('Already up to date.');
        const manager = run();
        manager.open('files', 'janus');

        manager.pull(navLabel());
        expect(navTab().files!.pull).toBe('pulling');

        await vi.advanceTimersByTimeAsync(0);
        expect(navTab().files!.pull).toBe('pulled');

        await vi.advanceTimersByTimeAsync(3000);
        expect(navTab().files!.pull).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('signals failure the same way and returns to rest', async () => {
      vi.useFakeTimers();
      try {
        pullRootMock.mockRejectedValue(new Error('git pull failed'));
        const manager = run();
        manager.open('files', 'janus');

        manager.pull(navLabel());
        expect(navTab().files!.pull).toBe('pulling');

        await vi.advanceTimersByTimeAsync(0);
        expect(navTab().files!.pull).toBe('error');

        await vi.advanceTimersByTimeAsync(3000);
        expect(navTab().files!.pull).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('drops the flash timer when the tab closes before it fires', async () => {
      vi.useFakeTimers();
      try {
        pullRootMock.mockResolvedValue('Already up to date.');
        const manager = run();
        manager.open('files', 'janus');
        const label = navLabel();

        manager.pull(label);
        await vi.advanceTimersByTimeAsync(0);
        manager.closeTab(label);

        expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
      } finally {
        vi.useRealTimers();
      }
    });

    it('is a no-op for an unknown tab label', () => {
      const manager = run();
      manager.pull('missing');
      expect(pullRootMock).not.toHaveBeenCalled();
    });
  });

  describe('detail modes', () => {
    const navLabel = () => tabs.find((t) => t.label.startsWith('navigator'))!.label;
    const navTab = () => tabs.find((t) => t.label.startsWith('navigator'))!;

    it('opens in name mode with no per-row stat values', () => {
      writeFileSync(path.join(root, 'a.txt'), 'hello');
      const manager = run();
      manager.open('files', 'janus');

      expect(navTab().files!.details).toBe('name');
      expect(navTab().files!.rows.find((r) => r.path === 'a.txt')!.size).toBeUndefined();
      expect(manager.detailOf(navLabel())).toBe('name');
    });

    it('paints stat values on the first payload when opened with a mode', () => {
      writeFileSync(path.join(root, 'a.txt'), 'hello');
      const manager = run();
      manager.open('files with size', 'janus');

      expect(navTab().files!.details).toBe('size');
      expect(navTab().files!.rows.find((r) => r.path === 'a.txt')!.size).toBe(5);
    });

    it('switches an open tree via setDetail and rebuilds its rows', () => {
      writeFileSync(path.join(root, 'a.txt'), 'hello');
      const manager = run();
      manager.open('files', 'janus');

      manager.setDetail(navLabel(), 'permissions');

      expect(navTab().files!.details).toBe('permissions');
      expect(typeof navTab().files!.rows.find((r) => r.path === 'a.txt')!.mode).toBe('number');
    });

    it('applies a with clause to an already-open tree instead of opening a second one', () => {
      writeFileSync(path.join(root, 'a.txt'), 'hello');
      const manager = run();
      manager.open('files', 'janus');
      const before = tabs.length;

      manager.open('files with modified', 'janus');

      expect(tabs.length).toBe(before);
      expect(navTab().files!.details).toBe('modified');
      expect(typeof navTab().files!.rows.find((r) => r.path === 'a.txt')!.modified).toBe('number');
    });

    it('combines a with clause with in and on in one command', () => {
      writeFileSync(path.join(otherRoot, 'a.txt'), 'hello');
      const manager = run();
      manager.open('files in other on left with size', 'janus');

      expect(navTab().files!.root).toBe(otherRoot);
      expect(navTab().dock).toBe('left');
      expect(navTab().files!.details).toBe('size');
      expect(navTab().files!.rows.find((r) => r.path === 'a.txt')!.size).toBe(5);
    });

    it('reads the default mode for a label with no tab and ignores setDetail for it', () => {
      const manager = run();
      manager.setDetail('ghost', 'size');
      expect(manager.detailOf('ghost')).toBe('name');
    });
  });

  describe('post-mutation cache invalidation', () => {
    const navTab = () => tabs.find((t) => t.label.startsWith('navigator'))!;
    const navLabel = () => navTab().label;
    const bystanderSize = () => navTab().files!.rows.find((r) => r.path === 'bystander.txt')!.size;

    // A tree opened in `size` mode over a shared fixture, with `bystander.txt`'s five-byte size
    // already read into the tab's stat cache — the stale value a redraw would repaint if the
    // mutation about to run failed to empty the cache first.
    function openPrimedTree(): FileNavigatorManagerInstance {
      mkdirSync(path.join(root, 'dest'));
      writeFileSync(path.join(root, 'bystander.txt'), 'hello');
      writeFileSync(path.join(root, 'a.txt'), 'a');
      writeFileSync(path.join(root, 'b.txt'), 'b');
      const manager = run();
      manager.open('files with size', 'janus');
      expect(bystanderSize()).toBe(5);
      return manager;
    }

    // Grow the bystander behind the navigator's back: nothing tells the tab about this, so only a
    // mutation that drops the cache can make the next payload report the new size.
    function goStale(): void {
      writeFileSync(path.join(root, 'bystander.txt'), 'hello again');
    }

    it('move re-reads cached stats before redrawing', () => {
      const manager = openPrimedTree();
      goStale();

      manager.move(navLabel(), 'a.txt', 'dest');

      expect(bystanderSize()).toBe(11);
    });

    it('moveMany re-reads cached stats before redrawing', () => {
      const manager = openPrimedTree();
      goStale();

      manager.moveMany(navLabel(), ['a.txt', 'b.txt'], 'dest');

      expect(bystanderSize()).toBe(11);
    });

    it('deleteMany re-reads cached stats before redrawing', () => {
      const manager = openPrimedTree();
      goStale();

      manager.deleteMany(navLabel(), ['a.txt']);

      expect(bystanderSize()).toBe(11);
    });

    it('paste re-reads cached stats before redrawing', () => {
      const manager = openPrimedTree();
      goStale();

      manager.paste(navLabel(), [path.join(root, 'a.txt')], 'dest', 'copy');

      expect(bystanderSize()).toBe(11);
    });

    it('undo re-reads cached stats before redrawing', () => {
      const manager = openPrimedTree();
      manager.move(navLabel(), 'a.txt', 'dest');
      goStale();

      manager.undo(navLabel());

      expect(bystanderSize()).toBe(11);
    });

    it('redo re-reads cached stats before redrawing', () => {
      const manager = openPrimedTree();
      manager.move(navLabel(), 'a.txt', 'dest');
      manager.undo(navLabel());
      goStale();

      manager.redo(navLabel());

      expect(bystanderSize()).toBe(11);
    });

    it('rename re-reads cached stats before redrawing', () => {
      const manager = openPrimedTree();
      goStale();

      manager.rename(navLabel(), 'a.txt', 'renamed.txt');

      expect(bystanderSize()).toBe(11);
    });

    it('delete re-reads cached stats before redrawing', () => {
      const manager = openPrimedTree();
      goStale();

      manager.delete(navLabel(), 'a.txt');

      expect(bystanderSize()).toBe(11);
    });

    it('createDirectory re-reads cached stats before redrawing', () => {
      const manager = openPrimedTree();
      goStale();

      manager.createDirectory(navLabel(), '');

      expect(bystanderSize()).toBe(11);
    });
  });

  describe('profile capture and restore', () => {
    const navLabel = () => tabs.find((t) => t.label.startsWith('navigator'))!.label;

    it('returns the expanded set as a sorted array', () => {
      mkdirSync(path.join(root, 'src'));
      mkdirSync(path.join(root, 'src', 'inner'));
      mkdirSync(path.join(root, 'docs'));
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      manager.toggle(label, 'src');
      manager.toggle(label, 'src/inner');
      manager.toggle(label, 'docs');

      expect(manager.expandedPaths(label)).toEqual(['docs', 'src', 'src/inner']);
    });

    it('returns an empty array for a label with no tab', () => {
      expect(run().expandedPaths('ghost')).toEqual([]);
    });

    it('expands and watches every saved directory that still exists, skipping one that does not', () => {
      mkdirSync(path.join(root, 'src'));
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      watchMock.mockClear();

      manager.restoreView(label, { expanded: ['src', 'gone'] });

      expect(manager.expandedPaths(label)).toEqual(['src']);
      expect(watchMock).toHaveBeenCalledTimes(1);
    });

    it('keeps only selection paths that have a visible row', () => {
      mkdirSync(path.join(root, 'src'));
      writeFileSync(path.join(root, 'src', 'a.ts'), '');
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();

      manager.restoreView(label, {
        expanded: ['src'], cursor: 'src/a.ts', anchor: 'src/gone.ts', selected: ['src', 'src/a.ts', 'src/gone.ts'],
      });

      const restore = tabs.find((t) => t.label === label)!.files!.restore!;
      expect(restore.cursor).toBe('src/a.ts');
      expect(restore.anchor).toBeUndefined();
      expect(restore.selected).toEqual(['src', 'src/a.ts']);
    });

    it('bumps the restore revision exactly once per call', () => {
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();

      manager.restoreView(label, {});
      const first = tabs.find((t) => t.label === label)!.files!.restore!.revision;
      manager.restoreView(label, {});
      const second = tabs.find((t) => t.label === label)!.files!.restore!.revision;

      expect(second).toBe(first + 1);
    });

    it('returns the opened label, the waiting label, and an existing tab\'s label', () => {
      const manager = run();

      const opened = manager.open('files', 'janus');
      expect(opened).toBe(navLabel());
      // The same root again finds the existing tab and redocks it, returning that same label.
      expect(manager.open('files on left', 'janus')).toBe(opened);

      const waiting = manager.open('files not-yet-there', 'janus');
      expect(waiting).toBe(tabs.at(-1)!.label);
    });

    it('returns undefined when the target is not a directory', () => {
      writeFileSync(path.join(root, 'file.txt'), '');
      expect(run().open('files file.txt', 'janus')).toBeUndefined();
    });
  });

  describe('git-modified coloring', () => {
    const navLabel = () => tabs.find((t) => t.label.startsWith('navigator'))!.label;

    it('applies the changed status once the async git refresh resolves, without a watcher event', async () => {
      writeFileSync(path.join(root, 'a.txt'), '');
      changedPathsMock.mockResolvedValue(new Map([['a.txt', 'changed']]));
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      expect(tabs.find((t) => t.label === label)!.files!.rows.find((r) => r.path === 'a.txt')?.gitStatus).toBeUndefined();
      await vi.waitFor(() => {
        const row = tabs.find((t) => t.label === label)!.files!.rows.find((r) => r.path === 'a.txt');
        expect(row?.gitStatus).toBe('changed');
      });
    });

    it('applies staged and conflict statuses distinctly', async () => {
      writeFileSync(path.join(root, 'staged.txt'), '');
      writeFileSync(path.join(root, 'conflict.txt'), '');
      changedPathsMock.mockResolvedValue(new Map([
        ['staged.txt', 'staged'],
        ['conflict.txt', 'conflict'],
      ]));
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      await vi.waitFor(() => {
        const rows = tabs.find((t) => t.label === label)!.files!.rows;
        expect(rows.find((r) => r.path === 'staged.txt')?.gitStatus).toBe('staged');
        expect(rows.find((r) => r.path === 'conflict.txt')?.gitStatus).toBe('conflict');
      });
    });

    it('an interactive toggle reuses the cached git map and spawns no new git call', async () => {
      mkdirSync(path.join(root, 'src'));
      writeFileSync(path.join(root, 'src', 'a.txt'), '');
      changedPathsMock.mockResolvedValue(new Map([['src/a.txt', 'changed']]));
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      await vi.waitFor(() => {
        const rows = tabs.find((t) => t.label === label)!.files!.rows;
        expect(rows.find((r) => r.path === 'src')?.gitStatus).toBe('changed');
      });
      expect(changedPathsMock).toHaveBeenCalledTimes(1);
      manager.toggle(label, 'src');
      expect(changedPathsMock).toHaveBeenCalledTimes(1);
      const rows = tabs.find((t) => t.label === label)!.files!.rows;
      expect(rows.find((r) => r.path === 'src/a.txt')?.gitStatus).toBe('changed');
      expect(rows.find((r) => r.path === 'src')?.gitStatus).toBe('changed');
    });

    it('reroot resets the cache (no stale coloring) and triggers a fresh refresh', async () => {
      mkdirSync(path.join(root, 'sub'));
      writeFileSync(path.join(root, 'sub', 'a.txt'), '');
      changedPathsMock.mockResolvedValue(new Map([['a.txt', 'changed']]));
      const manager = run();
      manager.open('files sub', 'janus');
      const label = navLabel();
      await vi.waitFor(() => expect(changedPathsMock).toHaveBeenCalledTimes(1));
      changedPathsMock.mockResolvedValue(new Map());
      manager.reroot(label);
      expect(tabs.find((t) => t.label === label)!.files!.rows.find((r) => r.path === 'sub')?.gitStatus).toBeUndefined();
      await vi.waitFor(() => expect(changedPathsMock).toHaveBeenCalledTimes(2));
    });

    it('coalesces overlapping refresh requests into exactly one extra git call', async () => {
      vi.useFakeTimers();
      try {
        const deferred = Promise.withResolvers<Map<string, string>>();
        changedPathsMock
          .mockImplementationOnce(() => deferred.promise)
          .mockResolvedValue(new Map());
        const manager = run();
        manager.open('files', 'janus');
        expect(changedPathsMock).toHaveBeenCalledTimes(1);
        const onEvent = watchMock.mock.calls[0][1] as () => void;
        onEvent();
        vi.advanceTimersByTime(150);
        onEvent();
        vi.advanceTimersByTime(150);
        expect(changedPathsMock).toHaveBeenCalledTimes(1);
        deferred.resolve(new Map());
        await Promise.resolve();
        await Promise.resolve();
        expect(changedPathsMock).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('discards a git refresh that resolves after its tab was closed', async () => {
      writeFileSync(path.join(root, 'a.txt'), '');
      const deferred = Promise.withResolvers<Map<string, string>>();
      changedPathsMock.mockImplementation(() => deferred.promise);
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      manager.closeTab(label);
      deferred.resolve(new Map([['a.txt', 'changed']]));
      await Promise.resolve();
      await Promise.resolve();
      const row = tabs.find((t) => t.label === label)!.files!.rows.find((r) => r.path === 'a.txt');
      expect(row?.gitStatus).toBeUndefined();
    });

    it('discards a git refresh whose root changed (reroot) before it resolved', async () => {
      mkdirSync(path.join(root, 'sub'));
      writeFileSync(path.join(root, 'sub', 'a.txt'), '');
      const deferred = Promise.withResolvers<Map<string, string>>();
      changedPathsMock
        .mockImplementationOnce(() => deferred.promise)
        .mockResolvedValue(new Map());
      const manager = run();
      manager.open('files sub', 'janus');
      const label = navLabel();
      manager.reroot(label);
      deferred.resolve(new Map([['a.txt', 'changed']]));
      await Promise.resolve();
      await Promise.resolve();
      expect(tabs.find((t) => t.label === label)!.files!.rows.find((r) => r.path === 'sub')?.gitStatus).toBeUndefined();
    });
  });

  describe('branch metadata', () => {
    const navLabel = () => tabs.find((t) => t.label.startsWith('navigator'))!.label;

    it('applies the branch once the async git refresh resolves', async () => {
      currentBranchMock.mockResolvedValue('main');
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      expect(tabs.find((t) => t.label === label)!.files!.branch).toBeUndefined();
      await vi.waitFor(() => {
        expect(tabs.find((t) => t.label === label)!.files!.branch).toBe('main');
      });
    });

    it('reroot clears the previous branch and triggers a fresh refresh', async () => {
      mkdirSync(path.join(root, 'sub'));
      currentBranchMock.mockResolvedValue('main');
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      await vi.waitFor(() => expect(currentBranchMock).toHaveBeenCalledTimes(1));
      currentBranchMock.mockResolvedValue('feature');
      manager.reroot(label, 'sub');
      expect(tabs.find((t) => t.label === label)!.files!.branch).toBeUndefined();
      await vi.waitFor(() => {
        expect(tabs.find((t) => t.label === label)!.files!.branch).toBe('feature');
      });
    });

    it('discards a branch refresh that resolves after its tab was closed', async () => {
      const deferred = Promise.withResolvers<string | undefined>();
      currentBranchMock.mockImplementation(() => deferred.promise);
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      manager.closeTab(label);
      deferred.resolve('main');
      await Promise.resolve();
      await Promise.resolve();
      expect(tabs.find((t) => t.label === label)!.files!.branch).toBeUndefined();
    });

    it('discards a branch refresh whose root changed (reroot) before it resolved', async () => {
      mkdirSync(path.join(root, 'sub'));
      const deferred = Promise.withResolvers<string | undefined>();
      currentBranchMock
        .mockImplementationOnce(() => deferred.promise)
        .mockResolvedValue(undefined);
      const manager = run();
      manager.open('files sub', 'janus');
      const label = navLabel();
      manager.reroot(label);
      deferred.resolve('stale-branch');
      await Promise.resolve();
      await Promise.resolve();
      expect(tabs.find((t) => t.label === label)!.files!.branch).toBeUndefined();
    });
  });

  describe('github url metadata', () => {
    const navLabel = () => tabs.find((t) => t.label.startsWith('navigator'))!.label;

    it('applies the github url once the async git refresh resolves', async () => {
      currentBranchMock.mockResolvedValue('main');
      remoteUrlMock.mockResolvedValue('git@github.com:owner/repo.git');
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      expect(tabs.find((t) => t.label === label)!.files!.githubUrl).toBeUndefined();
      await vi.waitFor(() => {
        expect(tabs.find((t) => t.label === label)!.files!.githubUrl).toBe('https://github.com/owner/repo/commits/main/');
      });
    });

    it('leaves the github url undefined when the remote is not a github.com origin', async () => {
      currentBranchMock.mockResolvedValue('main');
      remoteUrlMock.mockResolvedValue('git@gitlab.com:owner/repo.git');
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      await vi.waitFor(() => expect(currentBranchMock).toHaveBeenCalledTimes(1));
      expect(tabs.find((t) => t.label === label)!.files!.githubUrl).toBeUndefined();
    });

    it('reroot clears the previous github url and triggers a fresh refresh', async () => {
      mkdirSync(path.join(root, 'sub'));
      currentBranchMock.mockResolvedValue('main');
      remoteUrlMock.mockResolvedValue('git@github.com:owner/repo.git');
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      await vi.waitFor(() => expect(remoteUrlMock).toHaveBeenCalledTimes(1));
      currentBranchMock.mockResolvedValue('feature');
      manager.reroot(label, 'sub');
      expect(tabs.find((t) => t.label === label)!.files!.githubUrl).toBeUndefined();
      await vi.waitFor(() => {
        expect(tabs.find((t) => t.label === label)!.files!.githubUrl).toBe('https://github.com/owner/repo/commits/feature/');
      });
    });

    it('discards a github url refresh that resolves after its tab was closed', async () => {
      const deferred = Promise.withResolvers<string | undefined>();
      currentBranchMock.mockResolvedValue('main');
      remoteUrlMock.mockImplementation(() => deferred.promise);
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      manager.closeTab(label);
      deferred.resolve('git@github.com:owner/repo.git');
      await Promise.resolve();
      await Promise.resolve();
      expect(tabs.find((t) => t.label === label)!.files!.githubUrl).toBeUndefined();
    });
  });
});
