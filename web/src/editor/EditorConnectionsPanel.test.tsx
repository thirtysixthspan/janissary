import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { EditorConnectionsApi } from './useEditorConnections';
import { EditorConnectionsPanel } from './EditorConnectionsPanel';

const windows: EditorConnectionsApi['windows'] = {
  connections: {
    visible: true, opacity: 1,
    onButtonEnter: vi.fn(), onButtonLeave: vi.fn(), onButtonClick: vi.fn(),
    onWindowEnter: vi.fn(), onWindowLeave: vi.fn(),
  },
  schedule: {
    visible: false, opacity: 0,
    onButtonEnter: vi.fn(), onButtonLeave: vi.fn(), onButtonClick: vi.fn(),
    onWindowEnter: vi.fn(), onWindowLeave: vi.fn(),
  },
};

function api(overrides: Partial<EditorConnectionsApi> = {}): EditorConnectionsApi {
  return {
    windows,
    connectionsButton: { hasContent: true, onClick: vi.fn(), onEnter: vi.fn(), onLeave: vi.fn() },
    closeRow: vi.fn(),
    openAcpTranscript: vi.fn(),
    openRow: vi.fn(),
    ...overrides,
  };
}

function makeTab(connections: TabView['connections']): TabView {
  return {
    label: 'notes', number: 1, dotColor: '#fff', group: 1, groupColor: '#fff', busy: false, hasUnread: false,
    cwd: '/repo', connections, schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [],
    view: 'editor', editor: { name: 'notes.txt', path: '/repo/notes.txt', size: '1 B', url: '/open/1' },
  };
}

describe('EditorConnectionsPanel', () => {
  it('keeps an editor-persona row snapshot-only and its snapshot and close controls separate', () => {
    const onOpenRow = vi.fn();
    const onOpenAcpTranscript = vi.fn();
    const onCloseRow = vi.fn();
    const row = { text: 'reviewer (acp)', kind: 'acp' as const, acpRef: { scope: 'editor' as const, label: 'notes', persona: 'reviewer' } };
    render(<EditorConnectionsPanel tab={makeTab([row])} api={api({ openRow: onOpenRow, openAcpTranscript: onOpenAcpTranscript, closeRow: onCloseRow })} />);

    fireEvent.click(document.querySelector('.panel-row-transcript')!);
    fireEvent.click(document.querySelector('.panel-row-close')!);
    fireEvent.click(document.querySelector('.panel-row')!);

    expect(onOpenAcpTranscript).toHaveBeenCalledWith(row.acpRef);
    expect(onCloseRow).toHaveBeenCalledWith(row, 0);
    expect(onOpenRow).not.toHaveBeenCalled();
  });

  it('opens a record-id row by pointer', () => {
    const onOpenRow = vi.fn();
    const row = { text: 'Agent: task.md', kind: 'acp' as const, recordId: 'record-1' };
    render(<EditorConnectionsPanel tab={makeTab([row])} api={api({ openRow: onOpenRow })} />);

    fireEvent.click(document.querySelector('.panel-row')!);

    expect(onOpenRow).toHaveBeenCalledWith(row);
    expect(document.querySelector('.panel-row-transcript')).toBeNull();
    expect(document.querySelector('.panel-row-close')).toBeNull();
  });

  it('renders a close control only on the persona row, not the record-id agent row', () => {
    const onCloseRow = vi.fn();
    const persona = {
      text: 'reviewer (acp)', kind: 'acp' as const,
      acpRef: { scope: 'editor' as const, label: 'notes', persona: 'reviewer' },
    };
    const agent = { text: 'Agent: task.md', kind: 'acp' as const, recordId: 'record-1' };
    render(<EditorConnectionsPanel tab={makeTab([persona, agent])} api={api({ closeRow: onCloseRow })} />);

    const closes = document.querySelectorAll('.panel-row-close');
    expect(closes).toHaveLength(1);
    fireEvent.click(closes[0]!);
    expect(onCloseRow).toHaveBeenCalledExactlyOnceWith(persona, 0);
  });
});
