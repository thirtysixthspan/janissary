import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Pager } from './Pager';
import { grid, makeCapabilities, payload, TestDataGrid } from './fixture';
import { toggleColumn, visibleColumns } from './grid-view';

// The hidden-column case renders the whole grid, and the grid scrolls the highlighted row into view,
// which jsdom neither lays out nor does.
beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });

describe('Pager', () => {
  const big = grid({ total: 51_882, unfilteredTotal: 51_882, limit: 100, offset: 0 });

  it('leaves the range label saying where the user is', () => {
    render(<Pager payload={payload({ grid: big })} onSetPage={vi.fn()} onSetPageSize={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText(/^Rows /).textContent).toContain('51,882');
  });

  it('steps a page at a time, forwards and back', () => {
    const onSetPage = vi.fn();
    render(<Pager payload={payload({ grid: big })} onSetPage={onSetPage} onSetPageSize={vi.fn()} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onSetPage).toHaveBeenCalledWith(100);
  });

  it('steps back a page from anywhere but the first', () => {
    const onSetPage = vi.fn();
    render(<Pager
      payload={payload({ grid: grid({ ...big, offset: 300 }) })}
      onSetPage={onSetPage}
      onSetPageSize={vi.fn()}
      onRefresh={vi.fn()}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onSetPage).toHaveBeenCalledWith(200);
  });

  it('offers no way to name a row, so there is no field to leave half-typed', () => {
    render(<Pager payload={payload({ grid: big })} onSetPage={vi.fn()} onSetPageSize={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.queryByLabelText('Go to row')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Go' })).toBeNull();
  });
});

describe('hidden columns', () => {
  it('keeps each shown column with the cell position it holds', () => {
    // `row.cells` is positional: dropping a column from the header without dropping it from each
    // row would leave every cell after it showing its neighbour's value.
    expect(visibleColumns(['a', 'b', 'c'], ['b'])).toEqual([
      { name: 'a', index: 0 },
      { name: 'c', index: 2 },
    ]);
  });

  it('shows every column when nothing is hidden', () => {
    expect(visibleColumns(['a', 'b'], []).map((column) => column.name)).toEqual(['a', 'b']);
  });

  it('hides and shows one column at a time', () => {
    expect(toggleColumn(['a', 'b'], [], 'b')).toEqual(['b']);
    expect(toggleColumn(['a', 'b'], ['b'], 'b')).toEqual([]);
    expect(toggleColumn(['a', 'b'], ['b'], 'a')).toEqual(['b', 'a']);
  });

  it('ignores a name that is not a column, so no stale entry is recorded', () => {
    expect(toggleColumn(['a'], ['a'], 'nope')).toEqual(['a']);
  });

  it('renders a row with the hidden column out of the way and the rest in place', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<TestDataGrid payload={payload({ hidden: ['status'], grid: grid() })} capabilities={capabilities} />);
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
    expect(headers.some((text) => text.includes('status'))).toBe(false);
    // The `id` column still shows its own values, and the hidden one is not shown at all.
    const cells = screen.getAllByRole('cell').map((cell) => cell.textContent ?? '');
    expect(cells).toContain('1');
    expect(cells).not.toContain('paid');
    expect(intent).not.toHaveBeenCalled();
  });
});
