import { describe, it, expect } from 'vitest';
import { capLog, finishRunningEntry, appendEntry, finishEntry, clearLog } from './transcript-log.js';
import { makeTab } from './index.js';
import type { LogEntry } from '../types.js';

function entries(count: number): LogEntry[] {
  return Array.from({ length: count }, (_, i) => ({ input: `in${i}`, output: `out${i}` }));
}

describe('capLog', () => {
  it('returns the log unchanged when it is at or under the cap', () => {
    const log = entries(3);

    expect(capLog(log, 3)).toBe(log);
    expect(capLog(log, 10)).toBe(log);
  });

  it('drops the oldest entries when the log is over the cap', () => {
    const capped = capLog(entries(5), 2);

    expect(capped).toEqual([
      { input: 'in3', output: 'out3' },
      { input: 'in4', output: 'out4' },
    ]);
  });
});

describe('finishRunningEntry', () => {
  it('marks the most recent running entry finished with the output', () => {
    const log: LogEntry[] = [
      { input: 'first', output: '', running: true },
      { input: 'second', output: '', running: true },
    ];

    const next = finishRunningEntry(log, 'done');

    expect(next[1]).toEqual({ input: 'second', output: 'done', running: false });
    expect(next[0]).toEqual({ input: 'first', output: '', running: true });
  });

  it('returns the same log reference when nothing is running', () => {
    const log: LogEntry[] = [{ input: 'a', output: 'b' }];

    expect(finishRunningEntry(log, 'done')).toBe(log);
  });
});

describe('appendEntry', () => {
  it('appends the entry and resets the scroll offset', () => {
    const tab = makeTab('bob', 'red');
    tab.scrollOffset = 12;

    const trimmed = appendEntry(tab, { input: 'ls', output: 'x' }, (log) => log);

    expect(tab.log).toEqual([{ input: 'ls', output: 'x' }]);
    expect(tab.scrollOffset).toBe(0);
    expect(trimmed).toBe(0);
  });

  it('returns how many entries the cap dropped', () => {
    const tab = makeTab('bob', 'red', 1, [], entries(3));

    const trimmed = appendEntry(tab, { input: 'new', output: '' }, (log) => capLog(log, 2));

    expect(trimmed).toBe(2);
    expect(tab.log).toHaveLength(2);
    expect(tab.log[1]).toEqual({ input: 'new', output: '' });
  });
});

describe('finishEntry', () => {
  it('writes the output onto the tab\'s running entry', () => {
    const tab = makeTab('bob', 'red', 1, [], [{ input: 'sleep', output: '', running: true }]);

    finishEntry(tab, 'woke up');

    expect(tab.log).toEqual([{ input: 'sleep', output: 'woke up', running: false }]);
  });
});

describe('clearLog', () => {
  it('empties the tab\'s log', () => {
    const tab = makeTab('bob', 'red', 1, [], entries(4));

    clearLog(tab);

    expect(tab.log).toEqual([]);
  });
});
