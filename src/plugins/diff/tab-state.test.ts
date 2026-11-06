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

describe('DiffTab change source', () => {
  const settled: ChangeSetResult = {
    kind: 'files', files: [{ path: 'a.txt', additions: 1, deletions: 0, hunks: [] }],
  };

  function sourceTab() {
    const payloads: DiffPayload[] = [];
    const openOrFocusTab = vi.fn((_key: string, create: () => unknown) => create());
    const updateTab = vi.fn((_key: string, update: () => { payload: DiffPayload }) => {
      const result = update();
      payloads.push(result.payload);
      return result;
    });
    const capabilities = { openOrFocusTab, updateTab } as unknown as TabPluginServerCapabilities;
    const read = vi.fn<ChangeSetReader>(async () => settled);
    const tab = new DiffTab('diff', 'diff', '/repo', { root: '/repo' }, read, capabilities, { split: false });
    return { tab, read, payloads, capabilities };
  }

  it('reads the working tree by default and re-reads with the chosen source, clearing the body first', async () => {
    const { tab, read, payloads, capabilities } = sourceTab();
    tab.open('/repo', { root: '/repo' }, capabilities);
    await vi.waitFor(() => expect(tab.shown.state).toBe('done'));
    expect(read.mock.calls[0]?.[4]).toBe('all');

    tab.setSource('staged', capabilities);
    expect(payloads.at(-1)).toMatchObject({ source: 'staged', state: 'loading', files: [] });
    await vi.waitFor(() => expect(tab.shown.state).toBe('done'));
    expect(read.mock.calls.at(-1)?.[4]).toBe('staged');
    expect(tab.shown).toMatchObject({ source: 'staged', files: settled.kind === 'files' ? settled.files : [] });
  });

  it('does nothing when the chosen source is the one already shown', async () => {
    const { tab, read, payloads, capabilities } = sourceTab();
    tab.open('/repo', { root: '/repo' }, capabilities);
    await vi.waitFor(() => expect(tab.shown.state).toBe('done'));
    const published = payloads.length;

    tab.setSource('all', capabilities);
    expect(payloads).toHaveLength(published);
    expect(read).toHaveBeenCalledOnce();
  });
});
