import { afterEach, describe, expect, it } from 'vitest';
import { makeTab } from './index.js';
import { hideTab } from './visibility.js';
import { disposeDwell } from './dwell.js';
import type { TabSelectionPort } from './selection-operations.js';

afterEach(disposeDwell);

function port(activeTab = 1, secondaryTabLabel?: string): TabSelectionPort {
  const tabs = ['previous', 'system', 'next', 'right', 'right-next'].map((label) => makeTab(label, '#fff'));
  tabs[3].pane = 'right';
  tabs[4].pane = 'right';
  return { tabs, activeTab, secondaryTabLabel, focusHistory: [] };
}

describe('hide selection repair', () => {
  it('prefers the most recent eligible same-pane history over the nearest candidate', () => {
    const state = port(1, 'right');
    state.tabs[2].hidden = true;
    state.focusHistory = ['previous', 'missing', 'next', 'system'];
    hideTab(state, 1);
    expect(state.activeTab).toBe(0);
    expect(state.secondaryTabLabel).toBe('right');
    expect(state.focusHistory).not.toContain('system');
  });

  it('prefers the next full-array neighbor on a tie', () => {
    const state = port(1, 'right');
    hideTab(state, 1);
    expect(state.activeTab).toBe(2);
    expect(state.secondaryTabLabel).toBe('right');
  });

  it('replaces a hidden secondary while preserving the active tab', () => {
    const state = port(0, 'right');
    hideTab(state, 3);
    expect(state.activeTab).toBe(0);
    expect(state.secondaryTabLabel).toBe('right-next');
    expect(state.tabs[3].pane).toBe('right');
  });

  it('collapses an emptied pane and preserves the remaining visible selection', () => {
    const state = port(3, 'previous');
    state.tabs[4].hidden = true;
    hideTab(state, 3);
    expect(state.tabs[state.activeTab].label).toBe('next');
    expect(state.secondaryTabLabel).toBeUndefined();
    expect(state.tabs.filter((tab) => !tab.hidden).every((tab) => !tab.pane)).toBe(true);
  });

  it('preserves dock placement and selection when hiding a sidebar record', () => {
    const state = port(0, 'right');
    state.tabs[1].dock = 'left';
    hideTab(state, 1);
    expect(state.tabs[1].dock).toBe('left');
    expect(state.activeTab).toBe(0);
    expect(state.secondaryTabLabel).toBe('right');
    expect(hideTab(state, 1)).toBe(false);
    expect(hideTab(state, 99)).toBe(false);
  });
});
