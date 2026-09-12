import { describe, it, expect } from 'vitest';
import type { TabView } from '@shared/protocol';
import { filterTabs, displayLabel } from './tab-nav-match';

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'janus', number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    ...overrides,
  };
}

describe('filterTabs', () => {
  it('returns all tabs in order when the query is empty', () => {
    const tabs = [makeTab({ label: 'deploy' }), makeTab({ label: 'shell', number: 2 })];
    expect(filterTabs(tabs, '').map((e) => e.tab.label)).toEqual(['deploy', 'shell']);
  });

  it('excludes docked and reporting tabs while preserving full-list indices', () => {
    const tabs = [
      makeTab({ label: 'left', dock: 'left' }),
      makeTab({ label: 'agent', number: 2 }),
      makeTab({ label: 'monitor', number: 3, view: 'monitor' }),
      makeTab({ label: 'shell', number: 4 }),
    ];
    expect(filterTabs(tabs, '')).toEqual([
      { tab: tabs[1], index: 1 },
      { tab: tabs[3], index: 3 },
    ]);
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

  it('matches by substring on the alias (title) when the tab has been renamed', () => {
    const tabs = [makeTab({ label: 'agent-3', title: 'reviewer' }), makeTab({ label: 'shell', number: 2 })];
    expect(filterTabs(tabs, 'revie').map((e) => e.tab.label)).toEqual(['agent-3']);
  });

  it('still matches by label when the tab has no alias', () => {
    const tabs = [makeTab({ label: 'deploy' }), makeTab({ label: 'shell', number: 2 })];
    expect(filterTabs(tabs, 'depl').map((e) => e.tab.label)).toEqual(['deploy']);
  });
});

describe('displayLabel', () => {
  it('returns the alias when the tab has been renamed', () => {
    expect(displayLabel(makeTab({ label: 'agent-3', title: 'reviewer' }))).toBe('reviewer');
  });

  it('returns the internal label when the tab has no alias', () => {
    expect(displayLabel(makeTab({ label: 'agent-3' }))).toBe('agent-3');
  });
});
