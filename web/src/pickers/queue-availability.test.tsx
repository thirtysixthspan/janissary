import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { useQueuePicker } from './useQueuePicker';

const client = { send: vi.fn() } as unknown as JanusClient;
const agent = { label: 'agent', commandQueue: [] } as unknown as TabView;
const consumer = {
  label: 'background-work', view: 'plugin', hasCommandQueue: true, commandQueue: ['next'],
  plugin: { id: 'any-plugin', hostsCommandBar: true },
} as unknown as TabView;

describe('optional core queue popup', () => {
  it('does not open for an agent or a command bar without a queue', () => {
    const { result, rerender } = renderHook(({ tab }) => useQueuePicker(client, tab), { initialProps: { tab: agent } });
    act(() => result.current.openQueue());
    expect(result.current.queueOpen).toBe(false);
    rerender({ tab: { ...consumer, hasCommandQueue: undefined } });
    act(() => result.current.openQueue());
    expect(result.current.queueOpen).toBe(false);
  });

  it('closes when its owner disappears and the current tab has no queue', () => {
    const { result, rerender } = renderHook(({ tab }) => useQueuePicker(client, tab), { initialProps: { tab: consumer } });
    act(() => result.current.openQueue());
    expect(result.current.queueOpen).toBe(true);
    rerender({ tab: agent });
    expect(result.current.queueOpen).toBe(false);
  });
});
