import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../notifications.js', () => ({ notify: mocks.notify }));

import { ScheduleManager } from './manager.js';
import type { Managers } from '../managers.js';
import type { Tab, ScheduleEntry } from '../types.js';
import { messageBus } from '../bus.js';

function makeManagers(overrides: Partial<Tab> = {}): { managers: Managers; tab: Tab } {
  const tab: Tab = {
    label: 'janus',
    index: 0,
    title: 'janus',
    dotColor: '#5b9cff',
    group: 1,
    groupColor: '#5b9cff',
    log: [],
    cmdHistory: [],
    cursor: 0,
    hasUnread: false,
    toolStepsExpanded: false,
    createdAt: Date.now(),
    ...overrides,
  };
  const managers = {
    tab: {
      allLabels: () => [tab.label],
      tabs: [tab],
      append: () => {},
      persist: () => {},
      buildAgentState: () => ({}),
    },
    command: { dispatchTo: () => {} },
    pty: { input: () => {} },
  } as unknown as Managers;
  return { managers, tab };
}

describe('ScheduleManager tick', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits state.dirty after a recurring schedule fires and is rescheduled', () => {
    const { managers } = makeManagers();
    const mgr = new ScheduleManager(managers);
    const emitSpy = vi.spyOn(messageBus, 'emit');

    const due: ScheduleEntry = {
      id: 'test',
      command: 'echo hi',
      spec: 'every 1m',
      nextRun: Date.now() - 1000,
      recurring: true,
      intervalMs: 60_000,
    };
    mgr.set('janus', [due]);
    mgr.start();

    vi.advanceTimersByTime(1000);

    expect(emitSpy).toHaveBeenCalledWith('state', { type: 'dirty' });
    const updated = mgr.get('janus')![0];
    expect(updated.nextRun).toBeGreaterThan(due.nextRun);

    emitSpy.mockRestore();
    mgr.stop();
  });

  it('does not emit state.dirty when no schedules are due', () => {
    const { managers } = makeManagers();
    const mgr = new ScheduleManager(managers);
    const emitSpy = vi.spyOn(messageBus, 'emit');

    const future: ScheduleEntry = {
      id: 'test',
      command: 'echo hi',
      spec: 'every 1m',
      nextRun: Date.now() + 60_000,
      recurring: true,
      intervalMs: 60_000,
    };
    mgr.set('janus', [future]);
    mgr.start();

    vi.advanceTimersByTime(1000);

    expect(emitSpy).not.toHaveBeenCalledWith('state', { type: 'dirty' });

    emitSpy.mockRestore();
    mgr.stop();
  });

  it('fires a schedule-fire notification when a due command is dispatched', () => {
    const { managers } = makeManagers();
    const mgr = new ScheduleManager(managers);
    mocks.notify.mockClear();

    const due: ScheduleEntry = {
      id: 'test', command: 'clear', spec: 'every 1m',
      nextRun: Date.now() - 1000, recurring: true, intervalMs: 60_000,
    };
    mgr.set('janus', [due]);
    mgr.start();

    vi.advanceTimersByTime(1000);

    expect(mocks.notify).toHaveBeenCalledWith(managers, 'schedule-fire', 'janus', 'clear');
    mgr.stop();
  });

  it('emits state.dirty after a harness tab schedule fires', () => {
    const { managers } = makeManagers({
      view: 'harness',
      harness: { name: 'claude', program: 'claude', ptyId: 'p1', status: 'running' },
    });
    const mgr = new ScheduleManager(managers);
    const emitSpy = vi.spyOn(messageBus, 'emit');

    const due: ScheduleEntry = {
      id: 'test',
      command: 'echo hi',
      spec: 'every 1m',
      nextRun: Date.now() - 1000,
      recurring: true,
      intervalMs: 60_000,
    };
    mgr.set('janus', [due]);
    mgr.start();

    vi.advanceTimersByTime(1000);

    expect(emitSpy).toHaveBeenCalledWith('state', { type: 'dirty' });

    emitSpy.mockRestore();
    mgr.stop();
  });
});

