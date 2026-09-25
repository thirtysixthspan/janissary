import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { JanusClient } from '../ws';
import { harnessDropHandle } from '../harness-drop-registry';
import { useHarnessPtyDrop } from './useHarnessPtyDrop';

function fakeClient() {
  const send = vi.fn();
  return { client: { send } as unknown as JanusClient, send };
}

describe('useHarnessPtyDrop', () => {
  it('registers a drop handle under the PTY id while mounted', () => {
    const { client } = fakeClient();
    const { unmount } = renderHook(() => useHarnessPtyDrop('pty-hook', client, vi.fn()));

    expect(harnessDropHandle('pty-hook')).toBeDefined();
    unmount();
  });

  it('focuses the terminal and then types the dropped text into the PTY', () => {
    const { client, send } = fakeClient();
    const calls: string[] = [];
    const focus = vi.fn(() => { calls.push('focus'); });
    send.mockImplementation(() => { calls.push('send'); });
    const { unmount } = renderHook(() => useHarnessPtyDrop('pty-type', client, focus));

    harnessDropHandle('pty-type')!.insertAtCaret('src/index.ts docs/notes.md');

    expect(send).toHaveBeenCalledWith({
      method: 'ptyInput',
      params: { id: 'pty-type', data: 'src/index.ts docs/notes.md' },
    });
    expect(calls).toEqual(['focus', 'send']);
    unmount();
  });

  it('removes the handle on unmount', () => {
    const { client } = fakeClient();
    const { unmount } = renderHook(() => useHarnessPtyDrop('pty-unmount', client, vi.fn()));

    unmount();

    expect(harnessDropHandle('pty-unmount')).toBeUndefined();
  });

  it('registers nothing without a PTY id', () => {
    const { client } = fakeClient();
    const { unmount } = renderHook(() => useHarnessPtyDrop('', client, vi.fn()));

    expect(harnessDropHandle('')).toBeUndefined();
    unmount();
  });

  it('moves the handle when the PTY id changes', () => {
    const { client, send } = fakeClient();
    const { rerender, unmount } = renderHook(({ ptyId }) => useHarnessPtyDrop(ptyId, client, vi.fn()), {
      initialProps: { ptyId: 'pty-old' },
    });

    rerender({ ptyId: 'pty-new' });

    expect(harnessDropHandle('pty-old')).toBeUndefined();
    harnessDropHandle('pty-new')!.insertAtCaret('a.txt');
    expect(send).toHaveBeenCalledWith({ method: 'ptyInput', params: { id: 'pty-new', data: 'a.txt' } });
    unmount();
  });
});
