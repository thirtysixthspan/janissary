import { describe, expect, it } from 'vitest';
import { focusedPane, recentLabel, repairPaneSelections } from './split-selection.js';
import type { CenterPane, Tab } from './types.js';

// A center action tab is one that is neither docked nor a reporting tab; a pane is `left` unless the
// tab says otherwise. Built structurally so these tests can talk about layout and nothing else.
function tab(label: string, pane?: CenterPane, over: Partial<Tab> = {}): Tab {
  return { label, pane, view: 'agent', hasUnread: false, ...over } as unknown as Tab;
}

describe('focusedPane', () => {
  it('answers the pane the active tab sits in', () => {
    expect(focusedPane([tab('a', 'right')], 0)).toBe('right');
  });

  // Focus can be left pointing at an index that has since closed, or at a tab that is no longer an
  // action tab at all. Neither has a pane, so the center falls back to the left rather than reporting
  // a pane the user is not looking at.
  it('answers the left pane for an index that names nothing focusable', () => {
    expect(focusedPane([tab('a', 'right')], 5)).toBe('left');
    expect(focusedPane([tab('docked', 'right', { dock: 'left' })], 0)).toBe('left');
    expect(focusedPane([tab('reporting', 'right', { view: 'monitor' })], 0)).toBe('left');
  });
});

describe('recentLabel', () => {
  const eligible = () => true;

  it('answers the most recent label in the focus history that still holds a tab', () => {
    const tabs = [tab('a'), tab('b'), tab('c')];
    expect(recentLabel(tabs, ['a', 'b', 'c'], eligible)).toBe('c');
  });

  // History outlives the tabs in it: a closed tab, one the caller excluded, and one that no longer
  // qualifies each have to be stepped over rather than answered.
  it('steps over a history entry whose tab is gone, excluded, or ineligible', () => {
    const tabs = [tab('a'), tab('b'), tab('c')];
    expect(recentLabel(tabs, ['a', 'gone', 'b'], eligible)).toBe('b');
    expect(recentLabel(tabs, ['a', 'b', 'c'], eligible, 'c')).toBe('b');
    expect(recentLabel(tabs, ['a', 'b', 'c'], (t) => t.label !== 'c')).toBe('b');
  });

  it('falls back to the first eligible tab when the history answers nothing', () => {
    const tabs = [tab('a'), tab('b')];
    expect(recentLabel(tabs, ['gone'], eligible)).toBe('a');
    expect(recentLabel(tabs, [], eligible)).toBe('a');
  });

  it('answers nothing when no tab is eligible', () => {
    expect(recentLabel([tab('a')], ['a'], () => false)).toBeUndefined();
    expect(recentLabel([], ['a'], eligible)).toBeUndefined();
  });

  it('excludes the caller\'s own tab from the fallback too', () => {
    const tabs = [tab('a'), tab('b')];
    expect(recentLabel(tabs, [], eligible, 'a')).toBe('b');
  });
});

describe('repairPaneSelections', () => {
  // Focus has to land somewhere real. When the index it was left pointing at no longer names a
  // center action tab, the first left-pane tab is what the pane split is anchored on.
  it('moves the active index to the first left-pane tab when it names nothing focusable', () => {
    const tabs = [tab('left-1', 'left'), tab('right-1', 'right'), tab('docked', 'left', { dock: 'right' })];
    const result = repairPaneSelections(tabs, 2);
    expect(result.activeTab).toBe(0);
    expect(result.secondaryTabLabel).toBe('right-1');
  });

  it('keeps a secondary that is already in the pane opposite the active one', () => {
    const tabs = [tab('left-1', 'left'), tab('right-1', 'right'), tab('right-2', 'right')];
    const result = repairPaneSelections(tabs, 0, 'right-2');
    expect(result).toEqual({ activeTab: 0, secondaryTabLabel: 'right-2' });
  });

  // A secondary sitting in the same pane as the active tab would leave the other pane blank, so it
  // is replaced by whichever tab does occupy the opposite one.
  it('replaces a secondary that sits in the active tab\'s own pane', () => {
    const tabs = [tab('left-1', 'left'), tab('left-2', 'left'), tab('right-1', 'right')];
    const result = repairPaneSelections(tabs, 0, 'left-2');
    expect(result.secondaryTabLabel).toBe('right-1');
  });

  it('replaces a secondary that is the active tab itself', () => {
    const tabs = [tab('left-1', 'left'), tab('right-1', 'right')];
    expect(repairPaneSelections(tabs, 0, 'left-1').secondaryTabLabel).toBe('right-1');
  });

  // With one pane empty there is no split to repair, so the assignment is dropped entirely and every
  // center tab goes back to the default pane.
  it('clears the pane assignment when only one pane holds tabs', () => {
    const tabs = [tab('a', 'left'), tab('b', 'left'), tab('docked', 'left', { dock: 'right' })];
    const result = repairPaneSelections(tabs, 0, 'b');
    expect(result).toEqual({ activeTab: 0, secondaryTabLabel: undefined });
    expect(tabs[0].pane).toBeUndefined();
    expect(tabs[1].pane).toBeUndefined();
    expect(tabs[2].pane).toBe('left');
  });

  // Whichever tabs the repair leaves showing are the ones the user is looking at, so their unread
  // marks have to go with them.
  it('clears the unread mark on the active tab and on the tab it leaves showing', () => {
    const tabs = [
      tab('left-1', 'left', { hasUnread: true }),
      tab('right-1', 'right', { hasUnread: true }),
      tab('right-2', 'right', { hasUnread: true }),
    ];
    repairPaneSelections(tabs, 0, 'right-2');
    expect(tabs[0].hasUnread).toBe(false);
    expect(tabs[1].hasUnread).toBe(true);
    expect(tabs[2].hasUnread).toBe(false);
  });
});
