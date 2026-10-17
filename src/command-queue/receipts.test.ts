import { describe, expect, it } from 'vitest';
import { makeTab } from '../tab/index.js';
import { tabRuntime } from '../tab/runtime.js';
import { getQueue, updateQueueEntry, removeQueueEntry, shiftQueue } from '../tab/queue.js';
import { TabPluginRejection } from '../plugins/api-capabilities.js';
import {
  MAX_OUTSTANDING_QUEUE_RECEIPTS, consumeReceipt, dequeueWithReceipt, discardReceipt,
  enqueueSystemSchedule, releasePluginReceipts,
} from './receipts.js';

describe('command queue receipts', () => {
  it('projects mixed rows as strings and legacy dequeue releases provenance', () => {
    const queue = ['ordinary', { line: 'scheduled', origin: { kind: 'system-schedule' as const, scheduleKey: 's1' } }];
    expect(getQueue(queue)).toEqual(['ordinary', 'scheduled']);
    expect(shiftQueue(queue)).toBe('ordinary');
    expect(shiftQueue(queue)).toBe('scheduled');
    expect(queue).toEqual([]);
  });

  it('drops provenance when a structured row is edited or deleted', () => {
    const queue = [{ line: 'before', origin: { kind: 'system-schedule' as const, scheduleKey: 's1' } }];
    expect(updateQueueEntry(queue, 0, 'edited')).toBe(true);
    expect(queue).toEqual(['edited']);
    enqueueSystemSchedule(queue, 'remove', 's2');
    expect(removeQueueEntry(queue, 1)).toBe(true);
    expect(queue).toEqual(['edited']);
  });

  it('returns null for an empty queue without creating a receipt', () => {
    const runtime = tabRuntime(makeTab('scheduled', '#fff'));
    expect(dequeueWithReceipt(runtime, 'test')).toBeNull();
    expect(runtime.queueReceipts?.size).toBe(0);
  });

  it('binds each receipt to its own row even when line text is identical', () => {
    const runtime = tabRuntime(makeTab('scheduled', '#fff'));
    enqueueSystemSchedule(runtime.queue, 'same', 'first');
    enqueueSystemSchedule(runtime.queue, 'same', 'second');
    const first = dequeueWithReceipt(runtime, 'test');
    const second = dequeueWithReceipt(runtime, 'test');
    expect(first?.line).toBe('same');
    expect(second?.line).toBe('same');
    expect(first?.receipt).not.toBe(second?.receipt);
    expect(consumeReceipt(runtime, 'test', first!.receipt)).toMatchObject({ origin: { scheduleKey: 'first' } });
    expect(consumeReceipt(runtime, 'test', second!.receipt)).toMatchObject({ origin: { scheduleKey: 'second' } });
  });

  it('rejects malformed, replayed, cross-plugin, and stale-incarnation receipts', () => {
    const runtime = tabRuntime(makeTab('scheduled', '#fff'));
    runtime.queue.push('line');
    const command = dequeueWithReceipt(runtime, 'owner')!;
    expect(() => consumeReceipt(runtime, 'other', command.receipt)).toThrow(TabPluginRejection);
    expect(() => consumeReceipt(runtime, 'owner', 'malformed')).toThrow(TabPluginRejection);
    expect(consumeReceipt(runtime, 'owner', command.receipt)).toBe('line');
    expect(() => consumeReceipt(runtime, 'owner', command.receipt)).toThrow(TabPluginRejection);
    runtime.queue.push('again');
    const stale = dequeueWithReceipt(runtime, 'owner')!;
    runtime.incarnation = 'new-incarnation';
    expect(() => consumeReceipt(runtime, 'owner', stale.receipt)).toThrow(TabPluginRejection);
  });

  it('bounds outstanding receipt state and leaves queued rows untouched at capacity', () => {
    const runtime = tabRuntime(makeTab('scheduled', '#fff'));
    for (let index = 0; index < MAX_OUTSTANDING_QUEUE_RECEIPTS; index++) {
      runtime.queue.push(String(index));
      dequeueWithReceipt(runtime, 'owner');
    }
    runtime.queue.push('last');
    expect(() => dequeueWithReceipt(runtime, 'owner')).toThrow(TabPluginRejection);
    expect(runtime.queue).toEqual(['last']);
  });

  it('makes discard idempotent and releases a plugin’s outstanding receipts', () => {
    const runtime = tabRuntime(makeTab('scheduled', '#fff'));
    runtime.queue.push('one', 'two');
    const first = dequeueWithReceipt(runtime, 'owner')!;
    const second = dequeueWithReceipt(runtime, 'other')!;
    discardReceipt(runtime, 'owner', 'absent');
    expect(() => discardReceipt(runtime, 'owner', second.receipt)).toThrow(TabPluginRejection);
    expect(consumeReceipt(runtime, 'owner', first.receipt)).toBe('one');
    releasePluginReceipts(runtime, 'other');
    expect(() => consumeReceipt(runtime, 'other', second.receipt)).toThrow(TabPluginRejection);
    expect(runtime.queueReceipts?.size).toBe(0);
  });
});
