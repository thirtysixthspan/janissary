import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import type { TabView } from '@shared/protocol';
import { TabNavPicker, filterTabs } from './TabNavPicker';

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'janus', number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], toolStepsExpanded: false,
    ...overrides,
  };
}

describe('filterTabs', () => {
  it('returns all tabs in order when the query is empty', () => {
    const tabs = [makeTab({ label: 'deploy' }), makeTab({ label: 'shell', number: 2 })];
    expect(filterTabs(tabs, '').map((e) => e.tab.label)).toEqual(['deploy', 'shell']);
  });

  it('matches by substring on label, case-insensitively', () => {
    const tabs = [makeTab({ label: 'Deploy' }), makeTab({ label: 'shell', number: 2 })];
    expect(filterTabs(tabs, 'depl').map((e) => e.tab.label)).toEqual(['Deploy']);
  });

  it('matches by tab number prefix', () => {
    const tabs = [makeTab({ label: 'deploy', number: 3 }), makeTab({ label: 'shell', number: 31 })];
    expect(filterTabs(tabs, '3').map((e) => e.tab.label)).toEqual(['deploy', 'shell']);
  });

  it('sorts number matches before label-only matches', () => {
    const tabs = [makeTab({ label: '3rd-thing', number: 9 }), makeTab({ label: 'other', number: 3 })];
    expect(filterTabs(tabs, '3').map((e) => e.tab.label)).toEqual(['other', '3rd-thing']);
  });

  it('sorts alphabetically within each group', () => {
    const tabs = [makeTab({ label: 'zeta' }), makeTab({ label: 'alpha', number: 2 })];
    expect(filterTabs(tabs, 'a').map((e) => e.tab.label)).toEqual(['alpha', 'zeta']);
  });

  it('excludes tabs that match neither label nor number', () => {
    const tabs = [makeTab({ label: 'deploy' }), makeTab({ label: 'shell', number: 2 })];
    expect(filterTabs(tabs, 'zzz')).toEqual([]);
  });
});

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
