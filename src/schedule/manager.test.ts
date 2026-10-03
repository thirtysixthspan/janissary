import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

const mocks = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../notifications/index.js', () => ({ notify: mocks.notify }));

import { ScheduleManager } from './manager.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import type { ScheduleEntry } from './types.js';
import { messageBus } from '../bus.js';
import { TabManager } from '../tab/manager.js';
import { makeTab } from '../tab/index.js';
import * as agentState from '../agent/state.js';

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
      byLabel: (label: string) => (label === tab.label ? tab : undefined),
      append: () => {},
      persist: () => {},
      buildAgentState: () => ({}),
    },
    command: { dispatchTo: () => {} },
    pty: { input: () => {} },
  } as unknown as Managers;
  return { managers, tab };
}

// A real `TabManager` holding one extra tab, so a schedule change runs through the actual
// `TabManager.persist` path and its agent-only rule rather than a mocked `persist`.
function withRealTabManager(overrides: Partial<Tab>): {
  managers: Managers; saveSpy: MockInstance<typeof agentState.saveAgentState>;
} {
  const saveSpy = vi.spyOn(agentState, 'saveAgentState').mockImplementation(() => {});
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  managers.schedule = new ScheduleManager(managers);
  managers.tab.tabs.push({ ...makeTab(overrides.label ?? 'claude', '#aaa'), ...overrides });
  return { managers, saveSpy };
}

