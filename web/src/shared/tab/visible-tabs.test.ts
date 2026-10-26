import { describe, expect, it } from 'vitest';
import type { TabView } from '@shared/protocol';
import { visibleTabs } from './visible-tabs';

function tab(label: string, overrides: Partial<TabView> = {}): TabView {
  return {
    label, number: 1, dotColor: '#fff', group: 0, groupColor: '#000', busy: false, hasUnread: false,
    cwd: '/repo', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [],
    toolStepsExpanded: false, ...overrides,
  };
}

describe('visibleTabs', () => {
  it('returns the active and secondary center tabs in visible order', () => {
    const tabs = [tab('active'), tab('other-pane', { pane: 'right' }), tab('background')];

    expect(visibleTabs({ tabs, activeTab: 0, secondaryTab: 1 })).toEqual({
      current: tabs[0], secondary: tabs[1], visibleLabels: ['active', 'other-pane'],
    });
  });

  it('excludes a hidden, docked, or reporting secondary tab', () => {
    const tabs = [
      tab('active'),
      tab('hidden', { hidden: true }),
      tab('docked', { dock: 'left' }),
      tab('reporting', { view: 'monitor' }),
    ];

    for (const secondaryTab of [1, 2, 3]) {
      expect(visibleTabs({ tabs, activeTab: 0, secondaryTab })).toEqual({
        current: tabs[0], secondary: undefined, visibleLabels: ['active'],
      });
    }
  });

  it('returns no visible tabs when the active tab is hidden or docked', () => {
    const tabs = [tab('hidden', { hidden: true }), tab('docked', { dock: 'right' }), tab('other')];

    expect(visibleTabs({ tabs, activeTab: 0, secondaryTab: 2 }).visibleLabels).toEqual([]);
    expect(visibleTabs({ tabs, activeTab: 1, secondaryTab: 2 }).visibleLabels).toEqual([]);
  });

  it('returns only the active tab without a valid secondary selection', () => {
    const tabs = [tab('active'), tab('background')];

    expect(visibleTabs({ tabs, activeTab: 0 }).visibleLabels).toEqual(['active']);
    expect(visibleTabs({ tabs, activeTab: 0, secondaryTab: -1 }).visibleLabels).toEqual(['active']);
    expect(visibleTabs({ tabs, activeTab: 4, secondaryTab: 0 }).visibleLabels).toEqual([]);
  });
});
