import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { makeTab } from '../tab/index.js';
import type { MonitorTarget } from '../tab/types.js';
import type { MonitorSub } from './manager.js';
import { closeIfUnfed, stopMonitor } from './stop.js';
import { closeMonitorTab, updateMonitorMeta } from './window.js';

vi.mock('./window.js', () => ({ closeMonitorTab: vi.fn(), updateMonitorMeta: vi.fn() }));

const target: MonitorTarget = { kind: 'tab', label: 'worker' };

function makeMonitor(overrides: Partial<MonitorSub> = {}) {
  const tick = vi.fn();
  const reg = {
    owner: 'main', name: 'watch', inline: false,
    persona: { name: 'reviewer', harness: { harness: 'opencode', model: 'test', variant: 'test' }, body: '', tools: [] },
    targets: [target], buffer: [], harnessTranscriptSeen: new Map(), harnessSeen: new Map(),
    editorSeen: new Map(), pageSeen: new Map(), delimiter: 'test-delimiter',
    session: { prompt: vi.fn(), kill: vi.fn() }, inFlight: false, delivered: 0,
    contextBytes: 512, contextText: [], timer: setInterval(tick, 1000),
    subs: [{ unsubscribe: vi.fn() }, { unsubscribe: vi.fn() }],
    ...overrides,
  } satisfies MonitorSub;
  return { reg, tick };
}

function setup(overrides: Partial<MonitorSub> = {}) {
  const fixture = makeMonitor(overrides);
  const monitors = new Map<string, MonitorSub>([[`${fixture.reg.owner}:${fixture.reg.name}`, fixture.reg]]);
  const managers = {
    tab: { tabs: [{ ...makeTab('worker', '#aaa'), title: 'Reviewer' }] },
  } as unknown as Managers;
  return { ...fixture, monitors, managers };
}

function expectRunning(reg: MonitorSub) {
  expect(reg.session.kill).not.toHaveBeenCalled();
  for (const sub of reg.subs) expect(sub.unsubscribe).not.toHaveBeenCalled();
}

