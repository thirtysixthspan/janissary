import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostRow } from '@shared/plugins/hosts/shared';
import type { TabPluginClientCapabilities } from '../api';
import { HostList } from './HostList';

const FILE = '/home/me/.janissary/hosts.json';

function withResolvers<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  const state = { resolve: undefined as unknown as (value: T) => void };
  const promise = new Promise<T>((resolve) => { state.resolve = resolve; });
  return { promise, resolve: state.resolve };
}

function capabilities(handler?: (name: string, payload: unknown) => Promise<unknown>) {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(
    handler ?? (async () => null),
  );
  const value: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) => intent(name, payload) as Promise<Result>,
    copyText: vi.fn(),
    splitAction: null,
    active: true,
    dock: null,
    close: vi.fn(),
    reportFailure: vi.fn(),
  };
  return { intent, value };
}

function row(overrides: Partial<HostRow> = {}): HostRow {
  return {
    name: 'lab', user: 'admin', destination: 'devbox:2222', path: '/srv/ws',
    ...overrides,
  };
}

function list(rows: HostRow[], value = capabilities().value) {
  return render(<HostList payload={{ filePath: FILE, rows }} capabilities={value} />);
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('HostList rendering', () => {
  it('renders the supplied rows in the order they arrived', () => {
    const { container } = list([row({ name: 'alpha' }), row({ name: 'zeta' })]);
    expect([...container.querySelectorAll('.host-row-name')].map((node) => node.textContent))
      .toEqual(['alpha', 'zeta']);
  });

  it('names the four columns above the rows and leaves the actions column unlabeled', () => {
    const { container } = list([row()]);
    const columns = container.querySelector('.host-columns');
    expect(columns).not.toBeNull();
    expect([...columns!.querySelectorAll('span')].map((node) => node.textContent))
      .toEqual(['Name', 'User', 'Destination', 'Path', '']);
  });

  it('renders each field in its own cell and shows the destination as host[:port]', () => {
    const { container } = list([
      row({ name: 'lab', user: 'admin', destination: 'devbox:2222', path: '/srv/ws' }),
    ]);
    expect(container.querySelector('.host-row-name')).toHaveTextContent('lab');
    expect(container.querySelector('.host-row-user')).toHaveTextContent('admin');
    expect(container.querySelector('.host-row-destination')).toHaveTextContent('devbox:2222');
    expect(container.querySelector('.host-row-path')).toHaveTextContent('/srv/ws');
  });

  it('leaves the user and path cells empty when the row has neither', () => {
    const { container } = list([row({ user: '', path: '' })]);
    expect(container.querySelector('.host-row-user')).toBeEmptyDOMElement();
    expect(container.querySelector('.host-row-path')).toBeEmptyDOMElement();
  });

  it('carries the full target and the path in the row tooltip', () => {
    const { container } = list([row({ user: 'admin', destination: 'devbox:2222', path: '/srv/ws' })]);
    expect(container.querySelector('.host-row')).toHaveAttribute(
      'title', 'admin@devbox:2222\n/srv/ws',
    );
  });

  it('shows only the destination when the row has no user or path', () => {
    const { container } = list([row({ user: '', destination: 'devbox', path: '' })]);
    expect(container.querySelector('.host-row')).toHaveAttribute('title', 'devbox');
  });

  it('reports an empty list without headings but keeps the metadata actions available', () => {
    const fixture = capabilities();
    const { container } = list([], fixture.value);
    expect(screen.getByText('No saved hosts')).toBeInTheDocument();
    expect(container.querySelector('.host-columns')).toBeNull();
    expect(screen.getByLabelText('Refresh')).toBeInTheDocument();
  });

  it('focuses the active list and highlights its first row on mount', () => {
    const { container } = list([row({ name: 'a' }), row({ name: 'b' })]);
    expect(container.querySelector('.host-list')).toHaveFocus();
    expect(container.querySelector('.host-row')).toHaveClass('selected');
  });

  it('holds refresh and split together in the metadata header', () => {
    const fixture = capabilities();
    fixture.value.splitAction = <button aria-label="Split">Split</button>;
    const { container } = list([row()], fixture.value);
    const header = container.querySelector('.host-list-header')!;
    const actions = header.querySelector('.plugin-actions')!;
    expect(header.children).toHaveLength(1);
    expect([...actions.children]).toEqual([
      screen.getByLabelText('Refresh'), screen.getByLabelText('New host'), screen.getByLabelText('Split'),
    ]);
  });
});

describe('HostList intents', () => {
  it('refreshes from the header without touching a row', () => {
    const fixture = capabilities();
    list([row()], fixture.value);
    fireEvent.click(screen.getByLabelText('Refresh'));
    expect(fixture.intent).toHaveBeenCalledExactlyOnceWith('refresh', {});
  });

  it('opens the current row only on a second click of it', () => {
    const fixture = capabilities();
    const { container } = list([row({ name: 'a' }), row({ name: 'b' })], fixture.value);
    const second = container.querySelectorAll('.host-row')[1];
    fireEvent.click(second);
    expect(fixture.intent).not.toHaveBeenCalled();
    fireEvent.click(second);
    expect(fixture.intent).toHaveBeenCalledExactlyOnceWith('open', { name: 'b' });
  });

  it('opens the highlighted row on Enter while the list is focused', () => {
    const fixture = capabilities();
    const { container } = list([row({ name: 'a' }), row({ name: 'b' })], fixture.value);
    const node = container.querySelector('.host-list')!;
    fireEvent.keyDown(node, { key: 'ArrowDown' });
    fireEvent.keyDown(node, { key: 'Enter' });
    expect(fixture.intent).toHaveBeenCalledExactlyOnceWith('open', { name: 'b' });
  });

  it('stops at either end and jumps to the ends on Home and End', () => {
    const fixture = capabilities();
    const { container } = list([row({ name: 'a' }), row({ name: 'b' })], fixture.value);
    const node = container.querySelector('.host-list')!;
    const rows = container.querySelectorAll('.host-row');
    fireEvent.keyDown(node, { key: 'ArrowUp' });
    expect(rows[0]).toHaveClass('selected');
    fireEvent.keyDown(node, { key: 'End' });
    expect(rows[1]).toHaveClass('selected');
    fireEvent.keyDown(node, { key: 'ArrowDown' });
    expect(rows[1]).toHaveClass('selected');
    fireEvent.keyDown(node, { key: 'Home' });
    expect(rows[0]).toHaveClass('selected');
    expect(fixture.intent).not.toHaveBeenCalled();
  });

  it('leaves the list alone on Escape', () => {
    const fixture = capabilities();
    const { container } = list([row(), row({ name: 'b' })], fixture.value);
    const node = container.querySelector('.host-list')!;
    fireEvent.keyDown(node, { key: 'ArrowDown' });
    fireEvent.keyDown(node, { key: 'Escape' });
    expect(container.querySelectorAll('.host-row')[1]).toHaveClass('selected');
    expect(fixture.intent).not.toHaveBeenCalled();
  });

  it('leaves keys on a focused control to that control', () => {
    const fixture = capabilities();
    const { container } = list([row(), row({ name: 'b' })], fixture.value);
    const refresh = screen.getByLabelText('Refresh');
    refresh.focus();
    fireEvent.keyDown(refresh, { key: 'Enter' });
    fireEvent.keyDown(refresh, { key: 'ArrowDown' });
    expect(container.querySelector('.host-row')).toHaveClass('selected');
    expect(fixture.intent).not.toHaveBeenCalled();
  });

  it('needs a first click even on a row highlighted by keyboard navigation', () => {
    const fixture = capabilities();
    const { container } = list([row({ name: 'a' }), row({ name: 'b' })], fixture.value);
    const node = container.querySelector('.host-list')!;
    const second = container.querySelectorAll('.host-row')[1];
    fireEvent.keyDown(node, { key: 'ArrowDown' });
    fireEvent.click(second);
    expect(fixture.intent).not.toHaveBeenCalled();
    fireEvent.click(second);
    expect(fixture.intent).toHaveBeenCalledExactlyOnceWith('open', { name: 'b' });
  });

  it('requires a fresh click when the selected row is replaced at the same index', () => {
    const fixture = capabilities();
    const rows = [row({ name: 'a' }), row({ name: 'lab' })];
    const { container, rerender } = list(rows, fixture.value);
    const selected = container.querySelectorAll('.host-row')[1];
    fireEvent.click(selected);
    fireEvent.click(selected);
    expect(fixture.intent).toHaveBeenCalledExactlyOnceWith('open', { name: 'lab' });
    fixture.intent.mockClear();

    const replacement = [row({ name: 'a' }), row({
      name: 'lab', user: 'root', destination: 'other:22', path: '/opt',
    })];
    rerender(<HostList payload={{ filePath: FILE, rows: replacement }} capabilities={fixture.value} />);
    const replacementRow = container.querySelectorAll('.host-row')[1];
    fireEvent.click(replacementRow);
    expect(fixture.intent).not.toHaveBeenCalled();
    fireEvent.click(replacementRow);
    expect(fixture.intent).toHaveBeenCalledExactlyOnceWith('open', { name: 'lab' });
  });
});

describe('HostList refresh on focus', () => {
  it('focuses on active mount without an extra read', () => {
    const fixture = capabilities();
    const { container } = list([row()], fixture.value);
    expect(container.querySelector('.host-list')).toHaveFocus();
    expect(fixture.intent).not.toHaveBeenCalled();
  });

  it('sends one refresh on every return to the tab', () => {
    const fixture = capabilities();
    const rows = [row()];
    const { rerender } = list(rows, fixture.value);
    expect(fixture.intent).not.toHaveBeenCalled();

    rerender(<HostList payload={{ filePath: FILE, rows }} capabilities={{ ...fixture.value, active: false }} />);
    rerender(<HostList payload={{ filePath: FILE, rows }} capabilities={fixture.value} />);
    expect(fixture.intent).toHaveBeenCalledExactlyOnceWith('refresh', {});

    rerender(<HostList payload={{ filePath: FILE, rows }} capabilities={{ ...fixture.value, active: false }} />);
    rerender(<HostList payload={{ filePath: FILE, rows }} capabilities={fixture.value} />);
    expect(fixture.intent).toHaveBeenCalledTimes(2);
    expect(fixture.intent).toHaveBeenLastCalledWith('refresh', {});
  });
});

describe('HostList creation controls', () => {
  it.each([
    ['Cmd+N', { metaKey: true }],
    ['Ctrl+N', { ctrlKey: true }],
  ])('opens a new host form on %s while the list has focus', (_name, modifier) => {
    const { container } = list([row()]);
    fireEvent.keyDown(container.querySelector('.host-list')!, { key: 'n', ...modifier });
    expect(screen.getByRole('alertdialog')).toHaveTextContent('New host');
  });

  it('leaves the chord alone when shift or alt is held', () => {
    const { container } = list([row()]);
    fireEvent.keyDown(container.querySelector('.host-list')!, { key: 'n', metaKey: true, shiftKey: true });
    fireEvent.keyDown(container.querySelector('.host-list')!, { key: 'n', ctrlKey: true, altKey: true });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('leaves a chord on a focused button to that button', () => {
    list([row()]);
    fireEvent.keyDown(screen.getByLabelText('Refresh'), { key: 'n', metaKey: true });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('offers the plus button in the empty state', () => {
    const fixture = capabilities();
    list([], fixture.value);
    fireEvent.click(screen.getByLabelText('New host'));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('New host');
    expect(fixture.intent).not.toHaveBeenCalled();
  });
});

describe('HostList row actions', () => {
  it('edits from a row action without selecting or opening the row', () => {
    const fixture = capabilities();
    const { container } = list([row({ name: 'a' }), row({ name: 'b' })], fixture.value);
    const second = container.querySelectorAll('.host-row')[1] as HTMLElement;
    fireEvent.click(within(second).getByLabelText('Edit host b'));
    expect(container.querySelector('.host-row')!).toHaveClass('selected');
    expect(second).not.toHaveClass('selected');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Edit host b');
    expect(fixture.intent).not.toHaveBeenCalled();
  });

  it('asks for delete confirmation without launching the row', () => {
    const fixture = capabilities();
    const { container } = list([row({ name: 'a' }), row({ name: 'b' })], fixture.value);
    const second = container.querySelectorAll('.host-row')[1] as HTMLElement;
    fireEvent.click(within(second).getByLabelText('Delete host b'));
    expect(container.querySelector('.host-row')!).toHaveClass('selected');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete host b?');
    expect(fixture.intent).not.toHaveBeenCalled();
  });

  it('dismisses the delete question without an intent on Cancel', () => {
    const fixture = capabilities();
    list([row()], fixture.value);
    fireEvent.click(screen.getByLabelText('Delete host lab'));
    fireEvent.click(screen.getByText('Cancel', { selector: '.modal-button' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fixture.intent).not.toHaveBeenCalled();
  });

  it('deletes on confirmation and closes the dialog on success', async () => {
    const fixture = capabilities();
    list([row()], fixture.value);
    fireEvent.click(screen.getByLabelText('Delete host lab'));
    fireEvent.click(screen.getByText('Delete', { selector: '.modal-button' }));
    await waitFor(() => expect(fixture.intent).toHaveBeenCalledExactlyOnceWith('delete', { name: 'lab' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('holds one pending request open and refuses repeated confirmation', async () => {
    const pending = withResolvers<unknown>();
    const fixture = capabilities(vi.fn(async () => pending.promise));
    list([row()], fixture.value);
    fireEvent.click(screen.getByLabelText('Delete host lab'));
    fireEvent.click(screen.getByText('Delete', { selector: '.modal-button' }));
    const confirm = () => screen.getByText('Delete', { selector: '.modal-button' });
    await waitFor(() => expect(confirm()).toBeDisabled());
    fireEvent.click(confirm());
    fireEvent.keyDown(globalThis.window, { key: 'y' });
    expect(fixture.intent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    pending.resolve(null);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('closes the dialog when the delete request fails', async () => {
    const fixture = capabilities(vi.fn(async () => { throw new Error('rpc failed'); }));
    list([row()], fixture.value);
    fireEvent.click(screen.getByLabelText('Delete host lab'));
    fireEvent.click(screen.getByText('Delete', { selector: '.modal-button' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fixture.intent).toHaveBeenCalledExactlyOnceWith('delete', { name: 'lab' });
  });

  it('follows the incoming snapshot after a successful delete', async () => {
    const fixture = capabilities();
    const { container, rerender } = list([row({ name: 'a' }), row({ name: 'b' })], fixture.value);
    fireEvent.click(screen.getByLabelText('Delete host b'));
    fireEvent.click(screen.getByText('Delete', { selector: '.modal-button' }));
    rerender(<HostList payload={{ filePath: FILE, rows: [row({ name: 'a' })] }} capabilities={fixture.value} />);
    await waitFor(() => {
      expect([...container.querySelectorAll('.host-row-name')].map((node) => node.textContent)).toEqual(['a']);
    });
  });

  it('retains the row when the delete fails', async () => {
    const fixture = capabilities(vi.fn(async () => { throw new Error('rpc failed'); }));
    const { container } = list([row({ name: 'a' })], fixture.value);
    fireEvent.click(screen.getByLabelText('Delete host a'));
    fireEvent.click(screen.getByText('Delete', { selector: '.modal-button' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect([...container.querySelectorAll('.host-row-name')].map((node) => node.textContent)).toEqual(['a']);
  });
});

describe('HostList focus after a save', () => {
  async function rename(
    fixture: ReturnType<typeof capabilities>,
    pending: ReturnType<typeof withResolvers<unknown>>,
  ) {
    const { container, rerender } = list([row({ name: 'a' }), row({ name: 'lab' })], fixture.value);
    const second = container.querySelectorAll('.host-row')[1] as HTMLElement;
    fireEvent.click(within(second).getByLabelText('Edit host lab'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'zeta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    return { container, rerender, pending };
  }

  it('selects and focuses the saved name when the reply arrives before the snapshot', async () => {
    const pending = withResolvers<unknown>();
    const fixture = capabilities(vi.fn(async () => pending.promise));
    const { container, rerender } = await rename(fixture, pending);
    pending.resolve({ ok: true, name: 'zeta' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    rerender(<HostList
      payload={{ filePath: FILE, rows: [row({ name: 'zeta' }), row({ name: 'a' })] }}
      capabilities={fixture.value}
    />);
    await waitFor(() => {
      expect(container.querySelector('.host-row')!).toHaveClass('selected');
      expect(container.querySelector('.host-list')).toHaveFocus();
    });
    fireEvent.click(container.querySelector('.host-row')!);
    expect(fixture.intent).toHaveBeenCalledTimes(1);
  });

  it('selects and focuses the saved name when the snapshot arrives before the reply', async () => {
    const pending = withResolvers<unknown>();
    const fixture = capabilities(vi.fn(async () => pending.promise));
    const { container, rerender } = await rename(fixture, pending);
    rerender(<HostList
      payload={{ filePath: FILE, rows: [row({ name: 'zeta' }), row({ name: 'a' })] }}
      capabilities={fixture.value}
    />);
    pending.resolve({ ok: true, name: 'zeta' });
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(container.querySelector('.host-row')!).toHaveClass('selected');
      expect(container.querySelector('.host-list')).toHaveFocus();
    });
  });

  it('does not steal focus when the Hosts tab is not active', async () => {
    const fixture = capabilities(vi.fn(async () => ({ ok: true, name: 'zeta' })));
    fixture.value.active = false;
    const { container, rerender } = list([row({ name: 'a' }), row({ name: 'lab' })], fixture.value);
    fireEvent.click(within(container.querySelectorAll('.host-row')[1] as HTMLElement).getByLabelText('Edit host lab'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'zeta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    rerender(<HostList
      payload={{ filePath: FILE, rows: [row({ name: 'zeta' }), row({ name: 'a' })] }}
      capabilities={fixture.value}
    />);
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(container.querySelector('.host-row')!).toHaveClass('selected');
    });
    expect(container.querySelector('.host-list')).not.toHaveFocus();
  });
});
