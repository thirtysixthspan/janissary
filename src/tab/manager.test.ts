import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TabManager } from './manager.js';
import type { Managers } from '../managers.js';
import type { AgentState } from '../types.js';
import * as agentState from '../agent/state.js';

function makeManagers(): Managers {
  return {
    workspace: { remove: vi.fn(), cancel: vi.fn() },
    shell: { close: vi.fn() },
    acp: { close: vi.fn() },
    browser: { closeTab: vi.fn() },
    pty: { closeTab: vi.fn() },
    fileTree: { closeTab: vi.fn() },
    editorWatch: { closeTab: vi.fn(), watch: vi.fn() },
    editorAcp: { closeTab: vi.fn() },
    schedule: { delete: vi.fn() },
    questions: { cancelTab: vi.fn(), pendingFor: vi.fn() },
    database: { forgetTab: vi.fn(), closeAll: vi.fn() },
  } as unknown as Managers;
}

function makeTabManager(): TabManager {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  Object.assign(managers, makeManagers());
  return managers.tab;
}

describe('TabManager queue', () => {
  it('deleteBusy invokes the drain hook (microtask-deferred) only when the queue is non-empty', async () => {
    const tm = makeTabManager();
    const onIdle = vi.fn();
    tm.setOnIdle(onIdle);

    tm.addBusy('janus');
    tm.deleteBusy('janus');
    await Promise.resolve();
    expect(onIdle).not.toHaveBeenCalled();

    tm.enqueue('janus', 'echo hi');
    tm.addBusy('janus');
    tm.deleteBusy('janus');
    expect(onIdle).not.toHaveBeenCalled(); // deferred, not synchronous
    await Promise.resolve();
    expect(onIdle).toHaveBeenCalledWith('janus');
  });

  it('finishRunning routes through deleteBusy so the drain fires after completion', async () => {
    const tm = makeTabManager();
    const onIdle = vi.fn();
    tm.setOnIdle(onIdle);
    tm.enqueue('janus', 'echo hi');
    tm.startRunning('janus', 'echo hi');

    tm.finishRunning('janus', 'hi');
    expect(tm.isBusy('janus')).toBe(false);
    await Promise.resolve();
    expect(onIdle).toHaveBeenCalledWith('janus');
  });

  it('editQueued replaces the right index and no-ops out of range', () => {
    const tm = makeTabManager();
    tm.enqueue('janus', 'first');
    tm.enqueue('janus', 'second');

    tm.editQueued('janus', 1, 'edited');
    expect(tm.queueFor('janus')).toEqual(['first', 'edited']);

    tm.editQueued('janus', 5, 'ignored');
    expect(tm.queueFor('janus')).toEqual(['first', 'edited']);
  });

  it('deleteQueued splices the right index and no-ops out of range', () => {
    const tm = makeTabManager();
    tm.enqueue('janus', 'first');
    tm.enqueue('janus', 'second');

    tm.deleteQueued('janus', 0);
    expect(tm.queueFor('janus')).toEqual(['second']);

    tm.deleteQueued('janus', 5);
    expect(tm.queueFor('janus')).toEqual(['second']);
  });

  it('buildAgentState includes commandQueue', () => {
    const tm = makeTabManager();
    tm.enqueue('janus', 'echo hi');
    const state = tm.buildAgentState(tm.cur());
    expect(state.commandQueue).toEqual(['echo hi']);
  });

  it('rehydrate restores commandQueue and the restored tab starts idle without auto-running', () => {
    const state: AgentState = {
      name: 'restored', dotColor: '#fff', active: true, number: 1, commandQueue: ['echo queued'],
    };
    const listSpy = vi.spyOn(agentState, 'listAgentStates').mockReturnValue([state]);

    const managers = {} as Managers;
    managers.tab = new TabManager(managers);
    const tm = managers.tab;
    tm.rehydrate(() => [], () => {});

    expect(tm.queueFor('restored')).toEqual(['echo queued']);
    expect(tm.isBusy('restored')).toBe(false);

    listSpy.mockRestore();
  });

  it('openEditorTab deduplicates by path and focuses the existing tab', () => {
    const tm = makeTabManager();
    const path = '/test/file.ts';
    tm.openEditorTab({ name: 'file.ts', path, size: '1 KB', url: '/open/1' });
    const countAfterFirst = tm.tabs.length;
    const firstActive = tm.activeTab;

    tm.openEditorTab({ name: 'file.ts', path, size: '1 KB', url: '/open/2' });
    expect(tm.tabs.length).toBe(countAfterFirst);
    expect(tm.activeTab).toBe(firstActive);
  });

  it('openEditorTab updates the existing tab\'s line when a new line is requested', () => {
    const tm = makeTabManager();
    const path = '/test/file.ts';
    tm.openEditorTab({ name: 'file.ts', path, size: '1 KB', url: '/open/1' });
    const count = tm.tabs.length;
    tm.openEditorTab({ name: 'file.ts', path, size: '1 KB', url: '/open/2', line: 42 });
    expect(tm.tabs.length).toBe(count);
    expect(tm.cur().editor!.line).toBe(42);
  });

  it('openEditorTab creates a new tab when the path differs', () => {
    const tm = makeTabManager();
    tm.openEditorTab({ name: 'a.ts', path: '/test/a.ts', size: '1 KB', url: '/open/1' });
    tm.openEditorTab({ name: 'b.ts', path: '/test/b.ts', size: '1 KB', url: '/open/2' });
    expect(tm.tabs.length).toBe(3); // janus + a.ts + b.ts
  });

  it('openEditorTab bypasses de-dupe for a new-file view, allowing multiple untitled tabs', () => {
    const tm = makeTabManager();
    const path = '/test/untitled.md';
    tm.openEditorTab({ name: 'untitled.md', path, size: 'unknown', url: '/open/1', newFile: true });
    tm.openEditorTab({ name: 'untitled.md', path, size: 'unknown', url: '/open/2', newFile: true });
    expect(tm.tabs.length).toBe(3); // janus + two untitled.md tabs
  });

  it('closeTab clears the label\'s queue entry', () => {
    const tm = makeTabManager();
    tm.tabs.push({ ...tm.cur(), label: 'second', number: 2 });
    tm.enqueue('second', 'queued command');
    expect(tm.queueFor('second')).toEqual(['queued command']);

    const index = tm.findIndex('second');
    tm.closeTab(index);

    expect(tm.queueFor('second')).toEqual([]);
  });
});

