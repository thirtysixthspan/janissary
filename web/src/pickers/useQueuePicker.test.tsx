import { act, render } from '@testing-library/react';
import React from 'react';
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

function TestComponent({ tab, onHook }: {
  tab: TabView | undefined;
  onHook: (hook: ReturnType<typeof useQueuePicker>) => void;
}) {
  const client = { send: vi.fn() } as never;
  const hook = useQueuePicker(client, tab);
  onHook(hook);
  return null;
}

describe('useQueuePicker', () => {

  it('openQueue no-ops for a non-tab', () => {
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    const tab = makeTab({ view: 'harness' });
    render(<TestComponent tab={tab} onHook={(h) => { hook = h; }} />);
    act(() => hook!.openQueue());
    expect(hook!.queueOpen).toBe(false);
  });

  it('opens for an opted-in command-bar plugin tab', () => {
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    const tab = makeTab({ view: 'plugin', hasCommandQueue: true, plugin: { id: 'shell', hostsCommandBar: true } as never });
    render(<TestComponent tab={tab} onHook={(h) => { hook = h; }} />);

    act(() => hook!.openQueue());

    expect(hook!.queueOpen).toBe(true);
  });

  // The declaration decides, not the plugin id: any plugin declaring the bar gets the popup, and the
  // shell id without the declared flag does not.
  it('follows the declared command-bar flag rather than the plugin id', () => {
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    const declared = makeTab({ view: 'plugin', hasCommandQueue: true, plugin: { id: 'terminal', hostsCommandBar: true } as never });
    const { rerender } = render(<TestComponent tab={declared} onHook={(h) => { hook = h; }} />);
    act(() => hook!.openQueue());
    expect(hook!.queueOpen).toBe(true);
    act(() => hook!.setQueueOpen(false));

    const undeclared = makeTab({ view: 'plugin', hasCommandQueue: true, plugin: { id: 'shell' } as never });
    rerender(<TestComponent tab={undeclared} onHook={(h) => { hook = h; }} />);
    act(() => hook!.openQueue());
    expect(hook!.queueOpen).toBe(false);
  });

  it('sends editQueuedCommand with the current queueIndex', () => {
    const send = vi.fn();
    const client = { send } as never;
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    function C() {
      hook = useQueuePicker(client, makeTab());
      return null;
    }
    render(<C />);
    hook!.onEditQueued('edited');
    expect(send).toHaveBeenCalledWith({ method: 'editQueuedCommand', params: { index: 0, text: 'edited', tab: 'janus' } });
  });

  it('sends deleteQueuedCommand with the current queueIndex', () => {
    const send = vi.fn();
    const client = { send } as never;
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    function C() {
      hook = useQueuePicker(client, makeTab());
      return null;
    }
    render(<C />);
    hook!.onDeleteQueued();
    expect(send).toHaveBeenCalledWith({ method: 'deleteQueuedCommand', params: { index: 0, tab: 'janus' } });
  });
});

describe('useQueuePicker raised from a shell while an agent is current', () => {
  const shell = makeTab({
    label: 'shell1', view: 'plugin', hasCommandQueue: true, dock: 'left', commandQueue: ['make test'],
    plugin: { id: 'shell', hostsCommandBar: true } as never,
  });

  function SourceComponent({ tab, onHook }: {
    tab: TabView;
    onHook: (hook: ReturnType<typeof useQueuePicker>) => void;
  }) {
    const client = { send: vi.fn() } as never;
    onHook(useQueuePicker(client, tab, [makeTab(), shell]));
    return null;
  }

  // The opener runs before the app records the shell as the source, so the popup's tab is still the
  // agent; the opener's own argument is what keeps the agent's queued line out of the agent bar.
  it('opens for a shell source while an agent is current', () => {
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    render(<SourceComponent tab={makeTab()} onHook={(h) => { hook = h; }} />);

    act(() => hook!.openQueue('shell1'));

    expect(hook!.queueOpen).toBe(true);
  });

  it('does not open for a source tab that is not open', () => {
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    render(<SourceComponent tab={makeTab()} onHook={(h) => { hook = h; }} />);

    act(() => hook!.openQueue('gone'));

    expect(hook!.queueOpen).toBe(false);
  });

  it('closes the shell source popup', () => {
    let hook: ReturnType<typeof useQueuePicker> | undefined;
    render(<SourceComponent tab={shell} onHook={(h) => { hook = h; }} />);

    act(() => hook!.openQueue('shell1'));
    act(() => hook!.setQueueOpen(false));

    expect(hook!.queueOpen).toBe(false);
  });
});
