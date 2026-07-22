import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { useEditorConnections } from './useEditorConnections';

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'notes', number: 1, dotColor: '#fff', group: 1, groupColor: '#fff', busy: false, hasUnread: false,
    cwd: '/repo', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    view: 'editor', editor: { name: 'notes.txt', path: '/repo/notes.txt', size: '1 B', url: '/open/1' },
    ...overrides,
  };
}

describe('useEditorConnections', () => {
  it('reflects tab.connections.length in the connections button\'s hasContent', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result, rerender } = renderHook(({ tab }) => useEditorConnections(client, tab), {
      initialProps: { tab: makeTab() },
    });
    expect(result.current.connectionsButton.hasContent).toBe(false);

    rerender({ tab: makeTab({ connections: [{ text: 'reviewer (acp)', kind: 'acp' }] }) });
    expect(result.current.connectionsButton.hasContent).toBe(true);
  });

  it('closeRow strips the " (acp)" suffix and sends closeEditorConnection with the tab\'s url', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tab = makeTab();
    const { result } = renderHook(() => useEditorConnections(client, tab));

    result.current.closeRow({ text: 'reviewer (acp)', kind: 'acp' });

    expect(client.send).toHaveBeenCalledWith({
      method: 'closeEditorConnection',
      params: { url: '/open/1', persona: 'reviewer' },
    });
  });
});
