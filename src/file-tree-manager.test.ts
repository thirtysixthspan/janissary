import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import type * as NodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LogEntry, Tab } from './types.js';

const watchMock = vi.fn();

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return { ...actual, watch: (...args: unknown[]) => watchMock(...args) };
});

const { FileTreeManager } = await import('./file-tree-manager.js');
type FileTreeManagerInstance = InstanceType<typeof FileTreeManager>;

describe('FileTreeManager', () => {
  let root: string;
  let outputs: string[];
  let tabs: Tab[];
  let activeTab: number;
  let managers: unknown;
  let closeFns: (() => void)[];

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'file-tree-mgr-'));
    outputs = [];
    activeTab = 0;
    closeFns = [];
    watchMock.mockReset();
    watchMock.mockImplementation(() => {
      const close = vi.fn();
      closeFns.push(close);
      return { close };
    });
    const janus: Tab = {
      label: 'janus', dotColor: '#fff', number: 1, group: 1, groupColor: '#fff',
      log: [], cmdHistory: [], cmdHistoryIdx: -1, scrollOffset: 0,
    };
    tabs = [janus];
    managers = {
      tab: {
        get tabs() { return tabs; },
        cwdOf: () => root,
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
        setCwd: () => {},
        openFilesTab: (view: { root: string; rows: unknown[] }) => {
          const label = `navigator${tabs.length > 1 ? `-${tabs.length}` : ''}`;
          tabs = [...tabs, { ...janus, label, files: view as never }];
          activeTab = tabs.length - 1;
        },
      },
    };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const run = (): FileTreeManagerInstance => new FileTreeManager(managers as never);

  it('opens a files tab rooted at the issuing tab cwd and watches the root', () => {
    const manager = run();
    manager.open('files', 'janus');
    const tab = tabs.find((t) => t.label.startsWith('navigator'));
    expect(tab).toBeDefined();
    expect(tab!.files!.root).toBe(root);
    expect(watchMock).toHaveBeenCalledTimes(1);
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
});