describe('ScheduleManager one-shot prompt injection into a harness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function runningHarness(overrides: Partial<Tab> = {}): { managers: Managers; tab: Tab; input: ReturnType<typeof vi.fn> } {
    const { managers, tab } = makeManagers({
      view: 'harness',
      harness: { name: 'claude', program: 'claude', ptyId: 'p1', status: 'running' },
      ...overrides,
    });
    const input = vi.fn();
    (managers.pty as unknown as { input: typeof input }).input = input;
    return { managers, tab, input };
  }

  function promptEntry(command: string): ScheduleEntry {
    return { id: 'run-1', command, spec: 'once', nextRun: Date.now() - 1000, recurring: false };
  }

  it('delivers a one-shot prompt to the running harness PTY, then drops it', () => {
    const { managers, input } = runningHarness();
    const mgr = new ScheduleManager(managers);
    mgr.set('janus', [promptEntry('say hello and stop')]);
    mgr.start();

    vi.advanceTimersByTime(1000);
    expect(input).toHaveBeenCalledWith('p1', 'say hello and stop');
    vi.advanceTimersByTime(50);
    expect(input).toHaveBeenCalledWith('p1', '\r');
    expect(mgr.get('janus')).toEqual([]);
    mgr.stop();
  });

  it('holds the prompt while the harness is not yet ready, delivering on a later tick', () => {
    const { managers, tab, input } = runningHarness({
      harness: { name: 'claude', program: 'claude', ptyId: '', status: 'running' },
    });
    const mgr = new ScheduleManager(managers);
    mgr.set('janus', [promptEntry('list files')]);
    mgr.start();

    vi.advanceTimersByTime(1000);
    expect(input).not.toHaveBeenCalled();
    expect(mgr.get('janus')).toHaveLength(1);

    tab.harness!.ptyId = 'p1';
    vi.advanceTimersByTime(1000);
    expect(input).toHaveBeenCalledWith('p1', 'list files');
    mgr.stop();
  });

  it('delivers the prompt verbatim with no scheduled marker appended', () => {
    const { managers, input } = runningHarness();
    const mgr = new ScheduleManager(managers);
    mgr.set('janus', [promptEntry('fix the tests')]);
    mgr.start();

    vi.advanceTimersByTime(1000);
    expect(input).toHaveBeenCalledWith('p1', 'fix the tests');
    expect(input).not.toHaveBeenCalledWith('p1', expect.stringContaining('## scheduled ##'));
    mgr.stop();
  });
});

describe('ScheduleManager schedule launch dialog', () => {
  function makeMgr(tabs: Partial<Tab>[], activeLabel: string): ScheduleManager {
    const managers = {
      tab: { tabs, cur: () => tabs.find((t) => t.label === activeLabel) },
    } as unknown as Managers;
    return new ScheduleManager(managers);
  }

  it('returns null when the dialog is closed', () => {
    const mgr = makeMgr([{ label: 'janus' }], 'janus');
    expect(mgr.scheduleLaunchView()).toBeNull();
  });

  it('lists only tabs whose view is undefined, agent, or harness, with the active tab as default', () => {
    const mgr = makeMgr([
      { label: 'janus' },
      { label: 'claude', view: 'harness' },
      { label: 'notes', view: 'markdown' },
      { label: 'shots', view: 'image' },
    ], 'claude');
    mgr.openScheduleLaunch();
    expect(mgr.scheduleLaunchView()).toEqual({ targets: ['janus', 'claude'], active: 'claude' });
  });

  it('reflects closeScheduleLaunch back to null', () => {
    const mgr = makeMgr([{ label: 'janus' }], 'janus');
    mgr.openScheduleLaunch();
    mgr.closeScheduleLaunch();
    expect(mgr.scheduleLaunchView()).toBeNull();
  });
});

