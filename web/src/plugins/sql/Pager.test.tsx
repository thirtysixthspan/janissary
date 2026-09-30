import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid } from './DataGrid';
import { Pager } from './Pager';
import { grid, makeCapabilities, payload } from './fixture';
import { toggleColumn, visibleColumns } from './grid-view';

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
    render(<DataGrid payload={payload({ hidden: ['status'], grid: grid() })} capabilities={capabilities} />);
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
    expect(headers.some((text) => text.includes('status'))).toBe(false);
    // The `id` column still shows its own values, and the hidden one is not shown at all.
    const cells = screen.getAllByRole('cell').map((cell) => cell.textContent ?? '');
    expect(cells).toContain('1');
    expect(cells).not.toContain('paid');
    expect(intent).not.toHaveBeenCalled();
  });

  it('asks for the whole hidden set when a column is toggled', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    fireEvent.click(screen.getByLabelText('Choose columns'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'status' }));
    expect(intent).toHaveBeenCalledWith('set-columns', { hidden: ['status'] });
  });

  it('takes every column back at once', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<DataGrid payload={payload({ hidden: ['status'] })} capabilities={capabilities} />);
    fireEvent.click(screen.getByLabelText('Choose columns'));
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(intent).toHaveBeenCalledWith('set-columns', { hidden: [] });
  });

  it('says how many are hidden on the control that opens the chooser', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload({ hidden: ['status'] })} capabilities={capabilities} />);
    expect(screen.getByLabelText('Choose columns').getAttribute('title')).toContain('1 hidden');
  });

  // The host's Split is drawn as a table's columns, so a column glyph here would be two answers to
  // one question. What this control is about is what the grid shows, and an eye is not that glyph.
  it('is not drawn as the split glyph, so the two controls apart are not the same shape', () => {
    const { capabilities } = makeCapabilities();
    render(<DataGrid payload={payload()} capabilities={capabilities} />);
    const glyph = screen.getByLabelText('Choose columns').querySelector('svg') as SVGElement;
    expect(glyph.dataset.icon).toBe('eye');
    expect(glyph.dataset.icon).not.toBe('table-columns');
  });
});

describe('Pager', () => {
  const big = grid({ total: 51_882, unfilteredTotal: 51_882, limit: 100, offset: 0 });

  function shown() {
    const onSend = vi.fn();
    render(<Pager payload={payload({ grid: big })} onSend={onSend} />);
    return onSend;
  }

  it('asks for the page a typed row number starts', () => {
    const onSend = shown();
    fireEvent.change(screen.getByLabelText('Go to row'), { target: { value: '40000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onSend).toHaveBeenCalledWith('set-page', { offset: 39_900 });
  });

  it('goes on Enter as well as on the control', () => {
    const onSend = shown();
    const field = screen.getByLabelText('Go to row');
    fireEvent.change(field, { target: { value: '101' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('set-page', { offset: 100 });
  });

  it('says nothing at all for a number that names no row', () => {
    const onSend = shown();
    const field = screen.getByLabelText('Go to row');
    fireEvent.change(field, { target: { value: 'abc' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('offers nothing to go to until a row is named', () => {
    shown();
    expect((screen.getByRole('button', { name: 'Go' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('leaves the range label alone, so the user can see where they landed', () => {
    const onSend = vi.fn();
    render(<Pager payload={payload({ grid: big })} onSend={onSend} />);
    expect(screen.getByText(/^Rows /).textContent).toContain('51,882');
  });

  it('still steps a page at a time', () => {
    const onSend = shown();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onSend).toHaveBeenCalledWith('set-page', { offset: 100 });
  });
});
