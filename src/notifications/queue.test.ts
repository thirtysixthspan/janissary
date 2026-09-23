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

describe('NotificationQueue burst test', () => {
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
