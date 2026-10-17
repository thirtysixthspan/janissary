import { describe, expect, it } from 'vitest';
import { queueEntryOrigin } from '../command-queue/entry.js';
import type { Tab } from './types.js';
import { TabQueueState } from './queue-state.js';

class TestQueueState extends TabQueueState {
  protected tabs: Tab[] = [{
    label: 'system',
    runtime: { busy: false, context: [], queue: [] },
  } as Tab];
  updates = 0;

  protected queueChanged(): void {
    this.updates += 1;
  }

  entries() {
    return this.tabs[0].runtime?.queue ?? [];
  }
}

describe('system queue batches', () => {
  it('appends a contiguous plain batch with one update and no provenance', () => {
    const state = new TestQueueState();
    state.enqueueSystemBatch('system', ['first', 'second']);

    expect(state.entries()).toEqual(['first', 'second']);
    expect(state.entries().map((entry) => queueEntryOrigin(entry))).toEqual([undefined, undefined]);
    expect(state.updates).toBe(1);
  });

  it('keeps schedule and manual batches contiguous with separate provenance', () => {
    const state = new TestQueueState();
    state.enqueueSystemScheduleBatch('system', ['scheduled one', 'scheduled two'], 'schedule-key');
    state.enqueueSystemBatch('system', ['manual one', 'manual two']);

    expect(state.entries().map((entry) => typeof entry === 'string' ? entry : entry.line)).toEqual([
      'scheduled one', 'scheduled two', 'manual one', 'manual two',
    ]);
    expect(state.entries().map((entry) => queueEntryOrigin(entry))).toEqual([
      { kind: 'system-schedule', scheduleKey: 'schedule-key' },
      { kind: 'system-schedule', scheduleKey: 'schedule-key' },
      undefined,
      undefined,
    ]);
    expect(state.updates).toBe(2);
  });
});
