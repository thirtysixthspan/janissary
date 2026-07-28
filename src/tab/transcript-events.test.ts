import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  markUnreadTab, startRunningTab, finishRunningTab, appendTab, clearTranscriptTab,
} from './transcript-events.js';
import { capLog } from './transcript-log.js';
import { makeTab } from './index.js';
import { messageBus } from '../bus.js';
import type { AgentState, Tab } from '../types.js';

const buildAgentState = (tab: Tab) => ({ name: tab.label }) as AgentState;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('markUnreadTab', () => {
  it('marks a background tab unread', () => {
    const tabs = [makeTab('bob', 'red')];

    markUnreadTab(tabs, 'bob', 'janus');

    expect(tabs[0].hasUnread).toBe(true);
  });

  it('leaves the active, secondary, and docked tabs alone', () => {
    const active = makeTab('active', 'red');
    const secondary = makeTab('secondary', 'red');
    const docked = makeTab('docked', 'red');
    docked.dock = 'left';
    const tabs = [active, secondary, docked];

    for (const label of ['active', 'secondary', 'docked']) {
      markUnreadTab(tabs, label, 'active', 'secondary');
    }

    expect(tabs.map((t) => t.hasUnread)).toEqual([undefined, undefined, undefined]);
  });

  it('ignores a label with no matching tab', () => {
    expect(() => markUnreadTab([makeTab('bob', 'red')], 'ghost', 'janus')).not.toThrow();
  });
});

describe('startRunningTab', () => {
  it('marks the label busy and appends a running entry', () => {
    const busy = new Set<string>();
    const append = vi.fn();

    startRunningTab(busy, 'bob', 'ls', append);

    expect(busy.has('bob')).toBe(true);
    expect(append).toHaveBeenCalledWith('bob', { input: 'ls', output: '', running: true });
  });
});

describe('appendTab', () => {
  it('appends the entry, emits entry:appended, and marks unread', () => {
    const tab = makeTab('bob', 'red');
    const emit = vi.spyOn(messageBus, 'emit');
    const markUnread = vi.fn();

    appendTab([tab], 'bob', { input: 'ls', output: 'x' }, (log) => log, markUnread);

    expect(tab.log).toEqual([{ input: 'ls', output: 'x' }]);
    expect(emit).toHaveBeenCalledWith('transcript', {
      type: 'entry:appended', tabLabel: 'bob', entry: { input: 'ls', output: 'x' }, tab,
    });
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
    expect(markUnread).toHaveBeenCalledWith('bob');
  });

  it('emits entries:trimmed only when the cap dropped entries', () => {
    const uncapped = makeTab('bob', 'red');
    const emit = vi.spyOn(messageBus, 'emit');

    appendTab([uncapped], 'bob', { input: 'a', output: '' }, (log) => log, vi.fn());

    expect(emit).not.toHaveBeenCalledWith('transcript', expect.objectContaining({ type: 'entries:trimmed' }));

    const full = makeTab('ann', 'red', 1, [], [{ input: 'old', output: '' }]);
    appendTab([full], 'ann', { input: 'new', output: '' }, (log) => capLog(log, 1), vi.fn());

    expect(emit).toHaveBeenCalledWith('transcript', { type: 'entries:trimmed', tabLabel: 'ann', count: 1 });
  });

  it('does nothing for a label with no matching tab', () => {
    const markUnread = vi.fn();

    appendTab([makeTab('bob', 'red')], 'ghost', { input: 'a', output: '' }, (log) => log, markUnread);

    expect(markUnread).not.toHaveBeenCalled();
  });
});

describe('finishRunningTab', () => {
  it('finishes the entry, clears busy, persists, and emits', () => {
    const tab = makeTab('bob', 'red', 1, [], [{ input: 'sleep', output: '', running: true }]);
    const emit = vi.spyOn(messageBus, 'emit');
    const deleteBusy = vi.fn();
    const persist = vi.fn();
    const markUnread = vi.fn();

    finishRunningTab([tab], 'bob', 'woke up', deleteBusy, persist, buildAgentState, markUnread);

    expect(tab.log).toEqual([{ input: 'sleep', output: 'woke up', running: false }]);
    expect(deleteBusy).toHaveBeenCalledWith('bob');
    expect(persist).toHaveBeenCalledWith({ name: 'bob' });
    expect(markUnread).toHaveBeenCalledWith('bob');
    expect(emit).toHaveBeenCalledWith('transcript', {
      type: 'entry:appended', tabLabel: 'bob', entry: { input: '', output: 'woke up' }, tab,
    });
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  it('skips the transcript emit when there is no output', () => {
    const tab = makeTab('bob', 'red', 1, [], [{ input: 'sleep', output: '', running: true }]);
    const emit = vi.spyOn(messageBus, 'emit');

    finishRunningTab([tab], 'bob', '', vi.fn(), vi.fn(), buildAgentState, vi.fn());

    expect(emit).not.toHaveBeenCalledWith('transcript', expect.anything());
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });
});

describe('clearTranscriptTab', () => {
  it('empties the log, persists, and emits tab:cleared', () => {
    const tab = makeTab('bob', 'red', 1, [], [{ input: 'ls', output: 'x' }]);
    const emit = vi.spyOn(messageBus, 'emit');
    const persist = vi.fn();

    clearTranscriptTab([tab], 'bob', persist, buildAgentState);

    expect(tab.log).toEqual([]);
    expect(persist).toHaveBeenCalledWith({ name: 'bob' });
    expect(emit).toHaveBeenCalledWith('transcript', { type: 'tab:cleared', tabLabel: 'bob' });
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  it('does nothing for a label with no matching tab', () => {
    const persist = vi.fn();

    clearTranscriptTab([makeTab('bob', 'red')], 'ghost', persist, buildAgentState);

    expect(persist).not.toHaveBeenCalled();
  });
});
