import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionRow, ConnectionStatus, ConnectionKind } from '@shared/plugins/connections/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ConnectionList } from './ConnectionList';

function capabilities() {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const value: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) => intent(name, payload) as Promise<Result>,
    copyText: vi.fn(), splitAction: null, active: true, dock: null, close: vi.fn(), reportFailure: vi.fn(),
  };
  return { intent, value };
}

function live(id: string, kind: ConnectionKind, display: string, ownerName = 'Owner'): ConnectionRow {
  return {
    type: 'live', id, kind, display, ownerLabel: 'owner', ownerName, status: 'Open', orderingTimestamp: 1,
  };
}

function record(
  id: string, kind: ConnectionKind | 'agent', status: ConnectionStatus, title = id,
): ConnectionRow {
  return {
    type: 'record', id, kind, title, model: 'model', ownerLabel: 'owner', ownerName: 'Owner',
    startedAt: 1, updatedAt: 2, status, orderingTimestamp: 2,
  };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ConnectionList', () => {
  it('shows the exact empty message', () => {
    render(<ConnectionList rows={[]} capabilities={capabilities().value} />);
    expect(screen.getByText('No connections yet')).toBeInTheDocument();
  });

  it('renders mixed rows in supplied order with host titles, kinds, owners, and statuses', () => {
    const rows = [
      live('db', 'sqlite', 'SQLite database', 'Database owner'),
      record('run', 'agent', 'Completed', 'Agent record'),
      record('session', 'acp', 'Running', 'ACP session'),
      live('editor', 'acp', 'Editor session'),
    ];
    const { container } = render(<ConnectionList rows={rows} capabilities={capabilities().value} />);
    expect([...container.querySelectorAll('.connections-row-title')].map((node) => node.textContent))
      .toEqual(['SQLite database', 'Agent record', 'ACP session', 'Editor session']);
    expect([...container.querySelectorAll('.connections-row-kind')].map((node) => node.textContent))
      .toEqual(['sqlite', 'agent', 'acp', 'acp']);
    expect([...container.querySelectorAll('.connections-row-owner')].map((node) => node.textContent))
      .toEqual(['Database owner', 'Owner', 'Owner', 'Owner']);
    expect([...container.querySelectorAll('.connections-row-status')].map((node) => node.textContent))
      .toEqual(['Open', 'Completed', 'Running', 'Open']);
  });

  it('focuses the active list and supports bounded keyboard selection and Enter', () => {
    const { intent, value } = capabilities();
    const { container } = render(<ConnectionList rows={[live('db', 'sqlite', 'Database'), record('run', 'acp', 'Idle')]} capabilities={value} />);
    const list = container.querySelector('.connections-list') as HTMLElement;
    const rows = container.querySelectorAll('.connections-row');
    expect(list).toHaveFocus();
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(rows[1]).toHaveClass('selected');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(rows[1]).toHaveClass('selected');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(rows[0]).toHaveClass('selected');
    fireEvent.keyDown(list, { key: 'End' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('open', { kind: 'acp', id: 'run' });
  });

  it('opens rows only on a second click, including an initially selected or keyboard-selected row', () => {
    const { intent, value } = capabilities();
    const { container } = render(<ConnectionList rows={[live('db', 'sqlite', 'Database'), record('run', 'agent', 'Completed')]} capabilities={value} />);
    const list = container.querySelector('.connections-list') as HTMLElement;
    const rows = container.querySelectorAll('.connections-row');
    fireEvent.click(rows[0]);
    expect(intent).not.toHaveBeenCalled();
    fireEvent.click(rows[0]);
    expect(intent).toHaveBeenLastCalledWith('open', { kind: 'sqlite', id: 'db' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.click(rows[1]);
    expect(intent).toHaveBeenCalledTimes(1);
    fireEvent.click(rows[1]);
    expect(intent).toHaveBeenLastCalledWith('open-record', { id: 'run' });
  });

  it('does not carry a click confirmation across a same-length row reorder', () => {
    const { intent, value } = capabilities();
    const initial = [record('first', 'acp', 'Closed'), record('second', 'agent', 'Completed')];
    const { container, rerender } = render(<ConnectionList rows={initial} capabilities={value} />);
    fireEvent.click(container.querySelector('.connections-row')!);
    rerender(<ConnectionList rows={[initial[1], initial[0]]} capabilities={value} />);
    fireEvent.click(container.querySelector('.connections-row')!);
    expect(intent).not.toHaveBeenCalled();
  });

  it('offers live and tracked ACP close controls, and only closed ACP delete controls', () => {
    const rows = [
      live('monitor', 'acp', 'Monitor'),
      record('running', 'acp', 'Running'),
      record('idle', 'acp', 'Idle'),
      record('closed', 'acp', 'Closed', 'Closed ACP'),
      record('agent', 'agent', 'Completed'),
      record('other', 'shell', 'Running'),
    ];
    const { intent, value } = capabilities();
    render(<ConnectionList rows={rows} capabilities={value} />);
    expect(screen.getByRole('button', { name: 'Close Monitor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close running' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close idle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Closed ACP' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close Closed ACP' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete running' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close agent' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete agent' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close other' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close Monitor' }));
    expect(intent).toHaveBeenCalledWith('close', { kind: 'acp', id: 'monitor' });
  });

  it('stops row clicks for actions and confirms closed-record deletion with the exact wording', () => {
    const { intent, value } = capabilities();
    render(<ConnectionList rows={[record('closed', 'acp', 'Closed', 'Finished session')]} capabilities={value} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Finished session' }));
    expect(intent).not.toHaveBeenCalled();
    expect(screen.getByText('Delete "Finished session"?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(intent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Finished session' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('close', { kind: 'acp', id: 'closed' });
  });
});
