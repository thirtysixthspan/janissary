import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Pager } from './Pager';
import { grid, payload } from './fixture';

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
