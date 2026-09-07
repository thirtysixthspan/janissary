import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import type * as NodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { EditorView, Tab } from '../tab/types.js';
import type { Managers } from '../managers.js';
import { saveFile } from './save.js';

const watchMock = vi.fn();

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return { ...actual, watch: (...args: unknown[]) => watchMock(...args) };
});

const { EditorWatchManager } = await import('./watch-manager.js');
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
    managers = {
      tab: {
        get tabs() { return tabs; },
        byLabel: (label: string) => tabs.find((t) => t.label === label),
        editorTabByUrl: (url: string) => tabs.find((t) => t.editor?.url === url),
      },
    };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const run = (): EditorWatchManagerInstance => new EditorWatchManager(managers as never);

  it('replaces the watch after atomic save and detects the next external edit', () => {
    vi.useFakeTimers();
    const manager = run();
    try {
      manager.watch('notes', file);
      const oldEvent = watchMock.mock.calls[0][1] as () => void;
      oldEvent();
      const       saveManagers = {
        tab: {
          tabs,
          byLabel: (label: string) => tabs.find((t) => t.label === label),
          editorTabByUrl: (url: string) => tabs.find((t) => t.editor?.url === url),
          openFilePath: () => file,
        }, editorWatch: manager,
      } as unknown as Managers;

      saveFile(saveManagers, '/open/1', 'saved atomically');

      expect(watchMock).toHaveBeenCalledTimes(2);
      expect(closeFns[0]).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      const newEvent = watchMock.mock.calls[1][1] as () => void;
      oldEvent();
      newEvent();
      vi.advanceTimersByTime(150);
      expect(tabs[0].editor?.mtimeMs).toBeUndefined();

      writeFileSync(file, 'changed externally');
      const later = new Date(Date.now() + 2000);
      utimesSync(file, later, later);
      newEvent();
      vi.advanceTimersByTime(150);
      expect(tabs[0].editor?.mtimeMs).toBe(statSync(file).mtimeMs);
    } finally {
      manager.dispose();
      vi.useRealTimers();
    }
    expect(closeFns[1]).toHaveBeenCalledOnce();
  });

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

  it('refresh detects a change since the last baseline and pushes the new mtimeMs onto the tab', () => {
    const manager = run();
    manager.watch('notes', file);
    writeFileSync(file, 'changed elsewhere');

    manager.refresh('notes');

    expect(tabs[0].editor?.mtimeMs).toBe(statSync(file).mtimeMs);
  });

  it('refresh re-arms the watcher, replacing the previous one', () => {
    const manager = run();
    manager.watch('notes', file);
    manager.refresh('notes');
    expect(watchMock).toHaveBeenCalledTimes(2);
    expect(closeFns[0]).toHaveBeenCalled();
  });

  it('refresh does nothing for an unknown label', () => {
    const manager = run();
    expect(() => manager.refresh('ghost')).not.toThrow();
    expect(watchMock).not.toHaveBeenCalled();
  });
});
