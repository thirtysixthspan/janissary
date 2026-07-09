import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { TaskPicker } from './TaskPicker';

describe('TaskPicker', () => {
  it('renders the tasks title', () => {
    const { getByText } = render(React.createElement(TaskPicker, { items: [], selected: 0, onPick: vi.fn() }));
    expect(getByText('tasks')).toBeTruthy();
  });

  it('shows the no-tasks message when items is empty', () => {
    const { getByText } = render(React.createElement(TaskPicker, { items: [], selected: 0, onPick: vi.fn() }));
    expect(getByText('(no tasks)')).toBeTruthy();
  });

  it('renders task items without the .md extension', () => {
    const { getByText, queryByText } = render(React.createElement(TaskPicker, { items: ['a.md', 'b.md'], selected: 0, onPick: vi.fn() }));
    expect(getByText('a')).toBeTruthy();
    expect(getByText('b')).toBeTruthy();
    expect(queryByText('a.md')).toBeNull();
    expect(queryByText('b.md')).toBeNull();
  });

  it('marks the selected item with the selected class', () => {
    const { container } = render(React.createElement(TaskPicker, { items: ['a.md', 'b.md'], selected: 1, onPick: vi.fn() }));
    const rows = container.querySelectorAll('.picker-row');
    expect(rows[0].classList.contains('selected')).toBe(false);
    expect(rows[1].classList.contains('selected')).toBe(true);
  });

  it('calls onPick with the filename when a row is clicked', () => {
    const onPick = vi.fn();
    const { container } = render(React.createElement(TaskPicker, { items: ['a.md', 'b.md'], selected: 0, onPick }));
    fireEvent.click(container.querySelectorAll('.picker-row')[1]);
    expect(onPick).toHaveBeenCalledWith('b.md');
  });
});