describe('ScheduleManager tick', () => {
  it('fires each overdue entry once, reports lateness with no sleep attributed, and schedules recurrence from now', () => {
    const { managers } = makeManagers();
    const dispatch = vi.spyOn(managers.command, 'dispatchTo');
    const manager = new ScheduleManager(managers);
    mocks.notify.mockClear();
    manager.set('janus', [
      { id: 'a', command: 'help', spec: 'once', recurring: false, nextRun: Date.now() - 60_000 },
      { id: 'b', command: 'clear', spec: 'every 1m', recurring: true, intervalMs: 60_000, nextRun: Date.now() - 60_000 },
    ]);
    manager.start(); vi.advanceTimersByTime(1000);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(mocks.notify.mock.calls.filter((call) => call[1] === 'schedule-late')).toHaveLength(2);
    expect(mocks.notify).toHaveBeenCalledWith(managers, 'schedule-late', 'janus', 'help ran 1m late');
    expect(manager.get('janus')).toEqual([expect.objectContaining({ id: 'b', nextRun: Date.now() + 60_000 })]);
    vi.advanceTimersByTime(1000); expect(dispatch).toHaveBeenCalledTimes(2);
    manager.stop();
  });

  it('attributes lateness to sleep only when the entry was already overdue at the last resume', () => {
    const { managers } = makeManagers();
    const manager = new ScheduleManager(managers);
    mocks.notify.mockClear();
    manager.set('janus', [{ id: 'a', command: 'help', spec: 'once', recurring: false, nextRun: Date.now() - 60_000 }]);
    messageBus.emit('system', { type: 'resumed', sleptMs: 60_000 });
    manager.start(); vi.advanceTimersByTime(1000); manager.stop();
    expect(mocks.notify).toHaveBeenCalledWith(managers, 'schedule-late', 'janus', 'help ran 1m late (system was asleep)');
  });

  it('does not report an on-time command as late', () => {
    const { managers } = makeManagers();
    const manager = new ScheduleManager(managers);
    mocks.notify.mockClear();
    manager.set('janus', [{ id: 'a', command: 'help', spec: 'once', recurring: false, nextRun: Date.now() }]);
    manager.start(); vi.advanceTimersByTime(1000); manager.stop();
    expect(mocks.notify.mock.calls.some((call) => call[1] === 'schedule-late')).toBe(false);
  });
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

  it('holds the prompt while a `-w` launch is still provisioning, delivering once running', () => {
    const { managers, tab, input } = runningHarness({
      harness: { name: 'claude', program: 'claude', ptyId: '', status: 'provisioning' },
    });
    const mgr = new ScheduleManager(managers);
    mgr.set('janus', [promptEntry('list files')]);
    mgr.start();

    vi.advanceTimersByTime(1000);
    expect(input).not.toHaveBeenCalled();
    expect(mgr.get('janus')).toHaveLength(1);

    tab.harness!.ptyId = 'p1';
    tab.harness!.status = 'running';
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

  // codex's composer classifies a burst write as a paste and suppresses the quick Enter that
  // follows it (inserting a newline instead of submitting), so the command is framed as a
  // bracketed paste — its explicit-paste path clears that state and the delayed Enter submits.
  it('frames a codex harness prompt as a bracketed paste, then submits with a delayed Enter', () => {
    const { managers, input } = runningHarness({
      harness: { name: 'codex', program: 'codex', ptyId: 'p1', status: 'running' },
    });
    const mgr = new ScheduleManager(managers);
    mgr.set('janus', [promptEntry('fix the tests')]);
    mgr.start();

    vi.advanceTimersByTime(1000);
    expect(input).toHaveBeenCalledWith('p1', '\u{1B}[200~fix the tests\u{1B}[201~');
    expect(input).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50);
    expect(input).toHaveBeenCalledWith('p1', '\r');
    expect(mgr.get('janus')).toEqual([]);
    mgr.stop();
  });

  // Two entries due on the same tick must not both write their text before either delayed Enter:
  // the harness would read one concatenated prompt followed by an empty submission while both
  // entries counted as fired. At most one is delivered per harness tab per tick.
  it('delivers at most one due entry per harness tab per tick, retaining the rest', () => {
    const { managers, input } = runningHarness();
    const mgr = new ScheduleManager(managers);
    mocks.notify.mockClear();
    mgr.set('janus', [promptEntry('first command'), promptEntry('second command')]);
    mgr.start();

    vi.advanceTimersByTime(1000);
    expect(input).toHaveBeenCalledWith('p1', 'first command');
    expect(input).not.toHaveBeenCalledWith('p1', 'second command');
    expect(mgr.get('janus')).toHaveLength(1);
    expect(mocks.notify).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(input).toHaveBeenNthCalledWith(3, 'p1', 'second command');
    expect(mgr.get('janus')).toEqual([]);
    expect(mocks.notify).toHaveBeenCalledTimes(2);
    mgr.stop();
  });

  it('retains a second due recurring entry unchanged when a one-shot consumed the budget', () => {
    const { managers, input } = runningHarness();
    const mgr = new ScheduleManager(managers);
    const recurring: ScheduleEntry = {
      id: 'tick', command: 'run check', spec: 'every 1m',
      nextRun: Date.now() - 1000, recurring: true, intervalMs: 60_000,
    };
    mgr.set('janus', [promptEntry('one-shot prompt'), recurring]);
    mgr.start();

    vi.advanceTimersByTime(1000);
    expect(input).toHaveBeenCalledWith('p1', 'one-shot prompt');
    expect(input).not.toHaveBeenCalledWith('p1', 'run check');
    const retained = mgr.get('janus')![0];
    expect(retained.id).toBe('tick');
    expect(retained.nextRun).toBe(recurring.nextRun);

    vi.advanceTimersByTime(1000);
    expect(input).toHaveBeenCalledWith('p1', 'run check');
    const rescheduled = mgr.get('janus')![0];
    expect(rescheduled.recurring).toBe(true);
    expect(rescheduled.nextRun).toBeGreaterThan(recurring.nextRun);
    mgr.stop();
  });

  it('delivers one entry per harness tab in the same tick across separate tabs', () => {
    const first = runningHarness();
    const { managers: managers2, tab: tab2 } = makeManagers({
      label: 'second',
      view: 'harness',
      harness: { name: 'codex', program: 'codex', ptyId: 'p2', status: 'running' },
    });
    first.managers.tab.allLabels = () => ['janus', 'second'];
    (first.managers.tab as unknown as { byLabel: (label: string) => Tab | undefined }).byLabel =
      (label: string) => (label === 'janus' ? first.tab : tab2);
    (managers2.pty as unknown as { input: ReturnType<typeof vi.fn> }).input = first.managers.pty.input;
    Object.assign(first.managers, { pty: managers2.pty });
    const mgr = new ScheduleManager(first.managers);
    const input = first.managers.pty.input as unknown as ReturnType<typeof vi.fn>;
    mgr.set('janus', [promptEntry('first tab command')]);
    mgr.set('second', [promptEntry('second tab command')]);
    mgr.start();

    vi.advanceTimersByTime(1000);
    expect(input).toHaveBeenCalledWith('p1', 'first tab command');
    expect(input).toHaveBeenCalledWith('p2', '\u{1B}[200~second tab command\u{1B}[201~');
    mgr.stop();
  });

  it('keeps the agent tab\'s existing multi-entry dispatch in one tick', () => {
    const { managers } = makeManagers();
    const dispatchTo = vi.fn();
    (managers.command as unknown as { dispatchTo: typeof dispatchTo }).dispatchTo = dispatchTo;
    const mgr = new ScheduleManager(managers);
    mocks.notify.mockClear();
    mgr.set('janus', [promptEntry('first'), promptEntry('second')]);
    mgr.start();

    vi.advanceTimersByTime(1000);
    expect(dispatchTo).toHaveBeenCalledTimes(2);
    expect(dispatchTo).toHaveBeenNthCalledWith(1, 'janus', 'first ## scheduled ##', { detect: false });
    expect(dispatchTo).toHaveBeenNthCalledWith(2, 'janus', 'second ## scheduled ##', { detect: false });
    expect(mocks.notify).toHaveBeenCalledTimes(2);
    mgr.stop();
  });
});

// The app appends an entry of its own — a scheduled resume is the only such caller — so append
// must leave the user's own timers alone and announce the change the schedule surfaces read.
describe('ScheduleManager add', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function harness(): { managers: Managers; tab: Tab; input: ReturnType<typeof vi.fn> } {
    const { managers, tab } = makeManagers({
      view: 'harness',
      harness: { name: 'codex', program: 'codex', ptyId: 'p1', status: 'running' },
    });
    const input = vi.fn();
    (managers.pty as unknown as { input: typeof input }).input = input;
    return { managers, tab, input };
  }

  // The harness fixture plus a second tab whose label extends the first's, for the case where a
  // joined key would read one tab's entry id as another's.
  function twoHarnessTabs(): { managers: Managers; input: ReturnType<typeof vi.fn> } {
    const { managers } = harness();
    const second = { label: 'codex team 2', view: 'harness', harness: { name: 'codex', program: 'codex', ptyId: 'p2', status: 'running' } };
    const input = vi.fn();
    const tab = managers.tab as unknown as { allLabels: () => string[]; byLabel: (l: string) => unknown };
    tab.allLabels = () => ['codex team', 'codex team 2'];
    const first = { label: 'codex team', view: 'harness', harness: { name: 'codex', program: 'codex', ptyId: 'p1', status: 'running' } };
    tab.byLabel = (label: string) => (label === 'codex team' ? first : label === 'codex team 2' ? second : undefined);
    (managers.pty as unknown as { input: typeof input }).input = input;
    return { managers, input };
  }

  function resume(at: number): ScheduleEntry {
    return { id: 'auto-resume', command: 'resume the task you were working on.', spec: 'at 1:21pm', nextRun: at, recurring: false };
  }

  it('appends beside the tab own entries instead of replacing them', () => {
    const { managers } = harness();
    const mgr = new ScheduleManager(managers);
    mgr.set('janus', [{ id: 'standup', command: 'report', spec: 'every 1d', nextRun: Date.now() + 60_000, recurring: true, timeOfDay: { hour: 9, minute: 0 } }]);

    mgr.add('janus', resume(Date.now() + 60_000));
    expect(mgr.get('janus')?.map((e) => e.id)).toEqual(['standup', 'auto-resume']);
  });

  it('creates the list for a tab that has no schedule yet', () => {
    const { managers } = harness();
    const mgr = new ScheduleManager(managers);
    mgr.add('janus', resume(Date.now() + 60_000));
    expect(mgr.get('janus')).toHaveLength(1);
  });

  it('replaces an entry carrying the same id rather than adding a second row under it', () => {
    const { managers } = harness();
    const mgr = new ScheduleManager(managers);
    mgr.add('janus', resume(Date.now() + 60_000));
    mgr.add('janus', resume(Date.now() + 120_000));
    expect(mgr.get('janus')).toHaveLength(1);
    expect(mgr.get('janus')?.[0].nextRun).toBe(Date.now() + 120_000);
  });

  it('emits a state change so the schedule window picks the new row up', () => {
    const { managers } = harness();
    const emit = vi.spyOn(messageBus, 'emit');
    const mgr = new ScheduleManager(managers);
    mgr.add('janus', resume(Date.now() + 60_000));
    expect(emit).toHaveBeenCalledWith('schedules', { type: 'changed' });
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  it('runs the fired hook once, after the entry is delivered, and drops it', () => {
    const { managers, input } = harness();
    const mgr = new ScheduleManager(managers);
    const onFired = { fired: vi.fn(), removed: vi.fn() };
    mgr.add('janus', resume(Date.now()), onFired);
    mgr.start();

    vi.advanceTimersByTime(1000);
    expect(onFired.fired).toHaveBeenCalledTimes(1);
    expect(input.mock.calls[0]?.[0]).toBe('p1');
    expect(input.mock.calls[0]?.[1]).toContain('resume the task you were working on.');
    vi.advanceTimersByTime(5000);
    expect(onFired.fired).toHaveBeenCalledTimes(1);
    mgr.stop();
  });

  it('does not run the fired hook on a tick where delivery had to wait', () => {
    const { managers, tab } = harness();
    tab.harness!.ptyId = '';
    const mgr = new ScheduleManager(managers);
    const onFired = { fired: vi.fn(), removed: vi.fn() };
    mgr.add('janus', resume(Date.now()), onFired);
    mgr.start();

    vi.advanceTimersByTime(1000);
    expect(onFired.fired).not.toHaveBeenCalled();
    tab.harness!.ptyId = 'p1';
    vi.advanceTimersByTime(1000);
    expect(onFired.fired).toHaveBeenCalledTimes(1);
    mgr.stop();
  });

  it('tells a caller its entry was removed rather than delivered, and never fires it afterwards', () => {
    const { managers } = harness();
    const mgr = new ScheduleManager(managers);
    const cancelled = { fired: vi.fn(), removed: vi.fn() };
    const cleared = { fired: vi.fn(), removed: vi.fn() };
    mgr.add('janus', resume(Date.now() - 1000), cancelled);
    mgr.cancel('janus', 'auto-resume');
    mgr.add('janus', resume(Date.now() - 1000), cleared);
    mgr.clearAll();
    mgr.start();

    vi.advanceTimersByTime(1000);
    expect(cancelled.removed).toHaveBeenCalledTimes(1);
    expect(cancelled.fired).not.toHaveBeenCalled();
    expect(cleared.removed).toHaveBeenCalledTimes(1);
    expect(cleared.fired).not.toHaveBeenCalled();
    mgr.stop();
  });

  it('reports a removal once, and not again for an entry id nothing holds', () => {
    const { managers } = harness();
    const mgr = new ScheduleManager(managers);
    const hooks = { fired: vi.fn(), removed: vi.fn() };
    mgr.add('janus', resume(Date.now() - 1000), hooks);
    mgr.cancel('janus', 'auto-resume');
    mgr.cancel('janus', 'auto-resume');
    expect(hooks.removed).toHaveBeenCalledTimes(1);
  });

  it('reports a removal when the tab closes with the entry still on its schedule', () => {
    const { managers } = harness();
    const mgr = new ScheduleManager(managers);
    const hooks = { fired: vi.fn(), removed: vi.fn() };
    mgr.add('janus', resume(Date.now() + 60_000), hooks);
    mgr.closeTab('janus');
    expect(hooks.removed).toHaveBeenCalledTimes(1);
  });

  it('keeps one tab hooks separate from a longer tab label sharing its prefix', () => {
    const { managers } = harness();
    const mgr = new ScheduleManager(managers);
    const shorter = { fired: vi.fn(), removed: vi.fn() };
    const longer = { fired: vi.fn(), removed: vi.fn() };
    // A profile harness entry's name may contain a space, so these two labels differ only by a
    // suffix — the case a single joined key cannot tell apart.
    mgr.add('codex team', resume(Date.now() + 60_000), shorter);
    mgr.add('codex team 2', resume(Date.now() - 1000), longer);
    mgr.clearAll();
    expect(shorter.removed).toHaveBeenCalledTimes(1);
    expect(longer.removed).toHaveBeenCalledTimes(1);
  });

  it('delivers a longer label entry after the shorter label schedule was cleared', () => {
    // Two harness tabs whose labels differ only by a suffix, both due at once.
    const { managers, input } = twoHarnessTabs();
    const mgr = new ScheduleManager(managers);
    const fired = { fired: vi.fn(), removed: vi.fn() };
    mgr.add('codex team', resume(Date.now() + 60_000), { fired: vi.fn(), removed: vi.fn() });
    mgr.add('codex team 2', resume(Date.now() - 1000), fired);
    mgr.set('codex team', []);
    mgr.start();

    vi.advanceTimersByTime(1000);
    expect(fired.fired).toHaveBeenCalledTimes(1);
    expect(input.mock.calls[0]?.[1]).toContain('resume the task');
    mgr.stop();
  });
});

// An app-added entry on an agent tab has to reach the state file, or it is lost on relaunch until
// some unrelated schedule change happens to make a tick write the list.
describe('ScheduleManager add persistence', () => {
  // Each case restores its own spy: `vi.spyOn` hands back the same mock for an already-spied method,
  // so a case that leaves it installed hands its call history to the next one that asserts on it.
  afterEach(() => { vi.restoreAllMocks(); });

  it('writes an agent tab state file carrying the new entry', () => {
    const { managers, saveSpy } = withRealTabManager({ label: 'bekir' });
    const mgr = managers.schedule;
    mgr.add('bekir', { id: 'standup', command: 'report', spec: 'every 1d', nextRun: Date.now() + 60_000, recurring: true, timeOfDay: { hour: 9, minute: 0 } });

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      schedule: [expect.objectContaining({ id: 'standup' })],
    });
  });

  it('writes no state file for a harness tab, whose schedule is memory-only by design', () => {
    const { managers, saveSpy } = withRealTabManager({
      label: 'codex', view: 'harness', harness: { name: 'codex', program: 'codex', ptyId: 'p1', status: 'running' },
    });
    managers.schedule.add('codex', { id: 'auto-resume', command: 'resume', spec: 'once', nextRun: Date.now() + 60_000, recurring: false });

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('writes nothing for a tab that has since closed', () => {
    const { managers, saveSpy } = withRealTabManager({ label: 'bekir' });
    managers.tab.tabs.length = 0;
    managers.schedule.add('bekir', { id: 'x', command: 'y', spec: 'once', nextRun: 1, recurring: false });

    expect(saveSpy).not.toHaveBeenCalled();
  });
});

describe('ScheduleManager schedule launch dialog', () => {
  function makeMgr(tabs: Partial<Tab>[], activeLabel: string): ScheduleManager {
    const managers = {
      tab: {
        tabs,
        byLabel: (label: string) => tabs.find((t) => t.label === label),
        cur: () => tabs.find((t) => t.label === activeLabel),
      },
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

  it('removes a harness tab entry and emits without writing agent state', () => {
    const { managers, saveSpy } = withRealTabManager({ label: 'claude', view: 'harness' });
    const mgr = managers.schedule;
    mgr.set('claude', [entry('a')]);
    const emitSpy = vi.spyOn(messageBus, 'emit');

    expect(mgr.cancel('claude', 'a')).toBe(true);
    expect(mgr.get('claude')).toEqual([]);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith('state', { type: 'dirty' });
    emitSpy.mockRestore();
    saveSpy.mockRestore();
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

describe('ScheduleManager clearAll', () => {
  function makeMgr(tabs: Partial<Tab>[]): { mgr: ScheduleManager; persist: ReturnType<typeof vi.fn> } {
    const persist = vi.fn();
    const managers = {
      tab: {
        tabs,
        byLabel: (l: string) => tabs.find((t) => t.label === l),
        persist,
        buildAgentState: () => ({}),
      },
    } as unknown as Managers;
    return { mgr: new ScheduleManager(managers), persist };
  }

  function entry(id: string): ScheduleEntry {
    return { id, command: 'clear', spec: 'every 5m', nextRun: Date.now() + 60_000, recurring: true, intervalMs: 60_000 };
  }

  it('clears an agent tab schedule, persists it, and emits state.dirty', () => {
    const { mgr, persist } = makeMgr([{ label: 'janus' }]);
    mgr.set('janus', [entry('a')]);
    const emitSpy = vi.spyOn(messageBus, 'emit');

    expect(mgr.clearAll()).toBe(true);
    expect(mgr.get('janus')).toEqual([]);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith('state', { type: 'dirty' });
    emitSpy.mockRestore();
  });

  it('clears a harness tab schedule without writing agent state', () => {
    const { managers, saveSpy } = withRealTabManager({ label: 'claude', view: 'harness' });
    const mgr = managers.schedule;
    mgr.set('claude', [entry('a')]);

    expect(mgr.clearAll()).toBe(true);
    expect(mgr.get('claude')).toEqual([]);
    expect(saveSpy).not.toHaveBeenCalled();
    saveSpy.mockRestore();
  });

  it('leaves an already-empty schedule untouched and does not persist it', () => {
    const { mgr, persist } = makeMgr([{ label: 'janus' }]);
    mgr.set('janus', []);

    expect(mgr.clearAll()).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns false and does not emit when there are no schedules at all', () => {
    const { mgr } = makeMgr([{ label: 'janus' }]);
    const emitSpy = vi.spyOn(messageBus, 'emit');

    expect(mgr.clearAll()).toBe(false);
    expect(emitSpy).not.toHaveBeenCalledWith('state', { type: 'dirty' });
    emitSpy.mockRestore();
  });
});

describe('ScheduleManager aggregatedView', () => {
  function makeMgr(labels: string[]): ScheduleManager {
    const managers = {
      tab: {
        tabs: labels.map((label) => ({ label })),
        byLabel: (label: string) => ({ label }),
      },
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
