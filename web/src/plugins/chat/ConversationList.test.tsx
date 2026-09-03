import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

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

  it('focuses the active list and highlights its first conversation', () => {
    const { value } = capabilities();
    const { container } = render(<ConversationList
      payload={{ kind: 'list', entries: [
        entry('first', 'First chat', 2),
        entry('second', 'Second chat', 1),
      ] }}
      capabilities={value}
    />);
    expect(container.querySelector('.chat-list')).toHaveFocus();
    expect(container.querySelector('.chat-row')).toHaveClass('selected');
  });

  it('moves the highlight with arrow keys and opens the current conversation with Enter', () => {
    const { intent, value } = capabilities();
    const { container } = render(<ConversationList
      payload={{ kind: 'list', entries: [
        entry('first', 'First chat', 2),
        entry('second', 'Second chat', 1),
      ] }}
      capabilities={value}
    />);
    const list = container.querySelector('.chat-list') as HTMLElement;
    const rows = container.querySelectorAll('.chat-row');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(rows[1]).toHaveClass('selected');
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(rows[0]).toHaveClass('selected');
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(rows[0]).toHaveClass('selected');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('open', { id: 'second' });
  });

  it('selects a conversation with one click and opens it with the second', () => {
    const { intent, value } = capabilities();
    const { container } = render(<ConversationList
      payload={{ kind: 'list', entries: [
        entry('first', 'First chat', 2),
        entry('second', 'Second chat', 1),
      ] }}
      capabilities={value}
    />);
    const rows = container.querySelectorAll('.chat-row');
    fireEvent.click(rows[1]);
    expect(rows[1]).toHaveClass('selected');
    expect(intent).not.toHaveBeenCalled();
    fireEvent.click(rows[1]);
    expect(intent).toHaveBeenCalledWith('open', { id: 'second' });
  });

  it('still takes a second click on the row that is current when the list opens', () => {
    const { intent, value } = capabilities();
    const { container } = render(<ConversationList
      payload={{ kind: 'list', entries: [
        entry('first', 'First chat', 2),
        entry('second', 'Second chat', 1),
      ] }}
      capabilities={value}
    />);
    const rows = container.querySelectorAll('.chat-row');
    expect(rows[0]).toHaveClass('selected');
    fireEvent.click(rows[0]);
    expect(intent).not.toHaveBeenCalled();
    fireEvent.click(rows[0]);
    expect(intent).toHaveBeenCalledWith('open', { id: 'first' });
  });

  it('takes a second click on a row the arrow keys made current', () => {
    const { intent, value } = capabilities();
    const { container } = render(<ConversationList
      payload={{ kind: 'list', entries: [
        entry('first', 'First chat', 2),
        entry('second', 'Second chat', 1),
      ] }}
      capabilities={value}
    />);
    const list = container.querySelector('.chat-list') as HTMLElement;
    const rows = container.querySelectorAll('.chat-row');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.click(rows[1]);
    expect(intent).not.toHaveBeenCalled();
    fireEvent.click(rows[1]);
    expect(intent).toHaveBeenCalledWith('open', { id: 'second' });
  });

  it('opens nothing when consecutive clicks land on different rows', () => {
    const { intent, value } = capabilities();
    const { container } = render(<ConversationList
      payload={{ kind: 'list', entries: [
        entry('first', 'First chat', 2),
        entry('second', 'Second chat', 1),
      ] }}
      capabilities={value}
    />);
    const rows = container.querySelectorAll('.chat-row');
    fireEvent.click(rows[0]);
    fireEvent.click(rows[1]);
    expect(rows[1]).toHaveClass('selected');
    expect(intent).not.toHaveBeenCalled();
  });

  it('shows the new-conversation icon before Split without a redundant heading', () => {
    const { value } = capabilities();
    value.splitAction = <button type="button">Split</button>;
    const { container } = render(<ConversationList
      payload={{ kind: 'list', entries: [] }}
      capabilities={value}
    />);
    const actions = container.querySelector(':scope .chat-list-header .plugin-actions') as HTMLElement;
    const [create, split] = within(actions).getAllByRole('button');
    expect(screen.queryByText('Conversations')).toBeNull();
    expect(create).toHaveAttribute('title', 'New conversation');
    expect(create).toHaveTextContent('');
    expect(split).toHaveTextContent('Split');
  });

  it('renders the empty state and creates a new conversation', () => {
    const { intent, value } = capabilities();
    render(<ConversationList payload={{ kind: 'list', entries: [] }} capabilities={value} />);
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New conversation/u }));
    expect(intent).toHaveBeenCalledWith('create', {});
  });

  it('creates a new conversation with Cmd+N and prevents the browser default', () => {
    const { intent, value } = capabilities();
    const { container } = render(
      <ConversationList payload={{ kind: 'list', entries: [] }} capabilities={value} />,
    );
    const handled = fireEvent.keyDown(container.querySelector('.chat-list') as HTMLElement, {
      key: 'n', metaKey: true,
    });
    expect(handled).toBe(false);
    expect(intent).toHaveBeenCalledWith('create', {});
  });

  it('creates a new conversation with Ctrl+N and prevents the browser default', () => {
    const { intent, value } = capabilities();
    const { container } = render(
      <ConversationList payload={{ kind: 'list', entries: [] }} capabilities={value} />,
    );
    const handled = fireEvent.keyDown(container.querySelector('.chat-list') as HTMLElement, {
      key: 'n', ctrlKey: true,
    });
    expect(handled).toBe(false);
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