describe('TabManager markUnread', () => {
  it('append does not mark a docked, non-active tab unread', () => {
    const tm = makeTabManager();
    tm.tabs.push({ ...tm.cur(), label: 'notifications', number: 2, view: 'notifications' });
    tm.setDock(1, 'left');

    tm.append('notifications', { output: 'new line' });

    expect(tm.tabs.find((t) => t.label === 'notifications')?.hasUnread).toBeFalsy();
  });

  it('append still marks a non-docked, non-active tab unread', () => {
    const tm = makeTabManager();
    tm.tabs.push({ ...tm.cur(), label: 'second', number: 2 });

    tm.append('second', { output: 'new line' });

    expect(tm.tabs.find((t) => t.label === 'second')?.hasUnread).toBe(true);
  });
});

describe('TabManager focus history', () => {
  it('closing the active tab restores the tab active immediately before it, not just the adjacent slot', () => {
    const tm = makeTabManager();
    tm.tabs.push({ ...tm.cur(), label: 'bob', number: 2 }, { ...tm.cur(), label: 'carol', number: 3 });
    tm.setActiveTab(1); // -> bob (from janus)
    tm.setActiveTab(2); // -> carol (from bob)
    tm.setActiveTab(0); // -> janus (from carol)
    tm.setActiveTab(1); // -> bob (from janus)
    expect(tm.activeTab).toBe(1);

    tm.closeTab(1); // close bob, the active tab

    // The tab that slides into bob's old slot is carol, but janus was actually focused right
    // before bob — that's what should be restored.
    expect(tm.tabs[tm.activeTab].label).toBe('janus');
  });

  it('opening a new editor tab and closing it immediately returns focus to the previously active tab', () => {
    const tm = makeTabManager();
    tm.openEditorTab({ name: 'file.ts', path: '/test/file.ts', size: '1 KB', url: '/open/1' });
    const editorIndex = tm.activeTab;
    expect(tm.tabs[editorIndex].editor?.path).toBe('/test/file.ts');

    tm.closeTab(editorIndex);

    expect(tm.tabs[tm.activeTab].label).toBe('janus');
  });

  it('closing the active tab with no recorded focus history falls back to clamping to a valid index', () => {
    const tm = makeTabManager();
    tm.tabs.push({ ...tm.cur(), label: 'second', number: 2 });
    tm.activeTab = 1; // bypasses setActiveTab, so nothing is recorded

    expect(() => tm.closeTab(1)).not.toThrow();
    expect(tm.tabs[tm.activeTab].label).toBe('janus');
  });
});

