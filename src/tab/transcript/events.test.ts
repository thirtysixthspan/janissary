import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  markUnreadTab, clearUnreadTab, isUnreadEligible, startRunningTab, finishRunningTab, appendTab,
  clearTranscriptTab, updateRunningEntry,
} from './events.js';
import { capLog } from './log.js';
import { makeTab } from '../index.js';
import { messageBus } from '../../bus.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('markUnreadTab', () => {
  it('marks a background tab unread', () => {
    const tabs = [makeTab('bob', 'red')];

    markUnreadTab(tabs, 'bob', 'janus');

    expect(tabs[0].hasUnread).toBe(true);
  });

  // The return value is what lets the harness idle escalation arm itself only on a tab the badge
  // was genuinely raised on, rather than on a tab it merely knows is out of sight.
  it('reports whether it raised the badge', () => {
    const hidden = makeTab('hidden', 'red');
    const active = makeTab('active', 'red');
    const tabs = [hidden, active];

    expect(markUnreadTab(tabs, 'hidden', 'active')).toBe(true);
    expect(markUnreadTab(tabs, 'active', 'active')).toBe(false);
    expect(markUnreadTab(tabs, 'ghost', 'active')).toBe(false);
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

describe('isUnreadEligible', () => {
  it('refuses a docked tab, the active tab, and the other pane visible selection', () => {
    const plain = makeTab('plain', 'red');
    const docked = makeTab('docked', 'red');
    docked.dock = 'right';

    expect(isUnreadEligible(plain, 'plain', 'janus', 'other')).toBe(true);
    expect(isUnreadEligible(docked, 'docked', 'janus', 'other')).toBe(false);
    expect(isUnreadEligible(plain, 'plain', 'plain', 'other')).toBe(false);
    expect(isUnreadEligible(plain, 'plain', 'janus', 'plain')).toBe(false);
  });
});

describe('clearUnreadTab', () => {
  it('clears a badged tab and announces it once', () => {
    const tabs = [makeTab('bob', 'red')];
    tabs[0].hasUnread = true;
    const events: string[] = [];
    const subscription = messageBus.on('tabs', 'unread-cleared', (e) => { events.push(e.label); });

    expect(clearUnreadTab(tabs, 'bob')).toBe(true);

    expect(tabs[0].hasUnread).toBe(false);
    expect(events).toEqual(['bob']);
    subscription.unsubscribe();
  });

  it('ignores a label with no matching tab', () => {
    expect(clearUnreadTab([makeTab('bob', 'red')], 'ghost')).toBe(false);
  });

  // The whole point of gating the announcement on a real change: a dwell that completes on a tab
  // nobody badged must stay silent, because a spurious `unread-cleared` would cancel a pending
  // harness escalation that dwell knows nothing about.
  it('stays silent, and changes nothing, when the tab was not badged', () => {
    const tabs = [makeTab('bob', 'red')];
    const events: string[] = [];
    const subscription = messageBus.on('tabs', 'unread-cleared', (e) => { events.push(e.label); });

    expect(clearUnreadTab(tabs, 'bob')).toBe(false);
    expect(clearUnreadTab(tabs, 'ghost')).toBe(false);

    expect(tabs[0].hasUnread).toBeUndefined();
    expect(events).toEqual([]);
    subscription.unsubscribe();
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

  it('carries extra entry fields such as the working directory into the running entry', () => {
    const append = vi.fn();

    startRunningTab(new Set<string>(), 'bob', 'ls', append, { cwd: '/repo' });

    expect(append).toHaveBeenCalledWith('bob', { input: 'ls', output: '', running: true, cwd: '/repo' });
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

describe('updateRunningEntry', () => {
  it('does nothing for a label with no matching tab but still emits dirty', () => {
    const persist = vi.fn();
    const emit = vi.spyOn(messageBus, 'emit');

    updateRunningEntry([makeTab('bob', 'red')], 'ghost', undefined, 'out', false, { finalize: persist });

    expect(persist).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  it('updates the last matching running entry in place while still running', () => {
    const tab = makeTab('bob', 'red', 1, [], [{ input: 'hi', output: '', running: true, markdown: true }]);
    const finalize = vi.fn();
    const emit = vi.spyOn(messageBus, 'emit');

    updateRunningEntry([tab], 'bob', { markdown: true }, 'partial', true, { finalize });

    expect(tab.log).toEqual([{ input: 'hi', output: 'partial', running: true, markdown: true }]);
    expect(finalize).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  it('on finalize runs the hooks, emits the trailing entry, and emits dirty', () => {
    const tab = makeTab('bob', 'red', 1, [], [{ input: 'hi', output: '', running: true, markdown: true }]);
    const emit = vi.spyOn(messageBus, 'emit');
    const finalize = vi.fn();
    const markUnread = vi.fn();

    updateRunningEntry([tab], 'bob', { markdown: true }, 'final answer', false, { trailing: true, finalize, markUnread });

    expect(tab.log).toEqual([{ input: 'hi', output: 'final answer', running: false, markdown: true }]);
    expect(finalize).toHaveBeenCalledWith(tab);
    expect(markUnread).toHaveBeenCalledWith('bob');
    expect(emit).toHaveBeenCalledWith('transcript', {
      type: 'entry:appended', tabLabel: 'bob', entry: { input: '', output: 'final answer' }, tab,
    });
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  it('emits no trailing entry with empty output or when trailing is unset', () => {
    const mk = () => makeTab('bob', 'red', 1, [], [{ input: 'hi', output: '', running: true, markdown: true }]);
    const emit = vi.spyOn(messageBus, 'emit');

    updateRunningEntry([mk()], 'bob', { markdown: true }, '', false, { trailing: true, finalize: vi.fn() });
    expect(emit).not.toHaveBeenCalledWith('transcript', expect.objectContaining({ type: 'entry:appended' }));

    updateRunningEntry([mk()], 'bob', undefined, 'done', false, { finalize: vi.fn() });
    expect(emit).not.toHaveBeenCalledWith('transcript', expect.objectContaining({ type: 'entry:appended' }));
  });

  it('emits entry:updated when a running entry finishes with empty output', () => {
    const tab = makeTab('bob', 'red', 1, [], [{ input: 'cd src', output: '', running: true }]);
    const emit = vi.spyOn(messageBus, 'emit');

    updateRunningEntry([tab], 'bob', { command: 'cd src' }, '', false, { trailing: true, finalize: vi.fn() });

    expect(tab.log).toEqual([{ input: 'cd src', output: '', running: false }]);
    expect(emit).toHaveBeenCalledWith('transcript', { type: 'entry:updated', tabLabel: 'bob', tab });
  });

  it('emits no entry:updated while the entry is still running or when no running entry matches', () => {
    const tab = makeTab('bob', 'red', 1, [], [{ input: 'ls', output: '', running: true }]);
    const emit = vi.spyOn(messageBus, 'emit');

    updateRunningEntry([tab], 'bob', { command: 'ls' }, 'partial', true, {});
    updateRunningEntry([tab], 'bob', { command: 'other' }, 'x', false, {});

    expect(emit).not.toHaveBeenCalledWith('transcript', expect.objectContaining({ type: 'entry:updated' }));
  });

  it('matches a running entry by its input text when given a command match', () => {
    const tab = makeTab('bob', 'red', 1, [], [
      { input: 'ls', output: '', running: true },
    ]);
    const emit = vi.spyOn(messageBus, 'emit');

    updateRunningEntry([tab], 'bob', { command: 'other' }, 'x', true, {});

    expect(tab.log).toEqual([{ input: 'ls', output: '', running: true }]);

    updateRunningEntry([tab], 'bob', { command: 'ls' }, 'x', false, { trailing: true });
    expect(tab.log).toEqual([{ input: 'ls', output: 'x', running: false }]);
    expect(emit).toHaveBeenCalledWith('transcript', {
      type: 'entry:appended', tabLabel: 'bob', entry: { input: '', output: 'x' }, tab,
    });
  });

  it('an interleaved shell entry is no clobber target for the ACP markdown match', () => {
    const tab = makeTab('bob', 'red', 1, [], [
      { input: 'acp hi', output: '', running: true, markdown: true },
      { input: 'git status', output: '', running: true, cwd: '/repo' },
    ]);
    const emit = vi.spyOn(messageBus, 'emit');

    updateRunningEntry([tab], 'bob', { markdown: true }, 'streamed reply', true, {});

    expect(tab.log[1]).toEqual({ input: 'git status', output: '', running: true, cwd: '/repo' });
    expect(tab.log[0]).toEqual({ input: 'acp hi', output: 'streamed reply', running: true, markdown: true });
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  it('the finalize path with a command match leaves an interleaved shell entry alone', () => {
    const tab = makeTab('bob', 'red', 1, [], [
      { input: 'git status', output: '', running: true, cwd: '/repo' },
      { input: 'monitor ask aslan status', output: '', running: true },
    ]);
    finishRunningTab([tab], 'bob', 'report built', vi.fn(), vi.fn(), { command: 'monitor ask aslan status' });

    expect(tab.log[0]).toEqual({ input: 'git status', output: '', running: true, cwd: '/repo' });
    expect(tab.log[1]).toEqual({ input: 'monitor ask aslan status', output: 'report built', running: false });
  });
});

describe('finishRunningTab', () => {
  it('finishes the entry, clears busy, and emits', () => {
    const tab = makeTab('bob', 'red', 1, [], [{ input: 'sleep', output: '', running: true }]);
    const emit = vi.spyOn(messageBus, 'emit');
    const deleteBusy = vi.fn();
    const markUnread = vi.fn();

    finishRunningTab([tab], 'bob', 'woke up', deleteBusy, markUnread);

    expect(tab.log).toEqual([{ input: 'sleep', output: 'woke up', running: false }]);
    expect(deleteBusy).toHaveBeenCalledWith('bob');
    expect(markUnread).toHaveBeenCalledWith('bob');
    expect(emit).toHaveBeenCalledWith('transcript', {
      type: 'entry:appended', tabLabel: 'bob', entry: { input: '', output: 'woke up' }, tab,
    });
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  it('skips the trailing append but still reports the update when there is no output', () => {
    const tab = makeTab('bob', 'red', 1, [], [{ input: 'sleep', output: '', running: true }]);
    const emit = vi.spyOn(messageBus, 'emit');

    finishRunningTab([tab], 'bob', '', vi.fn(), vi.fn());

    expect(emit).not.toHaveBeenCalledWith('transcript', expect.objectContaining({ type: 'entry:appended' }));
    expect(emit).toHaveBeenCalledWith('transcript', { type: 'entry:updated', tabLabel: 'bob', tab });
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });
});

describe('clearTranscriptTab', () => {
  it('empties the log and emits tab:cleared', () => {
    const tab = makeTab('bob', 'red', 1, [], [{ input: 'ls', output: 'x' }]);
    const emit = vi.spyOn(messageBus, 'emit');

    clearTranscriptTab([tab], 'bob');

    expect(tab.log).toEqual([]);
    expect(emit).toHaveBeenCalledWith('transcript', { type: 'tab:cleared', tabLabel: 'bob' });
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });
});
