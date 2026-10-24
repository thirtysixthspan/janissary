import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TabPluginServerCapabilities } from '../api.js';
import type { ChangeSetResult } from './change-set.js';
import type { DiffPayload } from './shared.js';
import { DiffTab, type ChangeSetReader } from './tab-state.js';

describe('DiffTab read deadlines', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('aborts a local read after thirty seconds and publishes the timeout', async () => {
    vi.useFakeTimers();
    const payloads: DiffPayload[] = [];
    const openOrFocusTab = vi.fn((_key: string, create: () => unknown) => create());
    const updateTab = vi.fn((_key: string, update: () => { payload: DiffPayload }) => {
      const result = update();
      payloads.push(result.payload);
      return result;
    });
    const capabilities = { openOrFocusTab, updateTab } as unknown as TabPluginServerCapabilities;
    const read: ChangeSetReader = vi.fn((_root, _capabilities, _fullFiles, signal) => new Promise<ChangeSetResult>((_resolve, reject) => {
      signal?.addEventListener('abort', () => { reject(signal.reason); }, { once: true });
    }));
    const tab = new DiffTab('diff', 'diff', '/repo', { root: '/repo' }, read, capabilities, { split: false });

    tab.open('/repo', { root: '/repo' }, capabilities);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(read).toHaveBeenCalledOnce();
    expect(read.mock.calls[0]?.[3]?.aborted).toBe(true);
    expect(payloads.at(-1)).toMatchObject({
      state: 'error', message: 'Git diff read timed out after 30000 ms',
    });
  });
});
