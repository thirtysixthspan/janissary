import React from 'react';
import { readFileSync } from 'node:fs';
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
    type: 'live', id, kind, display, host: 'Local', ownerLabel: 'owner', ownerName, status: 'Open', orderingTimestamp: 1,
  };
}

function record(
  id: string, kind: ConnectionKind | 'agent', status: ConnectionStatus, title = id,
): ConnectionRow {
  return {
    type: 'record', id, kind, title, model: 'model', host: 'Local', ownerLabel: 'owner', ownerName: 'Owner',
    startedAt: 1, updatedAt: 2, status, orderingTimestamp: 2,
  };
}

function shell(ownerLabel: string, display: string): ConnectionRow {
  return {
    type: 'live', id: 'zsh', kind: 'shell', display, host: 'Local', ownerLabel, ownerName: ownerLabel,
    status: 'Open', orderingTimestamp: 2,
  };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ConnectionList', () => {
  it.each(['Closed', 'Completed', 'Failed', 'Terminated'] as const)(
    'separates the %s group in wide and docked lists without adding selectable rows', (status) => {
      const styles = readFileSync('web/src/plugins/connections/connections.css', 'utf8');
      for (const dock of [null, 'left'] as const) {
        const caps = capabilities().value;
        caps.dock = dock;
        const view = render(<><style>{styles}</style><ConnectionList rows={[
          live('open', 'shell', 'shell'), record('first', 'acp', status), record('second', 'acp', 'Closed'),
        ]} capabilities={caps} /></>);
        const rows = view.container.querySelectorAll('.connections-row');
        expect(rows).toHaveLength(3);
        expect(getComputedStyle(rows[1]).marginTop).toBe('24px');
        expect(getComputedStyle(rows[2]).marginTop).not.toBe('24px');
        view.unmount();
      }
    },
  );

  it('adds no leading gap when every connection is closed', () => {
    const styles = readFileSync('web/src/plugins/connections/connections.css', 'utf8');
    const { container } = render(<><style>{styles}</style><ConnectionList
      rows={[record('only', 'acp', 'Closed')]} capabilities={capabilities().value}
    /></>);
    expect(getComputedStyle(container.querySelector('.connections-row')!).marginTop).not.toBe('24px');
  });

  it('shows the exact empty message and no column headings', () => {
    const { container } = render(<ConnectionList rows={[]} capabilities={capabilities().value} />);
    expect(screen.getByText('No connections yet')).toBeInTheDocument();
    expect(container.querySelector('.connections-columns')).toBeNull();
  });

  it('names the columns in the heading row, in table order, with an unlabeled actions column', () => {
    const { container } = render(<ConnectionList rows={[live('db', 'sqlite', 'Database')]} capabilities={capabilities().value} />);
    const heading = container.querySelector('.connections-columns')!;
    expect(heading).toHaveAttribute('aria-hidden', 'true');
    expect([...heading.children].map((node) => node.textContent))
      .toEqual(['Host', 'Tab', 'ID', 'Name', 'State', 'Last activity', '']);
  });

  it('keeps the word "connection" out of the column headings', () => {
    const { container } = render(<ConnectionList rows={[live('db', 'sqlite', 'Database')]} capabilities={capabilities().value} />);
    const heading = container.querySelector('.connections-columns')!;
    expect(heading.textContent).not.toMatch(/connection/i);
  });

  it('renders mixed rows in supplied order with hosts, owners, titles, and statuses', () => {
    const rows = [
      live('db', 'sqlite', 'SQLite database', 'Database owner'),
      { ...record('run', 'agent', 'Completed', 'Agent record'), host: 'build-box' },
      record('session', 'acp', 'Running', 'ACP session'),
      { ...live('editor', 'acp', 'Editor session'), host: 'devbox' },
    ];
    const { container } = render(<ConnectionList rows={rows} capabilities={capabilities().value} />);
    expect([...container.querySelectorAll('.connections-row-host')].map((node) => node.textContent))
      .toEqual(['Local', 'build-box', 'Local', 'devbox']);
    expect([...container.querySelectorAll('.connections-row-title')].map((node) => node.textContent))
      .toEqual(['SQLite database', 'agent:Owner', 'acp:Owner', 'Editor session']);
    expect([...container.querySelectorAll('.connections-row-id')].map((node) => node.textContent))
      .toEqual(['db', 'run', 'session', 'editor']);
    expect([...container.querySelectorAll('.connections-row-owner')].map((node) => node.textContent))
      .toEqual(['Database owner', 'Owner', 'Owner', 'Owner']);
    expect([...container.querySelectorAll('.connections-row-status')].map((node) => node.textContent))
      .toEqual(['Open', 'Completed', 'Running', 'Open']);
  });

  it('lays each row out as host, tab, id, name, state, last activity, then actions', () => {
    const now = Date.now();
    const row = { ...live('db', 'sqlite', 'Database', 'Owner tab'), orderingTimestamp: now - 3 * 60_000 };
    const { container } = render(<ConnectionList rows={[row]} capabilities={capabilities().value} />);
    const cells = [...container.querySelector('.connections-row')!.children];
    expect(cells.map((node) => node.className)).toEqual([
      'connections-row-host', 'connections-row-owner', 'connections-row-id', 'connections-row-title',
      'connections-row-status', 'connections-row-activity', 'connections-row-actions',
    ]);
    expect(cells.slice(0, 6).map((node) => node.textContent)).toEqual(['Local', 'Owner tab', 'db', 'Database', 'Open', '3m ago']);
    expect(cells[5]).toHaveAttribute('dateTime', new Date(row.orderingTimestamp).toISOString());
  });

  it('names a record row by its kind and owning tab, with its record id before the name', () => {
    const id = '0b6f1c2e-8a4d-4f3b-9c1e-2d7a5b9e4f10';
    const row = { ...record(id, 'acp', 'Running', 'ACP: summarize the diff'), ownerName: 'build' };
    const { container } = render(<ConnectionList rows={[row]} capabilities={capabilities().value} />);
    const cells = [...container.querySelector('.connections-row')!.children];
    expect(cells.slice(2, 4).map((node) => node.textContent)).toEqual([id, 'acp:build']);
  });

  it('leaves the last activity empty when the host knows no activity', () => {
    const row = { ...live('db', 'sqlite', 'Database'), orderingTimestamp: 0 };
    const { container } = render(<ConnectionList rows={[row]} capabilities={capabilities().value} />);
    const activity = container.querySelector('.connections-row-activity')!;
    expect(activity.textContent).toBe('');
    expect(activity).not.toHaveAttribute('dateTime');
  });

  it('carries the connection kind in the row tooltip rather than a column', () => {
    const { container } = render(<ConnectionList rows={[record('run', 'agent', 'Completed', 'Agent record')]} capabilities={capabilities().value} />);
    expect(container.querySelector('.connections-row')).toHaveAttribute('title', 'agent:Owner\nAgent record\nagent');
    expect(container.querySelector('.connections-row-kind')).toBeNull();
  });

  it('keeps the record title in the Delete control and its confirmation', () => {
    render(<ConnectionList rows={[record('closed', 'acp', 'Closed', 'ACP: finished session')]} capabilities={capabilities().value} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete ACP: finished session' }));
    expect(screen.getByText('Delete "ACP: finished session"?')).toBeInTheDocument();
  });

  it('renders Close and Delete as icon buttons in the actions column', () => {
    const rows = [live('db', 'sqlite', 'Database'), record('closed', 'acp', 'Closed', 'Finished session')];
    const { container } = render(<ConnectionList rows={rows} capabilities={capabilities().value} />);
    const [first, second] = [...container.querySelectorAll('.connections-row-actions')];
    const close = screen.getByRole('button', { name: 'Close Database' });
    const remove = screen.getByRole('button', { name: 'Delete Finished session' });
    expect(first).toContainElement(close);
    expect(second).toContainElement(remove);
    for (const button of [close, remove]) {
      expect(button.textContent).toBe('');
      expect(button.querySelector('svg')).not.toBeNull();
    }
  });

  it('renders the host-supplied global SQLite owner and sends kind/id only for open and close', () => {
    const { intent, value } = capabilities();
    const { container } = render(<ConnectionList rows={[live('shared', 'sqlite', 'sqlite:shared', 'global')]} capabilities={value} />);
    expect(container.querySelector('.connections-row-title')?.textContent).toBe('sqlite:shared');
    expect(container.querySelector('.connections-row')).toHaveAttribute('title', 'sqlite:shared\nsqlite');
    expect(container.querySelector('.connections-row-owner')?.textContent).toBe('global');

    const row = container.querySelector('.connections-row')!;
    fireEvent.click(row);
    fireEvent.click(row);
    expect(intent).toHaveBeenLastCalledWith('open', { kind: 'sqlite', id: 'shared', ownerLabel: 'owner' });
    fireEvent.click(screen.getByRole('button', { name: 'Close sqlite:shared' }));
    expect(intent).toHaveBeenLastCalledWith('close', { kind: 'sqlite', id: 'shared', ownerLabel: 'owner' });
  });

  it('sends each live shell row owner so two tabs with the same id act on their own row', () => {
    const { intent, value } = capabilities();
    const first: ConnectionRow = {
      type: 'live', id: 'zsh', kind: 'shell', display: 'shell:~/first', host: 'Local', ownerLabel: 'first', ownerName: 'First',
      status: 'Open', orderingTimestamp: 2,
    };
    const second: ConnectionRow = {
      ...first, display: 'shell:~/second', ownerLabel: 'second', ownerName: 'Second',
    };
    const { container } = render(<ConnectionList rows={[first, second]} capabilities={value} />);
    const rows = container.querySelectorAll('.connections-row');

    fireEvent.click(rows[1]!);
    fireEvent.click(rows[1]!);
    expect(intent).toHaveBeenLastCalledWith('open', { kind: 'shell', id: 'zsh', ownerLabel: 'second' });
    expect(intent).not.toHaveBeenCalledWith('open', expect.objectContaining({ ownerLabel: 'first' }));

    fireEvent.click(screen.getByRole('button', { name: 'Close shell:~/second' }));
    expect(intent).toHaveBeenLastCalledWith('close', { kind: 'shell', id: 'zsh', ownerLabel: 'second' });
    expect(intent).not.toHaveBeenCalledWith('close', expect.objectContaining({ ownerLabel: 'first' }));
    expect(intent).toHaveBeenCalledTimes(2);
  });

  it('keeps two same-id shell rows with different owners distinct for rendering and clicks', () => {
    const { intent, value } = capabilities();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = shell('first', 'shell:~/first');
    const second = shell('second', 'shell:~/second');
    const { container } = render(<ConnectionList rows={[first, second]} capabilities={value} />);
    const keyWarning = error.mock.calls.some(([message]) => String(message).includes('same key'));
    expect(keyWarning).toBe(false);

    const rows = container.querySelectorAll('.connections-row');
    fireEvent.click(rows[0]!);
    expect(intent).not.toHaveBeenCalled();
    fireEvent.click(rows[1]!);
    expect(intent).not.toHaveBeenCalled();
    fireEvent.click(rows[1]!);
    expect(intent).toHaveBeenLastCalledWith('open', { kind: 'shell', id: 'zsh', ownerLabel: 'second' });
    expect(intent).not.toHaveBeenCalledWith('open', expect.objectContaining({ ownerLabel: 'first' }));
    error.mockRestore();
  });

  it('does not carry a click confirmation across a same-length reorder of same-id shell rows', () => {
    const { intent, value } = capabilities();
    const first = shell('first', 'shell:~/first');
    const second = shell('second', 'shell:~/second');
    const { container, rerender } = render(<ConnectionList rows={[first, second]} capabilities={value} />);
    fireEvent.click(container.querySelector('.connections-row')!);
    rerender(<ConnectionList rows={[second, first]} capabilities={value} />);
    fireEvent.click(container.querySelector('.connections-row')!);
    expect(intent).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('.connections-row')!);
    expect(intent).toHaveBeenLastCalledWith('open', { kind: 'shell', id: 'zsh', ownerLabel: 'second' });
    expect(intent).not.toHaveBeenCalledWith('open', expect.objectContaining({ ownerLabel: 'first' }));
  });

  it('discards a click confirmation when a same-id shell row is replaced at the same length', () => {
    const { intent, value } = capabilities();
    const first = shell('first', 'shell:~/first');
    const second = shell('second', 'shell:~/second');
    const replacement = shell('replacement', 'shell:~/replacement');
    const { container, rerender } = render(<ConnectionList rows={[first, second]} capabilities={value} />);
    fireEvent.click(container.querySelector('.connections-row')!);
    rerender(<ConnectionList rows={[first, replacement]} capabilities={value} />);
    fireEvent.click(container.querySelectorAll('.connections-row')[1]!);
    expect(intent).not.toHaveBeenCalled();
    fireEvent.click(container.querySelectorAll('.connections-row')[1]!);
    expect(intent).toHaveBeenLastCalledWith('open', { kind: 'shell', id: 'zsh', ownerLabel: 'replacement' });
    expect(intent).not.toHaveBeenCalledWith('open', expect.objectContaining({ ownerLabel: 'first' }));
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
    expect(intent).toHaveBeenCalledWith('open', { kind: 'acp', id: 'run', ownerLabel: 'owner' });
  });

  it('keeps Enter on a focused Close control from opening the row', () => {
    const { intent, value } = capabilities();
    render(<ConnectionList rows={[live('db', 'sqlite', 'Database')]} capabilities={value} />);
    const close = screen.getByRole('button', { name: 'Close Database' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Enter' });
    expect(intent).not.toHaveBeenCalled();
    fireEvent.click(close);
    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('close', { kind: 'sqlite', id: 'db', ownerLabel: 'owner' });
  });

  it('keeps Enter on a focused Delete control from opening the row', () => {
    const { intent, value } = capabilities();
    render(<ConnectionList rows={[record('closed', 'acp', 'Closed', 'Finished session')]} capabilities={value} />);
    const remove = screen.getByRole('button', { name: 'Delete Finished session' });
    remove.focus();
    fireEvent.keyDown(remove, { key: 'Enter' });
    expect(intent).not.toHaveBeenCalled();
    fireEvent.click(remove);
    expect(intent).not.toHaveBeenCalled();
    expect(screen.getByText('Delete "Finished session"?')).toBeInTheDocument();
  });

  it('keeps Enter on the confirmation dialog buttons from opening the row', () => {
    const { intent, value } = capabilities();
    render(<ConnectionList rows={[record('closed', 'acp', 'Closed', 'Finished session')]} capabilities={value} />);
    const remove = screen.getByRole('button', { name: 'Delete Finished session' });
    fireEvent.click(remove);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Enter' });
    expect(screen.queryByText('Delete "Finished session"?')).toBeNull();
    expect(intent).not.toHaveBeenCalled();

    fireEvent.click(remove);
    const confirm = screen.getByRole('button', { name: 'Delete' });
    fireEvent.keyDown(confirm, { key: 'ArrowLeft' });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Enter' });
    expect(screen.queryByText('Delete "Finished session"?')).toBeNull();
    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('delete', { id: 'closed' });
  });

  it('preserves Enter on a focused row', () => {
    const { intent, value } = capabilities();
    const { container } = render(<ConnectionList rows={[live('db', 'sqlite', 'Database')]} capabilities={value} />);
    const row = container.querySelector('.connections-row') as HTMLElement;
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('open', { kind: 'sqlite', id: 'db', ownerLabel: 'owner' });
  });

  it('opens rows only on a second click, including an initially selected or keyboard-selected row', () => {
    const { intent, value } = capabilities();
    const { container } = render(<ConnectionList rows={[live('db', 'sqlite', 'Database'), record('run', 'agent', 'Completed')]} capabilities={value} />);
    const list = container.querySelector('.connections-list') as HTMLElement;
    const rows = container.querySelectorAll('.connections-row');
    fireEvent.click(rows[0]);
    expect(intent).not.toHaveBeenCalled();
    fireEvent.click(rows[0]);
    expect(intent).toHaveBeenLastCalledWith('open', { kind: 'sqlite', id: 'db', ownerLabel: 'owner' });
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
    expect(intent).toHaveBeenCalledWith('close', { kind: 'acp', id: 'monitor', ownerLabel: 'owner' });
  });

  it.each([null, 'left'] as const)('offers no Close on a permanent live row, docked %s', (dock) => {
    const fixture = capabilities();
    fixture.value.dock = dock;
    const system: ConnectionRow = {
      type: 'live', id: 'zsh', kind: 'terminal', display: 'terminal:zsh', host: 'Local', ownerLabel: 'system',
      ownerName: 'system', status: 'Open', orderingTimestamp: 1, permanent: true,
    };
    const rows = [system, live('vim', 'terminal', 'terminal:vim')];
    const { container } = render(<ConnectionList rows={rows} capabilities={fixture.value} />);
    expect(screen.queryByRole('button', { name: 'Close terminal:zsh' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close terminal:vim' })).toBeInTheDocument();
    const permanent = container.querySelector('.connections-row') as HTMLElement;
    expect(permanent.querySelector('.connections-row-actions')?.childElementCount).toBe(0);
    fireEvent.click(permanent);
    fireEvent.click(permanent);
    expect(fixture.intent).toHaveBeenCalledExactlyOnceWith('open', { kind: 'terminal', id: 'zsh', ownerLabel: 'system' });
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
    expect(intent).toHaveBeenCalledWith('delete', { id: 'closed' });
    expect(intent).not.toHaveBeenCalledWith('close', expect.anything());
  });

  it('shows a refused open inline and leaves no unhandled rejection', async () => {
    const { intent, value } = capabilities();
    intent.mockRejectedValueOnce(new Error('invalid open payload'));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { container } = render(<ConnectionList rows={[live('db', 'sqlite', 'Database')]} capabilities={value} />);
      const row = container.querySelector('.connections-row')!;
      fireEvent.click(row);
      fireEvent.click(row);
      expect(await screen.findByRole('alert')).toHaveTextContent('invalid open payload');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('shows a refused close inline and leaves no unhandled rejection', async () => {
    const { intent, value } = capabilities();
    intent.mockRejectedValueOnce(new Error('invalid close payload'));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      render(<ConnectionList rows={[live('db', 'sqlite', 'Database')]} capabilities={value} />);
      fireEvent.click(screen.getByRole('button', { name: 'Close Database' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('invalid close payload');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('shows a refused close on an open ACP record row inline', async () => {
    const { intent, value } = capabilities();
    intent.mockRejectedValueOnce(new Error('The owning tab no longer holds this record.'));
    render(<ConnectionList rows={[record('session', 'acp', 'Running', 'Open session')]} capabilities={value} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close Open session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The owning tab no longer holds this record.');
    expect(intent).toHaveBeenCalledWith('close', { kind: 'acp', id: 'session', ownerLabel: 'owner' });
  });

  it('does not delete when a Close on a since-closed record is refused', async () => {
    const { intent, value } = capabilities();
    intent.mockRejectedValueOnce(new Error('invalid close payload'));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      render(<ConnectionList rows={[record('closing', 'acp', 'Running', 'Closing session')]} capabilities={value} />);
      fireEvent.click(screen.getByRole('button', { name: 'Close Closing session' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('invalid close payload');
      expect(intent).toHaveBeenCalledWith('close', { kind: 'acp', id: 'closing', ownerLabel: 'owner' });
      expect(intent).not.toHaveBeenCalledWith('delete', expect.anything());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('discards a pending delete when its row disappears and sends no intent', () => {
    const { intent, value } = capabilities();
    const closed = record('closed', 'acp', 'Closed', 'Finished session');
    const { rerender } = render(<ConnectionList rows={[closed]} capabilities={value} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Finished session' }));
    expect(screen.getByText('Delete "Finished session"?')).toBeInTheDocument();
    rerender(<ConnectionList rows={[]} capabilities={value} />);
    expect(screen.queryByText('Delete "Finished session"?')).toBeNull();
    expect(intent).not.toHaveBeenCalled();
  });
});

describe('ConnectionList metadata row', () => {
  function withSplit() {
    const fixture = capabilities();
    const split = vi.fn();
    fixture.value.splitAction = <button type="button" aria-label="Split" onClick={split} />;
    return { ...fixture, split };
  }

  it.each([
    ['an empty list', []],
    ['a list with rows', [live('db', 'sqlite', 'Database')]],
  ])('leads %s with Refresh and Split together in the metadata row', (_case, rows: ConnectionRow[]) => {
    const { value } = withSplit();
    const { container } = render(<ConnectionList rows={rows} capabilities={value} />);
    const header = container.querySelector('.connections-list-header')!;
    expect(container.querySelector('.connections-list')?.firstElementChild).toBe(header);
    expect(header).toHaveClass('plugin-meta');
    const actions = header.querySelector('.plugin-actions')!;
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    expect([...actions.children]).toEqual([refresh, screen.getByRole('button', { name: 'Split' })]);
    expect(refresh).toHaveAttribute('title', 'Refresh');
    expect(refresh.textContent).toBe('');
    expect(refresh.querySelector('svg')).not.toBeNull();
  });

  it('sends refresh with an empty payload and neither moves nor opens a row', () => {
    const { intent, value, split } = withSplit();
    const rows = [live('db', 'sqlite', 'Database'), live('web', 'browser', 'Browser')];
    const { container } = render(<ConnectionList rows={rows} capabilities={value} />);
    const list = container.querySelector('.connections-list') as HTMLElement;
    fireEvent.keyDown(list, { key: 'End' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(intent).toHaveBeenCalledExactlyOnceWith('refresh', {});
    expect(container.querySelectorAll('.connections-row')[1]).toHaveClass('selected');
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(split).toHaveBeenCalledOnce();
    expect(intent).toHaveBeenCalledTimes(1);
  });

  it('keeps Enter on a focused Refresh control from opening the selected row', () => {
    const { intent, value } = withSplit();
    render(<ConnectionList rows={[live('db', 'sqlite', 'Database')]} capabilities={value} />);
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    refresh.focus();
    fireEvent.keyDown(refresh, { key: 'Enter' });
    expect(intent).not.toHaveBeenCalled();
  });

  it('shows a refused refresh inline', async () => {
    const { intent, value } = withSplit();
    intent.mockRejectedValueOnce(new Error('refresh applies only to the connections list'));
    render(<ConnectionList rows={[]} capabilities={value} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('refresh applies only to the connections list');
  });
});

describe('ConnectionList rows', () => {
  function docked(side: 'left' | 'right' | null) {
    const fixture = capabilities();
    fixture.value.dock = side;
    return fixture;
  }

  function classes(node: Element): string[] {
    return [...node.children].map((child) => child.className);
  }

  const WIDE_CELLS = [
    'connections-row-host', 'connections-row-owner', 'connections-row-id', 'connections-row-title',
    'connections-row-status', 'connections-row-activity', 'connections-row-actions',
  ];

  it('marks each row with its status for the state styling', () => {
    const rows = [live('db', 'sqlite', 'Database'), record('idle', 'acp', 'Idle'), record('run', 'agent', 'Failed')];
    const { container } = render(<ConnectionList rows={rows} capabilities={capabilities().value} />);
    expect([...container.querySelectorAll('.connections-row')].map((row) => (row as HTMLElement).dataset.status))
      .toEqual(['Open', 'Idle', 'Failed']);
  });

  it('keeps the table and its heading row in the centre', () => {
    const { container } = render(<ConnectionList rows={[live('db', 'sqlite', 'Database')]} capabilities={docked(null).value} />);
    expect(container.querySelector('.connections-list')).not.toHaveClass('connections-list-narrow');
    expect(container.querySelector('.connections-columns')).not.toBeNull();
    expect(classes(container.querySelector('.connections-row')!)).toEqual(WIDE_CELLS);
  });

  it.each(['left', 'right'] as const)('stacks each row onto two lines with no heading row when docked %s', (side) => {
    const now = Date.now();
    const row = { ...live('db', 'sqlite', 'Database', 'Owner tab'), host: 'devbox', orderingTimestamp: now - 3 * 60_000 };
    const { container } = render(<ConnectionList rows={[row]} capabilities={docked(side).value} />);
    expect(container.querySelector('.connections-list')).toHaveClass('connections-list-narrow');
    expect(container.querySelector('.connections-columns')).toBeNull();

    const node = container.querySelector('.connections-row')!;
    expect(classes(node)).toEqual(['connections-row-primary', 'connections-row-secondary']);
    const [primary, secondary] = [...node.children];
    expect(classes(primary)).toEqual(['connections-row-title', 'connections-row-actions']);
    expect(primary.firstElementChild?.textContent).toBe('Database');
    expect(primary).toContainElement(screen.getByRole('button', { name: 'Close Database' }));
    expect(classes(secondary)).toEqual([
      'connections-row-status', 'connections-row-host', 'connections-row-owner', 'connections-row-activity',
    ]);
    expect([...secondary.children].map((child) => child.textContent)).toEqual(['Open', 'devbox', 'Owner tab', '3m ago']);
    expect(node).toHaveAttribute('title', 'Database\nsqlite');
  });

  it('names a docked record row by its kind and owning tab, with no id field', () => {
    const row = record('run', 'agent', 'Running', 'Agent: task.md');
    const { container } = render(<ConnectionList rows={[row]} capabilities={docked('left').value} />);
    const node = container.querySelector('.connections-row')!;
    expect(node.querySelector(':scope .connections-row-primary .connections-row-title')?.textContent).toBe('agent:Owner');
    expect(node.querySelector('.connections-row-id')).toBeNull();
  });

  it('returns to the table when the list comes back to the centre', () => {
    const rows = [live('db', 'sqlite', 'Database')];
    const { container, rerender } = render(<ConnectionList rows={rows} capabilities={docked('left').value} />);
    rerender(<ConnectionList rows={rows} capabilities={docked(null).value} />);
    expect(container.querySelector('.connections-list')).not.toHaveClass('connections-list-narrow');
    expect(container.querySelector('.connections-columns')).not.toBeNull();
    expect(classes(container.querySelector('.connections-row')!)).toEqual(WIDE_CELLS);
  });

  it('keeps the keyboard and click gestures when docked', () => {
    const { intent, value } = docked('right');
    const rows = [live('db', 'sqlite', 'Database'), record('run', 'acp', 'Idle'), record('agent', 'agent', 'Completed')];
    const { container } = render(<ConnectionList rows={rows} capabilities={value} />);
    const list = container.querySelector('.connections-list') as HTMLElement;
    const nodes = container.querySelectorAll('.connections-row');
    expect(list).toHaveFocus();
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(nodes[1]).toHaveClass('selected');
    fireEvent.keyDown(list, { key: 'End' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(nodes[2]).toHaveClass('selected');
    fireEvent.keyDown(list, { key: 'Home' });
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(nodes[0]).toHaveClass('selected');
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(intent).toHaveBeenLastCalledWith('open', { kind: 'sqlite', id: 'db', ownerLabel: 'owner' });

    fireEvent.click(nodes[2]);
    expect(intent).toHaveBeenCalledTimes(1);
    fireEvent.click(nodes[2]);
    expect(intent).toHaveBeenLastCalledWith('open-record', { id: 'agent' });

    const close = screen.getByRole('button', { name: 'Close run' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Enter' });
    expect(intent).toHaveBeenCalledTimes(2);
    fireEvent.click(close);
    expect(intent).toHaveBeenLastCalledWith('close', { kind: 'acp', id: 'run', ownerLabel: 'owner' });
    expect(nodes[2]).toHaveClass('selected');
  });
});
