import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';

const commitRoot = vi.fn();
const commitLeftStagingInPlace = vi.fn(() => false);
const notify = vi.fn();

vi.mock('../git/commit.js', () => ({
  commitRoot: (...args: unknown[]) => commitRoot(...args),
  commitLeftStagingInPlace: (...args: unknown[]) => commitLeftStagingInPlace(...args),
}));
vi.mock('../notifications/index.js', () => ({ notify: (...args: unknown[]) => notify(...args) }));

const { commitEditorFile } = await import('./commit.js');
const { TabManager } = await import('../tab/manager.js');

function setup(baseName = 'notes.txt') {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  managers.editorWatch = { watch: () => {}, markSaved: () => {} } as unknown as Managers['editorWatch'];
  const dir = mkdtempSync(path.join(tmpdir(), 'janus-editor-commit-'));
  const file = path.join(dir, baseName);
  writeFileSync(file, 'content');
  const url = managers.tab.registerFile(file);
  managers.tab.openEditorTab({ name: baseName, path: file, size: '7 B', url });
  return { managers, dir, file, url, tab: () => managers.tab.tabs.find((item) => item.editor)! };
}

describe('commitEditorFile', () => {
  beforeEach(() => {
    commitRoot.mockReset().mockResolvedValue({ committed: true, summary: '1 file changed' });
    commitLeftStagingInPlace.mockReturnValue(false);
    notify.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('arms committing, runs the commit cycle on the single file, and reports success', async () => {
    const jigs = setup();
    commitEditorFile(jigs.managers, jigs.url, 'sync: notes.txt');
    expect(jigs.tab().editor?.commit).toBe('committing');
    await vi.waitFor(() => expect(commitRoot).toHaveBeenCalledWith(jigs.dir, 'sync: notes.txt', [jigs.file]));
    await vi.waitFor(() => expect(jigs.tab().editor?.commit).toBe('committed'));
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(jigs.managers, 'file-operation', jigs.tab().label, 'Committed to origin: 1 file changed'));
    vi.advanceTimersByTime(3100);
    expect(jigs.tab().editor?.commit).toBeUndefined();
  });

  it('reports nothing to commit and returns straight to rest', async () => {
    const jigs = setup();
    commitRoot.mockResolvedValue({ committed: false });
    commitEditorFile(jigs.managers, jigs.url, 'sync: notes.txt');
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(jigs.managers, 'file-operation', jigs.tab().label, 'Nothing to commit'));
    await vi.waitFor(() => expect(jigs.tab().editor?.commit).toBeUndefined());
  });

  it('colors the error state on a git failure', async () => {
    const jigs = setup();
    commitRoot.mockRejectedValue(new Error('push rejected'));
    commitEditorFile(jigs.managers, jigs.url, 'sync: notes.txt');
    await vi.waitFor(() => expect(jigs.tab().editor?.commit).toBe('error'));
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(jigs.managers, 'file-operation', jigs.tab().label, 'Could not commit: push rejected'));
    vi.advanceTimersByTime(3100);
    expect(jigs.tab().editor?.commit).toBeUndefined();
  });

  it('notes when a failed commit leaves its staging behind', async () => {
    const jigs = setup();
    commitRoot.mockRejectedValue(new Error('index lock'));
    commitLeftStagingInPlace.mockReturnValue(true);
    commitEditorFile(jigs.managers, jigs.url, 'sync: notes.txt');
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(jigs.managers, 'file-operation', jigs.tab().label, 'Could not commit: index lock — what was staged is still in your index'));
  });

  it('ignores a second call while one is already committing', async () => {
    const jigs = setup();
    commitRoot.mockReturnValue(new Promise(() => {}));
    commitEditorFile(jigs.managers, jigs.url, 'sync: notes.txt');
    commitEditorFile(jigs.managers, jigs.url, 'sync: notes.txt');
    expect(commitRoot).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for an unknown file ref', () => {
    const jigs = setup();
    commitEditorFile(jigs.managers, '/open/999', 'sync: notes.txt');
    expect(commitRoot).not.toHaveBeenCalled();
    expect(jigs.tab().editor?.commit).toBeUndefined();
  });
});
