import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import React from 'react';
import type { JanusClient } from './ws';
import { useQuickOpen } from './useQuickOpen';

function TestComponent({ client, onHook }: { client: JanusClient; onHook: (hook: ReturnType<typeof useQuickOpen>) => void }) {
  const hook = useQuickOpen(client);
  onHook(hook);
  return null;
}

// `Promise.withResolvers` (ES2024) predates this project's `lib` target; a small typed shim keeps
// the tests off the disallowed "extract resolver from `new Promise()`" pattern regardless.
function withResolvers<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  const state = { resolve: undefined as unknown as (value: T) => void };
  const promise = new Promise<T>((resolve) => { state.resolve = resolve; });
  return { promise, resolve: state.resolve };
}

describe('useQuickOpen', () => {
  it('openQuickOpen resets query/index, opens, and sets loading', () => {
    let hook: ReturnType<typeof useQuickOpen> | undefined;
    const client = { send: vi.fn(), request: vi.fn(() => new Promise(() => { /* never resolves */ })) } as unknown as JanusClient;
    render(React.createElement(TestComponent, { client, onHook: (h) => { hook = h; } }));
    act(() => { hook!.setQuickOpenQuery('stale'); hook!.setQuickOpenIndex(3); });
    act(() => hook!.openQuickOpen());
    expect(hook!.quickOpenOpen).toBe(true);
    expect(hook!.quickOpenQuery).toBe('');
    expect(hook!.quickOpenIndex).toBe(0);
    expect(hook!.quickOpenLoading).toBe(true);
    expect(client.request).toHaveBeenCalledWith({ method: 'projectFiles', params: {} });
  });

  it('stores the fetched root/paths and clears loading once the request resolves', async () => {
    let hook: ReturnType<typeof useQuickOpen> | undefined;
    const { promise, resolve } = withResolvers<{ root: string; paths: string[] }>();
    const client = { send: vi.fn(), request: vi.fn(() => promise) } as unknown as JanusClient;
    render(React.createElement(TestComponent, { client, onHook: (h) => { hook = h; } }));
    act(() => hook!.openQuickOpen());
    await act(async () => { resolve({ root: '/proj', paths: ['a.ts'] }); await promise; });
    expect(hook!.quickOpenLoading).toBe(false);
    act(() => hook!.setQuickOpenQuery('a'));
    expect(hook!.quickOpenResults.map((r) => r.path)).toEqual(['a.ts']);
  });

  it('drops a reply that arrives after the window was closed', async () => {
    let hook: ReturnType<typeof useQuickOpen> | undefined;
    const { promise, resolve } = withResolvers<{ root: string; paths: string[] }>();
    const client = { send: vi.fn(), request: vi.fn(() => promise) } as unknown as JanusClient;
    render(React.createElement(TestComponent, { client, onHook: (h) => { hook = h; } }));
    act(() => hook!.openQuickOpen());
    act(() => hook!.setQuickOpenOpen(false));
    await act(async () => { resolve({ root: '/proj', paths: ['a.ts'] }); await promise; });
    expect(hook!.quickOpenOpen).toBe(false);
    expect(hook!.quickOpenLoading).toBe(true);
  });

  it('caps results at the top 10 best-scoring matches', async () => {
    let hook: ReturnType<typeof useQuickOpen> | undefined;
    const paths = Array.from({ length: 15 }, (_, i) => `dir/file${i}.ts`);
    const client = { send: vi.fn(), request: vi.fn(() => Promise.resolve({ root: '/proj', paths })) } as unknown as JanusClient;
    render(React.createElement(TestComponent, { client, onHook: (h) => { hook = h; } }));
    act(() => hook!.openQuickOpen());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    act(() => hook!.setQuickOpenQuery('file'));
    expect(hook!.quickOpenResults).toHaveLength(10);
  });

  it('pickQuickOpenFile sends an edit command with the absolute path and closes', async () => {
    let hook: ReturnType<typeof useQuickOpen> | undefined;
    const send = vi.fn();
    const client = { send, request: vi.fn(() => Promise.resolve({ root: '/proj', paths: ['a.ts'] })) } as unknown as JanusClient;
    render(React.createElement(TestComponent, { client, onHook: (h) => { hook = h; } }));
    act(() => hook!.openQuickOpen());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    act(() => hook!.pickQuickOpenFile('a.ts'));
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit /proj/a.ts' } });
    expect(hook!.quickOpenOpen).toBe(false);
  });
});
