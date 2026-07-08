import { render } from '@testing-library/react';
import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import { useQueuePicker } from './useQueuePicker';

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'janus', number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: ['first', 'second'], toolStepsExpanded: false,
    ...overrides,
  };
}

function TestComponent({ tab, onHook }: { tab: TabView | undefined; onHook: (hook: ReturnType<typeof useQueuePicker>) => void }) {
  const client = { send: vi.fn() } as never;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hook = useQueuePicker(client, tab, inputRef);
  onHook(hook);
  return null;
}

describe('useQueuePicker', () => {
  it('openQueue opens the popup and selects the front entry for an agent tab', () => {
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    const { rerender } = render(<TestComponent tab={makeTab()} onHook={(h) => { hook = h; }} />);
    hook!.openQueue();
    rerender(<TestComponent tab={makeTab()} onHook={(h) => { hook = h; }} />);
    expect(hook!.queueOpen).toBe(true);
    expect(hook!.queueIndex).toBe(0);
  });

  it('openQueue no-ops for a non-agent tab', () => {
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    const tab = makeTab({ view: 'harness' });
    const { rerender } = render(<TestComponent tab={tab} onHook={(h) => { hook = h; }} />);
    hook!.openQueue();
    rerender(<TestComponent tab={tab} onHook={(h) => { hook = h; }} />);
    expect(hook!.queueOpen).toBe(false);
  });

  it('sends editQueuedCommand with the current queueIndex', () => {
    const send = vi.fn();
    const client = { send } as never;
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    function C() {
      const inputRef = useRef<HTMLTextAreaElement>(null);
      hook = useQueuePicker(client, makeTab(), inputRef);
      return null;
    }
    render(<C />);
    hook!.onEditQueued('edited');
    expect(send).toHaveBeenCalledWith({ method: 'editQueuedCommand', params: { index: 0, text: 'edited' } });
  });

  it('sends deleteQueuedCommand with the current queueIndex', () => {
    const send = vi.fn();
    const client = { send } as never;
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    function C() {
      const inputRef = useRef<HTMLTextAreaElement>(null);
      hook = useQueuePicker(client, makeTab(), inputRef);
      return null;
    }
    render(<C />);
    hook!.onDeleteQueued();
    expect(send).toHaveBeenCalledWith({ method: 'deleteQueuedCommand', params: { index: 0 } });
  });
});