describe('TabManager mostRecentFileTreeLabel', () => {
  it('returns the most-recently-left file-tree tab from the focus history', () => {
    const tm = makeTabManager();
    tm.tabs.push({ ...tm.cur(), label: 'files1', number: 2, view: 'files' });
    tm.setActiveTab(1); // -> files1 (records leaving janus)
    tm.setActiveTab(0); // -> janus (records leaving files1)

    expect(tm.mostRecentFileTreeLabel()).toBe('files1');
  });

  it('returns a docked file-tree tab rather than skipping it (unlike popFocusHistory)', () => {
    const tm = makeTabManager();
    tm.tabs.push({ ...tm.cur(), label: 'files1', number: 2, view: 'files' });
    tm.setActiveTab(1); // -> files1
    tm.setActiveTab(0); // -> janus (files1 now in focus history)
    tm.setDock(1, 'left'); // files1 becomes docked

    expect(tm.mostRecentFileTreeLabel()).toBe('files1');
  });

  it('does not mutate the focus history (repeated calls return the same label)', () => {
    const tm = makeTabManager();
    tm.tabs.push({ ...tm.cur(), label: 'files1', number: 2, view: 'files' });
    tm.setActiveTab(1);
    tm.setActiveTab(0);

    expect(tm.mostRecentFileTreeLabel()).toBe('files1');
    expect(tm.mostRecentFileTreeLabel()).toBe('files1');
  });

  it('falls back to the first file-tree tab in tab order when none is in the focus history', () => {
    const tm = makeTabManager();
    tm.tabs.push(
      { ...tm.cur(), label: 'files1', number: 2, view: 'files' },
      { ...tm.cur(), label: 'files2', number: 3, view: 'files' },
    );
    // Never focused either files tab, so neither is in the focus history.
    expect(tm.mostRecentFileTreeLabel()).toBe('files1');
  });

  it('returns undefined when no file-tree tab exists', () => {
    const tm = makeTabManager();
    tm.tabs.push({ ...tm.cur(), label: 'bob', number: 2 });

    expect(tm.mostRecentFileTreeLabel()).toBeUndefined();
  });
});

