import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { HistoryPicker } from './HistoryPicker';

describe('HistoryPicker', () => {
  it('renders the history title', () => {
    const { getByText } = render(React.createElement(HistoryPicker, { items: [], selected: 0, onPick: vi.fn() }));
    expect(getByText('history')).toBeTruthy();
  });

  it('shows no-history message when items is empty', () => {
    const { getByText } = render(React.createElement(HistoryPicker, { items: [], selected: 0, onPick: vi.fn() }));
    expect(getByText('(no history)')).toBeTruthy();
  });

  it('renders all history items', () => {
    const { getByText } = render(React.createElement(HistoryPicker, { items: ['cmd1', 'cmd2'], selected: 0, onPick: vi.fn() }));
    expect(getByText('cmd1')).toBeTruthy();
    expect(getByText('cmd2')).toBeTruthy();
  });

  it('marks the selected item with the selected class', () => {
    const { container } = render(React.createElement(HistoryPicker, { items: ['cmd1', 'cmd2'], selected: 1, onPick: vi.fn() }));
    const rows = container.querySelectorAll('.picker-row');
    expect(rows[0].classList.contains('selected')).toBe(false);
    expect(rows[1].classList.contains('selected')).toBe(true);
  });

  it('calls onPick with the command when a row is clicked', () => {
    const onPick = vi.fn();
    const { container } = render(React.createElement(HistoryPicker, { items: ['cmd1', 'cmd2'], selected: 0, onPick }));
    fireEvent.click(container.querySelectorAll('.picker-row')[1]);
    expect(onPick).toHaveBeenCalledWith('cmd2');
  });
});
