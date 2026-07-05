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
        cur: () => tabs[activeTab],
        setCwd: () => {},
        openFilesTab: (view: { root: string; rows: unknown[] }) => {
          const label = `files${tabs.length > 1 ? `-${tabs.length}` : ''}`;
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
    const tab = tabs.find((t) => t.label.startsWith('files'));
    expect(tab).toBeDefined();
    expect(tab!.files!.root).toBe(root);
    expect(watchMock).toHaveBeenCalledTimes(1);
  });

  it('resolves a relative path against cwd', () => {
    mkdirSync(path.join(root, 'sub'));
    const manager = run();
    manager.open('files sub', 'janus');
    const tab = tabs.find((t) => t.label.startsWith('files'));
    expect(tab!.files!.root).toBe(path.join(root, 'sub'));
  });

  it('errors into the creator transcript when the target is not a directory', () => {
    writeFileSync(path.join(root, 'file.txt'), '');
    const manager = run();
    manager.open('files file.txt', 'janus');
    expect(outputs.at(-1)).toContain('not a directory');
    expect(tabs.some((t) => t.label.startsWith('files'))).toBe(false);
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
    const label = tabs.find((t) => t.label.startsWith('files'))!.label;
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
    const label = tabs.find((t) => t.label.startsWith('files'))!.label;
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
      const label = tabs.find((t) => t.label.startsWith('files'))!.label;
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
      const label = tabs.find((t) => t.label.startsWith('files'))!.label;
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

  it('closeTab closes every watcher for that tab', () => {
    mkdirSync(path.join(root, 'src'));
    const manager = run();
    manager.open('files', 'janus');
    const label = tabs.find((t) => t.label.startsWith('files'))!.label;
    manager.toggle(label, 'src');
    manager.closeTab(label);
    expect(closeFns[0]).toHaveBeenCalled();
    expect(closeFns[1]).toHaveBeenCalled();
  });
});