describe('ScheduleManager cancel', () => {
  function entry(id: string): ScheduleEntry {
    return { id, command: 'clear', spec: 'every 5m', nextRun: Date.now() + 60_000, recurring: true, intervalMs: 60_000 };
  }

  it('removes an agent tab entry, persists the reduced list, emits state.dirty, and returns true', () => {
    const { managers } = makeManagers();
    const persist = vi.fn();
    (managers.tab as unknown as { persist: typeof persist }).persist = persist;
    const mgr = new ScheduleManager(managers);
    mgr.set('janus', [entry('a'), entry('b')]);
    const emitSpy = vi.spyOn(messageBus, 'emit');

    expect(mgr.cancel('janus', 'a')).toBe(true);
    expect(mgr.get('janus')!.map((e) => e.id)).toEqual(['b']);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith('state', { type: 'dirty' });
    emitSpy.mockRestore();
  });

  it('removes a harness tab entry and emits without persisting', () => {
    const { managers } = makeManagers({
      view: 'harness',
      harness: { name: 'claude', program: 'claude', ptyId: 'p1', status: 'running' },
    });
    const persist = vi.fn();
    (managers.tab as unknown as { persist: typeof persist }).persist = persist;
    const mgr = new ScheduleManager(managers);
    mgr.set('janus', [entry('a')]);
    const emitSpy = vi.spyOn(messageBus, 'emit');

    expect(mgr.cancel('janus', 'a')).toBe(true);
    expect(mgr.get('janus')).toEqual([]);
    expect(persist).not.toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith('state', { type: 'dirty' });
    emitSpy.mockRestore();
  });

  it('leaves the schedule unchanged, does not emit, and returns false for an unknown id', () => {
    const { managers } = makeManagers();
    const mgr = new ScheduleManager(managers);
    mgr.set('janus', [entry('a')]);
    const emitSpy = vi.spyOn(messageBus, 'emit');

    expect(mgr.cancel('janus', 'missing')).toBe(false);
    expect(mgr.get('janus')!.map((e) => e.id)).toEqual(['a']);
    expect(emitSpy).not.toHaveBeenCalledWith('state', { type: 'dirty' });
    emitSpy.mockRestore();
  });

  it('returns false for a tab with no schedule', () => {
    const { managers } = makeManagers();
    const mgr = new ScheduleManager(managers);
    expect(mgr.cancel('janus', 'a')).toBe(false);
  });
});

describe('ScheduleManager aggregatedView', () => {
  function makeMgr(labels: string[]): ScheduleManager {
    const managers = {
      tab: { tabs: labels.map((label) => ({ label })) },
    } as unknown as Managers;
    return new ScheduleManager(managers);
  }

  it('merges entries from multiple tabs sorted soonest-first, tagged with owner and command', () => {
    const mgr = makeMgr(['agent-1', 'harness-1']);
    mgr.set('agent-1', [{ id: 's1', command: 'clear', spec: 'every 5m', nextRun: 2000, recurring: true }]);
    mgr.set('harness-1', [{ id: 's1', command: 'echo hi', spec: 'at 3pm', nextRun: 1000, recurring: false }]);

    const rows = mgr.aggregatedView();

    expect(rows.map((r) => r.tab)).toEqual(['harness-1', 'agent-1']);
    expect(rows[0]).toMatchObject({ tab: 'harness-1', id: 's1', command: 'echo hi', recurring: false });
    expect(rows[1]).toMatchObject({ tab: 'agent-1', command: 'clear', recurring: true });
  });

  it('returns an empty array when no tab has a schedule', () => {
    expect(makeMgr(['agent-1']).aggregatedView()).toEqual([]);
  });

  it('excludes entries for a label whose tab is no longer open', () => {
    const mgr = makeMgr(['agent-1']);
    mgr.set('closed', [{ id: 's1', command: 'clear', spec: 'every 5m', nextRun: 1000, recurring: true }]);
    expect(mgr.aggregatedView()).toEqual([]);
  });
});
