import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatSummary } from '@shared/plugins/chat/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ConversationList } from './ConversationList';

function capabilities() {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const value: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) => intent(name, payload) as Promise<Result>,
    splitAction: null,
    active: true,
    dock: null,
    close: vi.fn(),
    reportFailure: vi.fn(),
  };
  return { intent, value };
}

function entry(id: string, title: string, updatedAt: number): ChatSummary {
  return { id, title, updatedAt };
}

describe('ConversationList', () => {
  it('renders rows in the host-provided most-recent-first order with activity times', () => {
    const { value } = capabilities();
    const { container } = render(<ConversationList
      payload={{ kind: 'list', entries: [
        entry('new', 'Newest', Date.UTC(2026, 0, 2)),
        entry('old', 'Older', Date.UTC(2026, 0, 1)),
      ] }}
      capabilities={value}
    />);
    expect([...container.querySelectorAll('.chat-row-title')].map((node) => node.textContent))
      .toEqual(['Newest', 'Older']);
    expect(container.querySelectorAll('time')).toHaveLength(2);
  });

  it('renders the empty state and creates a new conversation', () => {
    const { intent, value } = capabilities();
    render(<ConversationList payload={{ kind: 'list', entries: [] }} capabilities={value} />);
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New conversation/u }));
    expect(intent).toHaveBeenCalledWith('create', {});
  });

  it('deletes only after the confirmation path', () => {
    const { intent, value } = capabilities();
    render(<ConversationList
      payload={{ kind: 'list', entries: [entry('first', 'First chat', 1)] }}
      capabilities={value}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete First chat' }));
    expect(screen.getByText('Delete conversation "First chat"?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(intent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete First chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(intent).toHaveBeenCalledWith('delete', { id: 'first' });
  });
});