describe('TabManager renameTab for editor tabs', () => {
  it('renaming a not-yet-saved new-file editor updates its pending basename literally (no extension appended)', () => {
    const tm = makeTabManager();
    tm.openEditorTab({ name: 'untitled.md', path: '/test/untitled.md', size: 'unknown', url: '/open/1', newFile: true });
    const index = tm.activeTab;

    tm.renameTab(index, 'notes');

    const tab = tm.tabs[index];
    expect(tab.editor?.name).toBe('notes');
    expect(tab.editor?.path).toBe('/test/notes');
    expect(tab.title).toBe('notes');
  });

  it('renaming a saved new-file editor renames the file on disk and retargets the editor', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-rename-'));
    const filePath = path.join(dir, 'untitled.md');
    writeFileSync(filePath, 'content');
    const tm = makeTabManager();
    tm.openEditorTab({ name: 'untitled.md', path: filePath, size: '7 B', url: '/open/1', newFile: true });
    const index = tm.activeTab;
    tm.tabs[index].editor!.newFile = false; // simulate a completed save

    tm.renameTab(index, 'final');

    const newPath = path.join(dir, 'final');
    const tab = tm.tabs[index];
    expect(existsSync(newPath)).toBe(true);
    expect(existsSync(filePath)).toBe(false);
    expect(tab.editor?.path).toBe(newPath);
    expect(tab.editor?.name).toBe('final');
    expect(tab.title).toBe('final');
  });

  it('renaming a normal editor tab renames the file on disk and retargets the editor', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-rename-'));
    const filePath = path.join(dir, 'existing.ts');
    writeFileSync(filePath, 'content');
    const tm = makeTabManager();
    tm.openEditorTab({ name: 'existing.ts', path: filePath, size: '7 B', url: '/open/1' });
    const index = tm.activeTab;

    tm.renameTab(index, 'aliased');

    const newPath = path.join(dir, 'aliased');
    const tab = tm.tabs[index];
    expect(existsSync(newPath)).toBe(true);
    expect(existsSync(filePath)).toBe(false);
    expect(tab.editor?.path).toBe(newPath);
    expect(tab.editor?.name).toBe('aliased');
    expect(tab.title).toBe('aliased');
  });

  it('renaming an agent tab still sets an alias only', () => {
    const tm = makeTabManager();
    tm.renameTab(0, 'newlabel');
    expect(tm.tabs[0].title).toBe('newlabel');
  });

  it('renaming an agent tab allows up to 50 characters, independent of tabNameMaxLength', () => {
    const tm = makeTabManager();
    tm.renameTab(0, 'a'.repeat(60));
    expect(tm.tabs[0].title).toBe('a'.repeat(50));
  });

  it('renaming an editor tab allows a file name up to 50 characters, independent of tabNameMaxLength', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-rename-'));
    const filePath = path.join(dir, 'existing.ts');
    writeFileSync(filePath, 'content');
    const tm = makeTabManager();
    tm.openEditorTab({ name: 'existing.ts', path: filePath, size: '7 B', url: '/open/1' });
    const index = tm.activeTab;

    tm.renameTab(index, 'a'.repeat(60));

    const tab = tm.tabs[index];
    expect(tab.editor?.name).toBe('a'.repeat(50));
  });
});

describe('TabManager retargetEditorTab', () => {
  function makeTabManagerWithManagers(): { tm: TabManager; managers: Managers } {
    const managers = {} as Managers;
    managers.tab = new TabManager(managers);
    Object.assign(managers, makeManagers());
    return { tm: managers.tab, managers };
  }

  it('updates the matching editor tab\'s path, name, url, and title, and rewatches at the new path', () => {
    const { tm, managers } = makeTabManagerWithManagers();
    tm.openEditorTab({ name: 'notes.txt', path: '/tree/notes.txt', size: '2 B', url: '/open/1' });
    const index = tm.activeTab;
    const label = tm.tabs[index].label;

    tm.retargetEditorTab('/tree/notes.txt', '/tree/renamed.txt');

    const tab = tm.tabs[index];
    expect(tab.editor?.path).toBe('/tree/renamed.txt');
    expect(tab.editor?.name).toBe('renamed.txt');
    expect(tm.openFilePath(tab.editor!.url.slice('/open/'.length))).toBe('/tree/renamed.txt');
    expect(tab.title).toBe('renamed.txt');
    expect(managers.editorWatch.watch).toHaveBeenCalledWith(label, '/tree/renamed.txt');
  });

  it('is a no-op when no open editor tab matches the old path', () => {
    const { tm, managers } = makeTabManagerWithManagers();
    tm.openEditorTab({ name: 'notes.txt', path: '/tree/notes.txt', size: '2 B', url: '/open/1' });
    const index = tm.activeTab;
    (managers.editorWatch.watch as ReturnType<typeof vi.fn>).mockClear();

    tm.retargetEditorTab('/tree/other.txt', '/tree/renamed.txt');

    const tab = tm.tabs[index];
    expect(tab.editor?.path).toBe('/tree/notes.txt');
    expect(managers.editorWatch.watch).not.toHaveBeenCalled();
  });
});
