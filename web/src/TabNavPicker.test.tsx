import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import type { TabView } from '@shared/protocol';
import { TabNavPicker } from './TabNavPicker';

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'janus', number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    ...overrides,
  };
}

describe('TabNavPicker', () => {
  it('renders every tab when the query is empty', () => {
    const tabs = [makeTab({ label: 'deploy' }), makeTab({ label: 'shell', number: 2 })];
    const { getByText } = render(React.createElement(TabNavPicker, { tabs, query: '', selected: 0, onPick: vi.fn() }));
    expect(getByText(/deploy/)).toBeTruthy();
    expect(getByText(/shell/)).toBeTruthy();
  });

  it('shows a no-match message when the query matches nothing', () => {
    const tabs = [makeTab({ label: 'deploy' })];
    const { getByText } = render(React.createElement(TabNavPicker, { tabs, query: 'zzz', selected: 0, onPick: vi.fn() }));
    expect(getByText('(no matching tabs)')).toBeTruthy();
  });

  it('highlights the matched substring', () => {
    const tabs = [makeTab({ label: 'deploy' })];
    const { container } = render(React.createElement(TabNavPicker, { tabs, query: 'depl', selected: 0, onPick: vi.fn() }));
    const mark = container.querySelector('mark');
    expect(mark?.textContent).toBe('depl');
  });

  it('renders the alias, not the raw label, for a renamed tab', () => {
    const tabs = [makeTab({ label: 'agent-3', title: 'reviewer' })];
    const { getByText, queryByText } = render(React.createElement(TabNavPicker, { tabs, query: '', selected: 0, onPick: vi.fn() }));
    expect(getByText(/reviewer/)).toBeTruthy();
    expect(queryByText(/agent-3/)).toBeNull();
  });

  it('highlights the matched substring within the alias when filtering by alias text', () => {
    const tabs = [makeTab({ label: 'agent-3', title: 'reviewer' })];
    const { container } = render(React.createElement(TabNavPicker, { tabs, query: 'revie', selected: 0, onPick: vi.fn() }));
    const mark = container.querySelector('mark');
    expect(mark?.textContent).toBe('revie');
  });

  it('marks the selected row', () => {
    const tabs = [makeTab({ label: 'deploy' }), makeTab({ label: 'shell', number: 2 })];
    const { container } = render(React.createElement(TabNavPicker, { tabs, query: '', selected: 1, onPick: vi.fn() }));
    const rows = container.querySelectorAll('.picker-row');
    expect(rows[0].classList.contains('selected')).toBe(false);
    expect(rows[1].classList.contains('selected')).toBe(true);
  });

  it('calls onPick with the real index in the full tab list when a row is clicked', () => {
    const tabs = [makeTab({ label: 'deploy' }), makeTab({ label: 'shell', number: 2 })];
    const onPick = vi.fn();
    const { container } = render(React.createElement(TabNavPicker, { tabs, query: 'shell', selected: 0, onPick }));
    fireEvent.click(container.querySelector('.picker-row')!);
    expect(onPick).toHaveBeenCalledWith(1);
  });
});
