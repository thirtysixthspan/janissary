import { act, render } from '@testing-library/react';
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

function TestComponent({ tab, onHook, onRecall }: {
  tab: TabView | undefined;
  onHook: (hook: ReturnType<typeof useQueuePicker>) => void;
  onRecall?: (text: string) => void;
}) {
  const client = { send: vi.fn() } as never;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recallRef = useRef(onRecall ?? null);
  const hook = useQueuePicker(client, tab, inputRef, recallRef);
  onHook(hook);
  return null;
}

describe('useQueuePicker', () => {
  it('openQueue opens the popup and selects the front entry for an agent tab', () => {
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    render(<TestComponent tab={makeTab()} onHook={(h) => { hook = h; }} />);
    act(() => hook!.openQueue());
    expect(hook!.queueOpen).toBe(true);
    expect(hook!.queueIndex).toBe(0);
  });

  it('openQueue no-ops for a non-agent tab', () => {
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    const tab = makeTab({ view: 'harness' });
    render(<TestComponent tab={tab} onHook={(h) => { hook = h; }} />);
    act(() => hook!.openQueue());
    expect(hook!.queueOpen).toBe(false);
  });

  it('opens for a command-bar plugin tab without recalling into the hidden agent command bar', () => {
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    const onRecall = vi.fn();
    const tab = makeTab({ view: 'plugin', plugin: { id: 'shell', hostsCommandBar: true } as never });
    render(<TestComponent tab={tab} onHook={(h) => { hook = h; }} onRecall={onRecall} />);

    act(() => hook!.openQueue());

    expect(hook!.queueOpen).toBe(true);
    expect(onRecall).not.toHaveBeenCalled();
  });

  // The declaration decides, not the plugin id: any plugin declaring the bar gets the popup, and the
  // shell id without the declared flag does not.
  it('follows the declared command-bar flag rather than the plugin id', () => {
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    const declared = makeTab({ view: 'plugin', plugin: { id: 'terminal', hostsCommandBar: true } as never });
    const { rerender } = render(<TestComponent tab={declared} onHook={(h) => { hook = h; }} />);
    act(() => hook!.openQueue());
    expect(hook!.queueOpen).toBe(true);
    act(() => hook!.setQueueOpen(false));

    const undeclared = makeTab({ view: 'plugin', plugin: { id: 'shell' } as never });
    rerender(<TestComponent tab={undeclared} onHook={(h) => { hook = h; }} />);
    act(() => hook!.openQueue());
    expect(hook!.queueOpen).toBe(false);
  });

  it('sends editQueuedCommand with the current queueIndex', () => {
    const send = vi.fn();
    const client = { send } as never;
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    function C() {
      const inputRef = useRef<HTMLTextAreaElement>(null);
      const recallRef = useRef<((text: string) => void) | null>(null);
      hook = useQueuePicker(client, makeTab(), inputRef, recallRef);
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
      const recallRef = useRef<((text: string) => void) | null>(null);
      hook = useQueuePicker(client, makeTab(), inputRef, recallRef);
      return null;
    }
    render(<C />);
    hook!.onDeleteQueued();
    expect(send).toHaveBeenCalledWith({ method: 'deleteQueuedCommand', params: { index: 0 } });
  });
});
