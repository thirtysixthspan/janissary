import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import type * as NodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LogEntry, Tab } from './types.js';

const watchMock = vi.fn();

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return { ...actual, watch: (...args: unknown[]) => watchMock(...args) };
});

const changedPathsMock = vi.fn((_root: string): Promise<Set<string>> => Promise.resolve(new Set<string>()));

vi.mock('./git-status.js', () => ({
  changedPaths: (...args: [string]) => changedPathsMock(...args),
}));

const { FileTreeManager } = await import('./file-tree-manager.js');
type FileTreeManagerInstance = InstanceType<typeof FileTreeManager>;

describe('FileTreeManager', () => {
  let root: string;
  let otherRoot: string;
  let outputs: string[];
  let tabs: Tab[];
  let activeTab: number;
  let managers: unknown;
  let closeFns: (() => void)[];

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'file-tree-mgr-'));
    otherRoot = mkdtempSync(path.join(tmpdir(), 'file-tree-mgr-other-'));
    outputs = [];
    activeTab = 0;
    closeFns = [];
    watchMock.mockReset();
    changedPathsMock.mockReset();
    changedPathsMock.mockResolvedValue(new Set());
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
        mostRecentFileTreeLabel: () => tabs.find((t) => t.files)?.label,
        setCwd: () => {},
        openFilesTab: (view: { root: string; rows: unknown[] }) => {
          const label = `navigator${tabs.length > 2 ? `-${tabs.length}` : ''}`;
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

  it('openOrRetarget opens a fresh, left-docked tree at the tab cwd and focuses it when none exists', () => {
    const manager = run();
    manager.openOrRetarget('janus');
    const nav = tabs.find((t) => t.files);
    expect(nav).toBeDefined();
    expect(nav!.files!.root).toBe(root);
    expect(nav!.dock).toBe('left');
    expect(activeTab).toBe(tabs.indexOf(nav!));
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

  describe('git-modified coloring', () => {
    const navLabel = () => tabs.find((t) => t.label.startsWith('navigator'))!.label;

    it('applies the changed flag once the async git refresh resolves, without a watcher event', async () => {
      writeFileSync(path.join(root, 'a.txt'), '');
      changedPathsMock.mockResolvedValue(new Set(['a.txt']));
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      expect(tabs.find((t) => t.label === label)!.files!.rows.find((r) => r.path === 'a.txt')?.changed).toBeUndefined();
      await vi.waitFor(() => {
        const row = tabs.find((t) => t.label === label)!.files!.rows.find((r) => r.path === 'a.txt');
        expect(row?.changed).toBe(true);
      });
    });

    it('an interactive toggle reuses the cached git set and spawns no new git call', async () => {
      mkdirSync(path.join(root, 'src'));
      writeFileSync(path.join(root, 'src', 'a.txt'), '');
      changedPathsMock.mockResolvedValue(new Set(['src/a.txt']));
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      await vi.waitFor(() => expect(changedPathsMock).toHaveBeenCalledTimes(1));
      manager.toggle(label, 'src');
      expect(changedPathsMock).toHaveBeenCalledTimes(1);
      const rows = tabs.find((t) => t.label === label)!.files!.rows;
      expect(rows.find((r) => r.path === 'src/a.txt')?.changed).toBe(true);
      expect(rows.find((r) => r.path === 'src')?.changed).toBe(true);
    });

    it('reroot resets the cache (no stale coloring) and triggers a fresh refresh', async () => {
      mkdirSync(path.join(root, 'sub'));
      writeFileSync(path.join(root, 'sub', 'a.txt'), '');
      changedPathsMock.mockResolvedValue(new Set(['a.txt']));
      const manager = run();
      manager.open('files sub', 'janus');
      const label = navLabel();
      await vi.waitFor(() => expect(changedPathsMock).toHaveBeenCalledTimes(1));
      changedPathsMock.mockResolvedValue(new Set());
      manager.reroot(label);
      expect(tabs.find((t) => t.label === label)!.files!.rows.find((r) => r.path === 'sub')?.changed).toBeUndefined();
      await vi.waitFor(() => expect(changedPathsMock).toHaveBeenCalledTimes(2));
    });

    it('coalesces overlapping refresh requests into exactly one extra git call', async () => {
      vi.useFakeTimers();
      try {
        const deferred = Promise.withResolvers<Set<string>>();
        changedPathsMock
          .mockImplementationOnce(() => deferred.promise)
          .mockResolvedValue(new Set());
        const manager = run();
        manager.open('files', 'janus');
        expect(changedPathsMock).toHaveBeenCalledTimes(1);
        const onEvent = watchMock.mock.calls[0][1] as () => void;
        onEvent();
        vi.advanceTimersByTime(150);
        onEvent();
        vi.advanceTimersByTime(150);
        expect(changedPathsMock).toHaveBeenCalledTimes(1);
        deferred.resolve(new Set());
        await Promise.resolve();
        await Promise.resolve();
        expect(changedPathsMock).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('discards a git refresh that resolves after its tab was closed', async () => {
      writeFileSync(path.join(root, 'a.txt'), '');
      const deferred = Promise.withResolvers<Set<string>>();
      changedPathsMock.mockImplementation(() => deferred.promise);
      const manager = run();
      manager.open('files', 'janus');
      const label = navLabel();
      manager.closeTab(label);
      deferred.resolve(new Set(['a.txt']));
      await Promise.resolve();
      await Promise.resolve();
      const row = tabs.find((t) => t.label === label)!.files!.rows.find((r) => r.path === 'a.txt');
      expect(row?.changed).toBeUndefined();
    });

    it('discards a git refresh whose root changed (reroot) before it resolved', async () => {
      mkdirSync(path.join(root, 'sub'));
      writeFileSync(path.join(root, 'sub', 'a.txt'), '');
      const deferred = Promise.withResolvers<Set<string>>();
      changedPathsMock
        .mockImplementationOnce(() => deferred.promise)
        .mockResolvedValue(new Set());
      const manager = run();
      manager.open('files sub', 'janus');
      const label = navLabel();
      manager.reroot(label);
      deferred.resolve(new Set(['a.txt']));
      await Promise.resolve();
      await Promise.resolve();
      expect(tabs.find((t) => t.label === label)!.files!.rows.find((r) => r.path === 'sub')?.changed).toBeUndefined();
    });
  });
});
