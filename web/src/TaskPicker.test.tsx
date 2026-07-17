import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { TaskPicker } from './TaskPicker';
import type { VisibleTaskRow } from './task-picker-keys';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function fileRow(path: string, depth = 0, source: VisibleTaskRow['source'] = 'project'): VisibleTaskRow {
  return { path, name: path.split('/').pop()!, depth, dir: false, source };
}

function dirRow(path: string, expanded: boolean, depth = 0): VisibleTaskRow {
  return { path, name: path.split('/').pop()!, depth, dir: true, expanded, source: 'project' };
}

function headerRow(source: VisibleTaskRow['source'], name: string): VisibleTaskRow {
  return { header: true, source, path: ` header-${source}`, name, depth: 0, dir: false };
}

describe('TaskPicker', () => {
  it('renders the tasks title', () => {
    const { getByText } = render(React.createElement(TaskPicker, { rows: [], selected: 0, onPick: vi.fn(), onToggleDir: vi.fn() }));
    expect(getByText('tasks')).toBeTruthy();
  });

  it('shows the no-tasks message when rows is empty', () => {
    const { getByText } = render(React.createElement(TaskPicker, { rows: [], selected: 0, onPick: vi.fn(), onToggleDir: vi.fn() }));
    expect(getByText('(no tasks)')).toBeTruthy();
  });

  it('renders task items without the .md extension', () => {
    const rows = [fileRow('a.md'), fileRow('b.md')];
    const { getByText, queryByText } = render(React.createElement(TaskPicker, { rows, selected: 0, onPick: vi.fn(), onToggleDir: vi.fn() }));
    expect(getByText('a')).toBeTruthy();
    expect(getByText('b')).toBeTruthy();
    expect(queryByText('a.md')).toBeNull();
    expect(queryByText('b.md')).toBeNull();
  });

  it('renders a directory row with its name and a chevron', () => {
    const rows = [dirRow('sub', false)];
    const { getByText } = render(React.createElement(TaskPicker, { rows, selected: 0, onPick: vi.fn(), onToggleDir: vi.fn() }));
    expect(getByText('sub')).toBeTruthy();
    expect(getByText('▸')).toBeTruthy();
  });

  it('shows the expanded chevron for an expanded directory', () => {
    const rows = [dirRow('sub', true)];
    const { getByText } = render(React.createElement(TaskPicker, { rows, selected: 0, onPick: vi.fn(), onToggleDir: vi.fn() }));
    expect(getByText('▾')).toBeTruthy();
  });

  it('marks the selected item with the selected class', () => {
    const rows = [fileRow('a.md'), fileRow('b.md')];
    const { container } = render(React.createElement(TaskPicker, { rows, selected: 1, onPick: vi.fn(), onToggleDir: vi.fn() }));
    const pickerRows = container.querySelectorAll('.picker-row');
    expect(pickerRows[0].classList.contains('selected')).toBe(false);
    expect(pickerRows[1].classList.contains('selected')).toBe(true);
  });

  it('calls onPick with the full path when a file row is clicked', () => {
    const onPick = vi.fn();
    const rows = [fileRow('a.md'), fileRow('sub/b.md')];
    const { container } = render(React.createElement(TaskPicker, { rows, selected: 0, onPick, onToggleDir: vi.fn() }));
    fireEvent.click(container.querySelectorAll('.picker-row')[1]);
    expect(onPick).toHaveBeenCalledWith('sub/b.md');
  });

  it('calls onToggleDir (not onPick) when a directory row is clicked', () => {
    const onPick = vi.fn();
    const onToggleDir = vi.fn();
    const rows = [dirRow('sub', false), fileRow('a.md')];
    const { container } = render(React.createElement(TaskPicker, { rows, selected: 0, onPick, onToggleDir }));
    fireEvent.click(container.querySelector('.picker-row')!);
    expect(onToggleDir).toHaveBeenCalledWith('sub');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('renders section header rows as non-selectable dividers, not picker rows', () => {
    const rows = [
      headerRow('project', 'Project'), fileRow('a.md'),
      headerRow('janissary', 'Janissary'), fileRow('b.md', 0, 'janissary'),
    ];
    const { container, getByText } = render(React.createElement(TaskPicker, { rows, selected: 1, onPick: vi.fn(), onToggleDir: vi.fn() }));
    expect(getByText('Project')).toBeTruthy();
    expect(getByText('Janissary')).toBeTruthy();
    expect(container.querySelectorAll('.picker-section').length).toBe(2);
    expect(container.querySelectorAll('.picker-row').length).toBe(2);
  });

  it('does not call onPick when a section header is clicked', () => {
    const onPick = vi.fn();
    const onToggleDir = vi.fn();
    const rows = [headerRow('project', 'Project'), fileRow('a.md')];
    const { container } = render(React.createElement(TaskPicker, { rows, selected: 1, onPick, onToggleDir }));
    fireEvent.click(container.querySelector('.picker-section')!);
    expect(onPick).not.toHaveBeenCalled();
    expect(onToggleDir).not.toHaveBeenCalled();
  });
});
