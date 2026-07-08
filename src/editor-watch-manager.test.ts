import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import type * as NodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { EditorView, Tab } from './types.js';

const watchMock = vi.fn();

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return { ...actual, watch: (...args: unknown[]) => watchMock(...args) };
});

const { EditorWatchManager } = await import('./editor-watch-manager.js');
type EditorWatchManagerInstance = InstanceType<typeof EditorWatchManager>;

function makeTab(label: string, editor: EditorView): Tab {
  return {
    label, dotColor: '#fff', number: 1, group: 1, groupColor: '#fff',
    log: [], cmdHistory: [], cmdHistoryIdx: -1, scrollOffset: 0, editor,
  };
}

describe('EditorWatchManager', () => {
  let root: string;
  let file: string;
  let tabs: Tab[];
  let managers: unknown;
  let closeFns: (() => void)[];

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'editor-watch-mgr-'));
    file = path.join(root, 'notes.txt');
    writeFileSync(file, 'hello');
    closeFns = [];
    watchMock.mockReset();
    watchMock.mockImplementation(() => {
      const close = vi.fn();
      closeFns.push(close);
      return { close };
    });
    tabs = [makeTab('notes', { name: 'notes.txt', path: file, size: '5 B', url: '/open/1' })];
    managers = { tab: { get tabs() { return tabs; } } };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const run = (): EditorWatchManagerInstance => new EditorWatchManager(managers as never);

  it('watches the file and pushes a new mtimeMs onto the tab after an external change', () => {
    vi.useFakeTimers();
    try {
      const manager = run();
      manager.watch('notes', file);
      expect(watchMock).toHaveBeenCalledTimes(1);

      writeFileSync(file, 'changed elsewhere');
      const onEvent = watchMock.mock.calls[0][1] as () => void;
      onEvent();
      vi.advanceTimersByTime(150);

      expect(tabs[0].editor?.mtimeMs).toBe(statSync(file).mtimeMs);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a watch event when the mtime has not actually moved', () => {
    vi.useFakeTimers();
    try {
      const manager = run();
      manager.watch('notes', file);
      const onEvent = watchMock.mock.calls[0][1] as () => void;
      onEvent();
      vi.advanceTimersByTime(150);
      expect(tabs[0].editor?.mtimeMs).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('markSaved moves the baseline forward so the app\'s own write is not reported as external', () => {
    vi.useFakeTimers();
    try {
      const manager = run();
      manager.watch('notes', file);
      writeFileSync(file, 'saved by the app');
      const savedMtime = statSync(file).mtimeMs;
      manager.markSaved('notes', savedMtime);

      const onEvent = watchMock.mock.calls[0][1] as () => void;
      onEvent();
      vi.advanceTimersByTime(150);

      expect(tabs[0].editor?.mtimeMs).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('closeTab closes the watcher for that label', () => {
    const manager = run();
    manager.watch('notes', file);
    manager.closeTab('notes');
    expect(closeFns[0]).toHaveBeenCalled();
  });

  it('watch replaces an existing watcher for the same label', () => {
    const manager = run();
    manager.watch('notes', file);
    manager.watch('notes', file);
    expect(watchMock).toHaveBeenCalledTimes(2);
    expect(closeFns[0]).toHaveBeenCalled();
  });

  it('dispose closes every watcher', () => {
    const manager = run();
    manager.watch('notes', file);
    manager.dispose();
    expect(closeFns[0]).toHaveBeenCalled();
  });

  it('does nothing for an unknown label', () => {
    const manager = run();
    expect(() => manager.closeTab('ghost')).not.toThrow();
    expect(() => manager.markSaved('ghost', 0)).not.toThrow();
  });
});
