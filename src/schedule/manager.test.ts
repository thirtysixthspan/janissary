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
