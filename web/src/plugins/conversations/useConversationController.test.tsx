import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationTabPayload } from '@shared/plugins/conversations/shared';
import type { TabPluginClientCapabilities } from '../api';
import { useConversationController } from './useConversationController';

function setup(active: boolean, streaming: boolean, hasOlder = true) {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const capabilities = {
    intent: async <Result,>(name: string, payload: unknown) => intent(name, payload) as Promise<Result>,
    active,
  } as TabPluginClientCapabilities;
  const payload: ConversationTabPayload = {
    kind: 'conversation',
    conversation: {
      id: 'conversation', title: 'Conversation', pair: { harness: 'claude', model: 'model' },
      turns: streaming ? [{ query: 'question', response: '', streaming: true, pair: { harness: 'claude', model: 'model' } }] : [],
      hasOlder,
    },
    models: [],
  };
  return { intent, capabilities, payload };
}

describe('useConversationController', () => {
  it('only cancels Escape for an active streaming conversation', () => {
    const inactive = setup(false, true);
    const hidden = renderHook(() => useConversationController(inactive.payload, inactive.capabilities));
    act(() => { globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(inactive.intent).not.toHaveBeenCalled();
    hidden.unmount();

    const active = setup(true, true);
    const visible = renderHook(() => useConversationController(active.payload, active.capabilities));
    act(() => { globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(active.intent).toHaveBeenCalledWith('cancel', {});
    visible.unmount();
  });

  it('removes the Escape listener when the tab becomes inactive and when unmounted', () => {
    const current = setup(true, true);
    const { result, rerender, unmount } = renderHook(
      ({ payload, capabilities }) => useConversationController(payload, capabilities),
      { initialProps: { payload: current.payload, capabilities: current.capabilities } },
    );
    rerender({ payload: current.payload, capabilities: { ...current.capabilities, active: false } });
    act(() => { globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(current.intent).not.toHaveBeenCalled();

    rerender({ payload: current.payload, capabilities: current.capabilities });
    unmount();
    act(() => { globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(current.intent).not.toHaveBeenCalled();
    expect(result.current).toHaveProperty('cancel');
  });

  it('checks the latest hasOlder value before requesting another page', () => {
    const current = setup(true, false);
    const { result, rerender } = renderHook(
      ({ payload, capabilities }) => useConversationController(payload, capabilities),
      { initialProps: { payload: current.payload, capabilities: current.capabilities } },
    );
    act(() => { result.current.loadOlder(); });
    expect(current.intent).toHaveBeenCalledWith('load-older', {});

    current.intent.mockClear();
    rerender({
      payload: { ...current.payload, conversation: { ...current.payload.conversation, hasOlder: false } },
      capabilities: current.capabilities,
    });
    act(() => { result.current.loadOlder(); });
    expect(current.intent).not.toHaveBeenCalled();
  });
});