function expectStopped(reg: MonitorSub) {
  expect(reg.session.kill).toHaveBeenCalledTimes(1);
  for (const sub of reg.subs) expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('stopMonitor', () => {
  it.each([['other', 'watch'], ['main', 'missing']])('ignores an unknown registration %s:%s', (owner, name) => {
    const { reg, tick, monitors, managers } = setup();
    expect(stopMonitor(monitors, managers, owner, name)).toBe(false);
    expect([...monitors]).toEqual([['main:watch', reg]]);
    expect(reg.targets).toEqual([target]);
    expectRunning(reg);
    expect(updateMonitorMeta).not.toHaveBeenCalled();
    expect(closeMonitorTab).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it.each([
    { dropped: target, remaining: [{ kind: 'tab', label: 'other' }, { kind: 'group', group: 3 }], text: 'other, group:3' },
    { dropped: { kind: 'group', group: 2 }, remaining: [target], text: 'worker' },
    { dropped: { kind: 'tab', label: 'REVIEWER' }, remaining: [{ kind: 'group', group: 3 }], text: 'group:3' },
  ] satisfies { dropped: MonitorTarget; remaining: MonitorTarget[]; text: string }[])(
    'removes $dropped while keeping $text active', ({ dropped, remaining, text }) => {
      const first = dropped.kind === 'group' ? dropped : target;
      const { reg, tick, monitors, managers } = setup({ targets: [first, ...remaining] });
      expect(stopMonitor(monitors, managers, 'main', 'watch', dropped)).toBe(true);
      expect(reg.targets).toEqual(remaining);
      expect(monitors.get('main:watch')).toBe(reg);
      expect(updateMonitorMeta).toHaveBeenCalledExactlyOnceWith(managers, 'watch', text, 512);
      expectRunning(reg);
      expect(closeMonitorTab).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(tick).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { stored: target, dropped: { kind: 'tab', label: 'missing' }, text: 'worker' },
    { stored: { kind: 'group', group: 3 }, dropped: { group: 3, kind: 'group' }, text: 'group:3' },
  ] satisfies { stored: MonitorTarget; dropped: MonitorTarget; text: string }[])(
    'preserves targets when serialized membership does not match $dropped', ({ stored, dropped, text }) => {
      const { reg, tick, monitors, managers } = setup({ targets: [stored] });
      expect(stopMonitor(monitors, managers, 'main', 'watch', dropped)).toBe(true);
      expect(reg.targets).toEqual([stored]);
      expect(monitors.get('main:watch')).toBe(reg);
      expect(updateMonitorMeta).toHaveBeenCalledExactlyOnceWith(managers, 'watch', text, 512);
      expectRunning(reg);
      expect(closeMonitorTab).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(tick).toHaveBeenCalledTimes(1);
    },
  );

  it.each([undefined, target])('releases every resource on a full stop or last-target removal (%j)', (dropped) => {
    const { reg, tick, monitors, managers } = setup();
    expect(stopMonitor(monitors, managers, 'main', 'watch', dropped)).toBe(true);
    expect(monitors.size).toBe(0);
    expectStopped(reg);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(tick).not.toHaveBeenCalled();
    expect(closeMonitorTab).toHaveBeenCalledExactlyOnceWith(managers, 'watch');
    expect(updateMonitorMeta).not.toHaveBeenCalled();
    expect(stopMonitor(monitors, managers, 'main', 'watch', dropped)).toBe(false);
    expectStopped(reg);
    expect(closeMonitorTab).toHaveBeenCalledTimes(1);
  });

  it('keeps another owner feeding the same reporting tab until its last target is dropped', () => {
    const { reg, monitors, managers } = setup();
    const other = makeMonitor({ owner: 'other' });
    monitors.set('other:watch', other.reg);
    expect(stopMonitor(monitors, managers, 'main', 'watch', target)).toBe(true);
    expect([...monitors]).toEqual([['other:watch', other.reg]]);
    expectStopped(reg);
    expectRunning(other.reg);
    expect(closeMonitorTab).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(other.tick).toHaveBeenCalledTimes(1);
    expect(stopMonitor(monitors, managers, 'other', 'watch', target)).toBe(true);
    expectStopped(other.reg);
    expect(monitors.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(closeMonitorTab).toHaveBeenCalledExactlyOnceWith(managers, 'watch');
  });

  it.each([undefined, target])('stops an inline monitor without closing a tab (%j)', (dropped) => {
    const { reg, tick, monitors, managers } = setup({ inline: true, targets: [{ kind: 'tab', label: 'main' }] });
    expect(stopMonitor(monitors, managers, 'main', 'watch', dropped)).toBe(true);
    expectStopped(reg);
    expect(monitors.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(tick).not.toHaveBeenCalled();
    expect(closeMonitorTab).not.toHaveBeenCalled();
    expect(updateMonitorMeta).not.toHaveBeenCalled();
  });
});

describe('closeIfUnfed', () => {
  it('closes a reporting tab with no registrations', () => {
    const { managers } = setup();
    closeIfUnfed(new Map(), managers, 'watch');
    expect(closeMonitorTab).toHaveBeenCalledExactlyOnceWith(managers, 'watch');
  });

  it.each([
    { inline: false, name: 'watch', closes: false },
    { inline: true, name: 'watch', closes: true },
    { inline: false, name: 'other-watch', closes: true },
  ])('checks external runtime-name ownership: $name, inline=$inline', ({ inline, name, closes }) => {
    const { reg, monitors, managers } = setup({ inline, name });
    closeIfUnfed(monitors, managers, 'watch');
    expect(closeMonitorTab).toHaveBeenCalledTimes(closes ? 1 : 0);
    if (closes) expect(closeMonitorTab).toHaveBeenCalledWith(managers, 'watch');
    expect([...monitors.values()]).toEqual([reg]);
    expectRunning(reg);
    expect(vi.getTimerCount()).toBe(1);
    expect(updateMonitorMeta).not.toHaveBeenCalled();
  });
});
