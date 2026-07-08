import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueuePicker } from './QueuePicker';

describe('QueuePicker', () => {
  it('renders the queue title', () => {
    const { getByText } = render(React.createElement(QueuePicker, { items: [], selected: 0, onSelect: vi.fn() }));
    expect(getByText('queue')).toBeTruthy();
  });

  it('shows the empty-queue message when items is empty', () => {
    const { getByText } = render(React.createElement(QueuePicker, { items: [], selected: 0, onSelect: vi.fn() }));
    expect(getByText('(no commands queued)')).toBeTruthy();
  });

  it('renders all queued commands', () => {
    const { getByText } = render(React.createElement(QueuePicker, { items: ['cmd1', 'cmd2'], selected: 0, onSelect: vi.fn() }));
    expect(getByText('cmd1')).toBeTruthy();
    expect(getByText('cmd2')).toBeTruthy();
  });

  it('marks the selected item with the selected class', () => {
    const { container } = render(React.createElement(QueuePicker, { items: ['cmd1', 'cmd2'], selected: 1, onSelect: vi.fn() }));
    const rows = container.querySelectorAll('.picker-row');
    expect(rows[0].classList.contains('selected')).toBe(false);
    expect(rows[1].classList.contains('selected')).toBe(true);
  });

  it('calls onSelect with the index when a row is clicked', () => {
    const onSelect = vi.fn();
    const { container } = render(React.createElement(QueuePicker, { items: ['cmd1', 'cmd2'], selected: 0, onSelect }));
    fireEvent.click(container.querySelectorAll('.picker-row')[1]);
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
