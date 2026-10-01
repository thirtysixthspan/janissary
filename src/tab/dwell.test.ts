import { describe, it, expect, vi, afterEach } from 'vitest';
import { beginDwell, disposeDwell, UNREAD_DWELL_MS } from './dwell.js';
import { clearUnreadTab, markUnreadTab } from './transcript/events.js';
import { messageBus } from '../bus.js';
import { makeTab } from './index.js';
import type { Tab } from './types.js';

const badged = (labels: string[]): Tab[] => labels.map((l) => {
  const tab = makeTab(l, 'red');
  tab.hasUnread = true;
  return tab;
});

const labelOf = (tabs: Tab[], label: string): boolean | undefined =>
  tabs.find((t) => t.label === label)?.hasUnread;

afterEach(() => {
  disposeDwell();
  vi.useRealTimers();
  messageBus.clear();
});

describe('unread dwell', () => {
  it('clears the badge only once the interval is up', () => {
    vi.useFakeTimers();
    const tabs = badged(['bob']);

    beginDwell(() => tabs, 'bob');
    expect(labelOf(tabs, 'bob')).toBe(true);

    vi.advanceTimersByTime(UNREAD_DWELL_MS - 1);
    expect(labelOf(tabs, 'bob')).toBe(true);

    vi.advanceTimersByTime(1);
    expect(labelOf(tabs, 'bob')).toBe(false);
  });

  // The interval is continuous per tab: a glance at one tab and a move to another starts the clock
  // again, rather than leaving a candidate to fire later against a tab the user has left.
  it('replaces a pending dwell rather than queueing a second one', () => {
    vi.useFakeTimers();
    const tabs = badged(['bob', 'sue']);

    beginDwell(() => tabs, 'bob');
    vi.advanceTimersByTime(UNREAD_DWELL_MS - 1);
    beginDwell(() => tabs, 'sue');
    vi.advanceTimersByTime(UNREAD_DWELL_MS - 1);

    // The first dwell was abandoned when the second began, so bob still carries its badge.
    expect(labelOf(tabs, 'bob')).toBe(true);
    expect(labelOf(tabs, 'sue')).toBe(true);

    vi.advanceTimersByTime(1);
    expect(labelOf(tabs, 'sue')).toBe(false);
    expect(labelOf(tabs, 'bob')).toBe(true);
  });

  // The switch has to be unconditional, not just the arming: a candidate left counting down when
  // the user moves to a tab with no badge fires against the tab behind them, and since that badge is
  // what arms the harness idle escalation, the same switch would cancel a notification they never
  // got. `product/specs/tabs.md` states this invariant in the same words.
  it('abandons a pending dwell when the newly selected tab carries no badge', () => {
    vi.useFakeTimers();
    const tabs = [makeTab('janus', 'red'), makeTab('bob', 'red')];
    markUnreadTab(tabs, 'bob', 'janus');

    beginDwell(() => tabs, 'bob');
    vi.advanceTimersByTime(UNREAD_DWELL_MS - 1);
    beginDwell(() => tabs, 'janus');
    vi.advanceTimersByTime(UNREAD_DWELL_MS * 2);

    expect(labelOf(tabs, 'bob')).toBe(true);
  });

  it('arms nothing for a tab carrying no badge', () => {
    vi.useFakeTimers();
    const tabs = [makeTab('bob', 'red')];
    const events: string[] = [];
    const subscription = messageBus.on('tabs', 'unread-cleared', (e) => { events.push(e.label); });

    beginDwell(() => tabs, 'bob');
    vi.advanceTimersByTime(UNREAD_DWELL_MS * 2);

    expect(events).toEqual([]);
    expect(labelOf(tabs, 'bob')).toBeUndefined();
    subscription.unsubscribe();
  });

  it('clears nothing when the tab is gone by the time the interval is up', () => {
    vi.useFakeTimers();
    const tabs = badged(['bob']);
    const events: string[] = [];
    const subscription = messageBus.on('tabs', 'unread-cleared', (e) => { events.push(e.label); });

    beginDwell(() => tabs, 'bob');
    tabs.length = 0;
    vi.advanceTimersByTime(UNREAD_DWELL_MS);

    expect(events).toEqual([]);
    subscription.unsubscribe();
  });

  // Docking a tab into a sidebar deliberately leaves its badge alone, and a tab docked without ever
  // being selected has no dwell coming to take it off — so a dwell that was already pending when
  // the tab got docked is the one chance that badge gets cleared.
  it('still clears a dwell that was pending when its tab was docked', () => {
    vi.useFakeTimers();
    const tabs = badged(['bob']);

    beginDwell(() => tabs, 'bob');
    tabs[0].dock = 'left';
    vi.advanceTimersByTime(UNREAD_DWELL_MS);

    expect(labelOf(tabs, 'bob')).toBe(false);
  });

  // `removeTabAt` maps every surviving tab into a fresh object, so the array a dwell is handed can
  // be a detached copy by the time it fires. Resolving at fire time is what keeps the clear landing
  // on the live tab.
  it('resolves the tabs array when the interval is up, not when the dwell began', () => {
    vi.useFakeTimers();
    const before = badged(['bob']);
    const after = badged(['bob']);

    beginDwell(() => after, 'bob');
    expect(labelOf(before, 'bob')).toBe(true);
    vi.advanceTimersByTime(UNREAD_DWELL_MS);

    expect(labelOf(after, 'bob')).toBe(false);
    expect(labelOf(before, 'bob')).toBe(true);
  });

  it('drops a pending dwell on dispose', () => {
    vi.useFakeTimers();
    const tabs = badged(['bob']);
    const events: string[] = [];
    const subscription = messageBus.on('tabs', 'unread-cleared', (e) => { events.push(e.label); });

    beginDwell(() => tabs, 'bob');
    disposeDwell();
    vi.advanceTimersByTime(UNREAD_DWELL_MS * 2);

    expect(labelOf(tabs, 'bob')).toBe(true);
    expect(events).toEqual([]);
    subscription.unsubscribe();
  });

  it('pushes a state change when a completed dwell takes a badge off', () => {
    vi.useFakeTimers();
    const tabs = badged(['bob']);
    const events: string[] = [];
    const subscription = messageBus.on('state', 'dirty', () => { events.push('dirty'); });

    beginDwell(() => tabs, 'bob');
    expect(events).toEqual([]);
    vi.advanceTimersByTime(UNREAD_DWELL_MS);

    expect(events).toEqual(['dirty']);
    subscription.unsubscribe();
  });

  // A badge the harness dropped by going back to work while the dwell was running leaves the dwell
  // with nothing to do, and it must not announce a second clear for the same tab.
  it('stays silent when the badge was already taken off in the meantime', () => {
    vi.useFakeTimers();
    const tabs = badged(['bob']);
    const events: string[] = [];
    const subscription = messageBus.on('tabs', 'unread-cleared', (e) => { events.push(e.label); });

    beginDwell(() => tabs, 'bob');
    clearUnreadTab(tabs, 'bob');
    events.length = 0;
    vi.advanceTimersByTime(UNREAD_DWELL_MS);

    expect(events).toEqual([]);
    subscription.unsubscribe();
  });

  it('leaves a badge the user never raised alone across a tab switch', () => {
    vi.useFakeTimers();
    const tabs = [makeTab('janus', 'red'), makeTab('bob', 'red')];
    markUnreadTab(tabs, 'bob', 'janus');

    beginDwell(() => tabs, 'janus');
    vi.advanceTimersByTime(UNREAD_DWELL_MS);

    expect(labelOf(tabs, 'bob')).toBe(true);
  });
});
