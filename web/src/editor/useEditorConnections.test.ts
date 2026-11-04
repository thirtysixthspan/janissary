import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../shared/ws/ws';
import type { StatusWindowButtonProps } from '../shared/status-windows/status-button';
import { useEditorConnections } from './useEditorConnections';

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'notes', number: 1, dotColor: '#fff', group: 1, groupColor: '#fff', busy: false, hasUnread: false,
    cwd: '/repo', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [],
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

  it('builds a connections button matching the shared StatusWindowButtonProps contract', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useEditorConnections(client, makeTab()));

    const button: StatusWindowButtonProps = result.current.connectionsButton;

    expect(Object.keys(button).toSorted((a, b) => a.localeCompare(b))).toEqual(['hasContent', 'onClick', 'onEnter', 'onLeave']);
    expect(typeof button.onEnter).toBe('function');
    expect(typeof button.onLeave).toBe('function');
    expect(typeof button.onClick).toBe('function');
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

  // There is no connection to close without the editor payload that names the file, so a tab missing
  // it is left alone rather than dereferenced — the row simply does nothing.
  it('closeRow does nothing for a tab carrying no editor payload', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { editor, ...withoutEditor } = makeTab();
    expect(editor).toBeDefined();
    const { result } = renderHook(() => useEditorConnections(client, withoutEditor as TabView));

    result.current.closeRow({ text: 'reviewer (acp)', kind: 'acp' });

    expect(client.send).not.toHaveBeenCalled();
  });

  it('closeRow sends a persona with no acp suffix unchanged', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useEditorConnections(client, makeTab()));

    result.current.closeRow({ text: 'reviewer', kind: 'shell' });

    expect(client.send).toHaveBeenCalledWith({
      method: 'closeEditorConnection',
      params: { url: '/open/1', persona: 'reviewer' },
    });
  });

  it('openAcpTranscript addresses the agent connection by its own reference', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useEditorConnections(client, makeTab()));

    result.current.openAcpTranscript({ scope: 'editor', label: 'notes', persona: 'reviewer' });

    expect(client.send).toHaveBeenCalledWith({
      method: 'openAcpTranscript',
      params: { acpRef: { scope: 'editor', label: 'notes', persona: 'reviewer' } },
    });
  });

  it('openRow sends a durable record id and this tab\'s own tab-scoped ACP reference', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useEditorConnections(client, makeTab()));

    result.current.openRow({ text: 'Agent: task.md', kind: 'acp', recordId: 'record-1' });
    result.current.openRow({ text: 'acp:opencode', kind: 'acp', acpRef: { scope: 'tab', label: 'notes' } });

    expect(client.send).toHaveBeenNthCalledWith(1, {
      method: 'openConnectionRecord', params: { tab: 'notes', recordId: 'record-1' },
    });
    expect(client.send).toHaveBeenNthCalledWith(2, {
      method: 'openConnectionRecord', params: { tab: 'notes', acpRef: { scope: 'tab', label: 'notes' } },
    });
  });

  it.each([
    ['monitor', { scope: 'monitor' as const, name: 'watch' }],
    ['editor', { scope: 'editor' as const, label: 'notes', persona: 'reviewer' }],
    ['another tab', { scope: 'tab' as const, label: 'other' }],
  ])('openRow leaves a %s reference snapshot-only', (_case, acpRef) => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useEditorConnections(client, makeTab()));

    result.current.openRow({ text: 'row', kind: 'acp', acpRef });

    expect(client.send).not.toHaveBeenCalled();
  });
});
