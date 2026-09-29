import { describe, it, expect } from 'vitest';
import {
  NotificationQueue, NOTIFICATION_QUEUE_LIMIT, type RecordedNotification,
} from './queue.js';

function notification(message: string, recordedAt: Date): RecordedNotification {
  return {
    event: 'manual',
    tabLabel: 'janus',
    message,
    entry: { input: '', output: message },
    detectedAt: recordedAt,
    recordedAt,
  };
}

const AT = new Date(2026, 0, 1, 20, 32, 0);
const after = (ms: number) => new Date(AT.getTime() + ms);

describe('NotificationQueue', () => {
  it('holds appended notifications in order', () => {
    const queue = new NotificationQueue();
    queue.append(notification('one', AT));
    queue.append(notification('two', AT));
    expect(queue.all.map((n) => n.message)).toEqual(['one', 'two']);
  });

  it('renders the feed\'s entries from what it holds', () => {
    const queue = new NotificationQueue();
    queue.append(notification('one', AT));
    expect(queue.logEntries).toEqual([{ input: '', output: 'one' }]);
  });

  it('caps at the limit, dropping the oldest', () => {
    const queue = new NotificationQueue();
    for (let index = 0; index < NOTIFICATION_QUEUE_LIMIT + 5; index += 1) {
      queue.append(notification(`n${index}`, AT));
    }
    expect(queue.all).toHaveLength(NOTIFICATION_QUEUE_LIMIT);
    expect(queue.all[0].message).toBe('n5');
    expect(queue.all.at(-1)!.message).toBe(`n${NOTIFICATION_QUEUE_LIMIT + 4}`);
  });

  it('empties on clear', () => {
    const queue = new NotificationQueue();
    queue.append(notification('one', AT));
    queue.clear();
    expect(queue.all).toHaveLength(0);
    expect(queue.logEntries).toHaveLength(0);
  });
});

describe('NotificationQueue folding sequential repeats', () => {
  it('folds a repeat into one entry with a count and a suffixed feed line', () => {
    const queue = new NotificationQueue();
    expect(queue.append(notification('failed', AT)).repeated).toBe(false);
    const { held, repeated } = queue.append(notification('failed', after(60_000)));
    expect(repeated).toBe(true);
    expect(held.count).toBe(2);
    expect(queue.all).toHaveLength(1);
    expect(queue.all[0].recordedAt).toEqual(after(60_000));
    expect(queue.all[0].message).toBe('failed');
    expect(queue.logEntries).toEqual([{ input: '', output: 'failed (2 times)' }]);
    queue.append(notification('failed', after(120_000)));
    expect(queue.logEntries).toEqual([{ input: '', output: 'failed (3 times)' }]);
  });

  it('does not fold the same message from a different tab', () => {
    const queue = new NotificationQueue();
    queue.append(notification('failed', AT));
    const { repeated } = queue.append({ ...notification('failed', AT), tabLabel: 'build' });
    expect(repeated).toBe(false);
    expect(queue.all).toHaveLength(2);
  });

  it('does not fold a repeat separated by another notification', () => {
    const queue = new NotificationQueue();
    queue.append(notification('failed', AT));
    queue.append(notification('other', AT));
    queue.append(notification('failed', AT));
    expect(queue.logEntries.map((e) => e.output)).toEqual(['failed', 'other', 'failed']);
  });

  it('links every repeat\'s file on the folded line, oldest first', () => {
    const queue = new NotificationQueue();
    for (const index of [1, 2, 3]) {
      const base = notification('approved', AT);
      queue.append({ ...base, entry: { ...base.entry, openFiles: [`/captures/${index}.txt`] } });
    }
    expect(queue.logEntries).toEqual([{
      input: '', output: 'approved (3 times)', openFiles: ['/captures/1.txt', '/captures/2.txt', '/captures/3.txt'],
    }]);
  });

  it('keeps the earlier files when a repeat brings none of its own', () => {
    const queue = new NotificationQueue();
    const base = notification('approved', AT);
    queue.append({ ...base, entry: { ...base.entry, openFiles: ['/captures/1.txt'] } });
    queue.append(notification('approved', AT));
    expect(queue.logEntries[0].openFiles).toEqual(['/captures/1.txt']);
  });

  it('carries no file links when no repeat had a file', () => {
    const queue = new NotificationQueue();
    queue.append(notification('failed', AT));
    queue.append(notification('failed', AT));
    expect(queue.logEntries[0]).not.toHaveProperty('openFiles');
  });

  it('spends one slot of the limit on a folded flood', () => {
    const queue = new NotificationQueue();
    queue.append(notification('first', AT));
    for (let index = 0; index < NOTIFICATION_QUEUE_LIMIT + 5; index += 1) {
      queue.append(notification('failed', AT));
    }
    expect(queue.all.map((n) => n.message)).toEqual(['first', 'failed']);
    expect(queue.all[1].count).toBe(NOTIFICATION_QUEUE_LIMIT + 5);
  });
});

describe('NotificationQueue burst test', () => {
  // A folded repeat is one entry but still one more arrival, so a flood of one message escalates
  // the same as three different ones would.
  it('counts folded repeats as arrivals', () => {
    const queue = new NotificationQueue();
    queue.append(notification('failed', AT));
    queue.append(notification('failed', after(1000)));
    queue.append(notification('failed', after(2000)));
    expect(queue.all).toHaveLength(1);
    expect(queue.isBurst(after(2000))).toBe(true);
  });

  it('forgets arrivals on clear', () => {
    const queue = new NotificationQueue();
    queue.append(notification('one', AT));
    queue.append(notification('two', after(1000)));
    queue.clear();
    queue.append(notification('three', after(2000)));
    expect(queue.isBurst(after(2000))).toBe(false);
  });

  it('is false for the first two notifications inside the window', () => {
    const queue = new NotificationQueue();
    queue.append(notification('one', AT));
    expect(queue.isBurst(AT)).toBe(false);
    queue.append(notification('two', after(1000)));
    expect(queue.isBurst(after(1000))).toBe(false);
  });

  it('is true on the third notification inside ten seconds', () => {
    const queue = new NotificationQueue();
    queue.append(notification('one', AT));
    queue.append(notification('two', after(1000)));
    queue.append(notification('three', after(2000)));
    expect(queue.isBurst(after(2000))).toBe(true);
  });

  it('is false when the same three are spread wider than the window', () => {
    const queue = new NotificationQueue();
    queue.append(notification('one', AT));
    queue.append(notification('two', after(20_000)));
    queue.append(notification('three', after(40_000)));
    expect(queue.isBurst(after(40_000))).toBe(false);
  });

  // Arrival, not detection: a reattach replaying reports detected hours ago still delivers them
  // together, and three arriving at once is a burst however old they are.
  it('counts replayed notifications by when they arrived', () => {
    const queue = new NotificationQueue();
    for (const index of [0, 1, 2]) {
      queue.append({
        ...notification(`replayed-${index}`, AT),
        detectedAt: new Date(2025, 11, 28, 9, 5, 0),
      });
    }
    expect(queue.isBurst(AT)).toBe(true);
  });
});
