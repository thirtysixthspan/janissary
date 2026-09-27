import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisualizationSummary } from '@shared/plugins/visualizations/shared';
import type { TabPluginClientCapabilities } from '../api';
import { VisualizationList } from './VisualizationList';

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

function entry(id: string, title: string, updatedAt: number): VisualizationSummary {
  return { id, title, updatedAt };
}

function list(entries: VisualizationSummary[]) {
  return { kind: 'list' as const, entries };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('VisualizationList', () => {
  it('renders rows in the host-provided most-recent-first order with activity times', () => {
    const { value } = capabilities();
    const { container } = render(<VisualizationList
      payload={list([entry('new', 'Newest', 2), entry('old', 'Older', 1)])}
      capabilities={value}
    />);
    expect([...container.querySelectorAll('.visualization-row-title')].map((node) => node.textContent))
      .toEqual(['Newest', 'Older']);
    expect(container.querySelectorAll('time')).toHaveLength(2);
  });

  // A visualization now begins with a question rather than with a source, so there is no field here to
  // fill in: the control makes an empty conversation and its tab asks for the address.
  it('shows the empty state, and a bare plus that makes an empty conversation', () => {
    const { intent, value } = capabilities();
    render(<VisualizationList payload={list([])} capabilities={value} />);
    expect(screen.getByText('No visualizations yet')).toBeInTheDocument();
    expect(screen.queryByLabelText('Data source')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('New visualization'));
    expect(intent).toHaveBeenCalledWith('create', {});
  });

  it('focuses the active list and highlights its first row', () => {
    const { value } = capabilities();
    const { container } = render(<VisualizationList
      payload={list([entry('first', 'First', 2), entry('second', 'Second', 1)])}
      capabilities={value}
    />);
    expect(container.querySelector('.visualization-list')).toHaveFocus();
    expect(container.querySelector('.visualization-row')).toHaveClass('selected');
  });

  it('moves the highlight with the arrow keys and opens the current row with Enter', () => {
    const { intent, value } = capabilities();

    const { container } = render(<VisualizationList
      payload={list([entry('first', 'First', 2), entry('second', 'Second', 1)])}
      capabilities={value}
    />);
    const listNode = container.querySelector('.visualization-list')!;
    fireEvent.keyDown(listNode, { key: 'ArrowDown' });
    expect(container.querySelectorAll('.visualization-row')[1]).toHaveClass('selected');
    fireEvent.keyDown(listNode, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('open', { id: 'second' });
  });

  it('takes two clicks on the same row to open it, whether or not the arrows moved there', () => {
    const { intent, value } = capabilities();
    const { container } = render(<VisualizationList
      payload={list([entry('first', 'First', 2), entry('second', 'Second', 1)])}
      capabilities={value}
    />);
    const rows = container.querySelectorAll('.visualization-row');
    // A single click on the row that was already current still only confirms it.
    fireEvent.click(rows[0]!);
    expect(intent).not.toHaveBeenCalled();
    fireEvent.click(rows[0]!);
    expect(intent).toHaveBeenCalledWith('open', { id: 'first' });

    // Clicking away restarts the count on the new row.
    fireEvent.click(rows[1]!);
    expect(intent).toHaveBeenCalledTimes(1);
    fireEvent.click(rows[1]!);
    expect(intent).toHaveBeenLastCalledWith('open', { id: 'second' });
  });

  it('creates one on Cmd+N and on Ctrl+N too', () => {
    const { intent, value } = capabilities();
    const { container } = render(<VisualizationList payload={list([])} capabilities={value} />);
    const listNode = container.querySelector('.visualization-list')!;
    fireEvent.keyDown(listNode, { key: 'n', metaKey: true });
    expect(intent).toHaveBeenCalledWith('create', {});
    fireEvent.keyDown(listNode, { key: 'n', ctrlKey: true });
    expect(intent).toHaveBeenCalledTimes(2);
  });

  it('deletes a row only after the confirmation is answered', () => {
    const { intent, value } = capabilities();
    render(<VisualizationList payload={list([entry('one', 'Revenue', 1)])} capabilities={value} />);
    fireEvent.click(screen.getByLabelText('Delete Revenue'));
    expect(screen.getByText('Delete visualization "Revenue"?')).toBeInTheDocument();
    expect(intent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(intent).toHaveBeenCalledWith('delete', { id: 'one' });
  });

  it('cancels a delete without emitting anything', () => {
    const { intent, value } = capabilities();
    render(<VisualizationList payload={list([entry('one', 'Revenue', 1)])} capabilities={value} />);
    fireEvent.click(screen.getByLabelText('Delete Revenue'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(intent).not.toHaveBeenCalled();
  });
});
