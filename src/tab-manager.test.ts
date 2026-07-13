import { describe, it, expect, vi } from 'vitest';
import { TabManager } from './tab-manager.js';
import type { Managers } from './managers.js';
import type { AgentState } from './types.js';
import * as agentState from './agent/state.js';

function makeManagers(): Managers {
  return {
    workspace: { remove: vi.fn() },
    shell: { close: vi.fn() },
    acp: { close: vi.fn() },
    browser: { closeTab: vi.fn() },
    pty: { closeTab: vi.fn() },
    fileTree: { closeTab: vi.fn() },
    editorWatch: { closeTab: vi.fn(), watch: vi.fn() },
    schedule: { delete: vi.fn() },
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
