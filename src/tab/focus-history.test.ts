import { describe, it, expect } from 'vitest';
import { mostRecentFileNavigatorLabel, popFocusHistory, recordLeavingActiveTab } from './focus-history.js';
import type { Tab } from './types.js';

// Three small pure functions TabManager's state is built on. They are exercised indirectly by the
// manager's own tests, but nothing pins the edges directly: a stale history entry, a docked tab, an
// active index naming nothing. Each of those decides where focus lands when a tab closes.

function tab(label: string, overrides: Partial<Tab> = {}): Tab {
  return { label, ...overrides } as unknown as Tab;
}

const TABS = [tab('janus'), tab('notes', { view: 'files' }), tab('src', { view: 'files', dock: 'left' })];

describe('recordLeavingActiveTab', () => {
  it('puts the tab that is losing focus at the end of the history', () => {
    expect(recordLeavingActiveTab(TABS, 0, [], 1)).toEqual(['janus']);
  });

  it('moves a label already on the history rather than recording it twice', () => {
    expect(recordLeavingActiveTab(TABS, 0, ['janus', 'notes'], 2)).toEqual(['notes', 'janus']);
  });

  it('records nothing when the destination is already the active tab', () => {
    const history = ['notes'];
    expect(recordLeavingActiveTab(TABS, 1, history, 1)).toBe(history);
  });

  // Closing or focusing past the end of the strip leaves nothing to remember, and pushing an empty
  // label would put a hole in the history that `popFocusHistory` could never resolve.
  it('records nothing when the active index names no tab', () => {
    const history = ['notes'];
    expect(recordLeavingActiveTab(TABS, 7, history, 0)).toBe(history);
  });
});

describe('popFocusHistory', () => {
  it('resolves the most recent history entry that is still open and undocked', () => {
    expect(popFocusHistory(TABS, ['notes'])).toEqual({ index: 1, history: [] });
  });

  it('discards a closed entry and keeps looking further back', () => {
    expect(popFocusHistory(TABS, ['notes', 'gone'])).toEqual({ index: 1, history: [] });
  });

  it('leaves entries it never reached still on the history', () => {
    expect(popFocusHistory(TABS, ['gone', 'notes'])).toEqual({ index: 1, history: ['gone'] });
  });

  it('skips a docked tab, which has no place to take focus', () => {
    expect(popFocusHistory(TABS, ['notes', 'src'])).toEqual({ index: 1, history: [] });
  });

  it('answers nothing when every entry is stale or docked', () => {
    expect(popFocusHistory(TABS, ['src', 'gone'])).toEqual({ index: undefined, history: [] });
  });

  it('leaves the caller\'s history untouched', () => {
    const history = ['notes', 'gone'];
    popFocusHistory(TABS, history);
    expect(history).toEqual(['notes', 'gone']);
  });

  it('honours an eligibility rule the caller supplies', () => {
    expect(popFocusHistory(TABS, ['notes'], () => false)).toEqual({ index: undefined, history: [] });
    expect(popFocusHistory(TABS, ['src'], (candidate) => candidate.view === 'files'))
      .toEqual({ index: 2, history: [] });
  });
});

describe('mostRecentFileNavigatorLabel', () => {
  it('prefers the most recently left tab that is a file navigator', () => {
    expect(mostRecentFileNavigatorLabel(TABS, ['notes', 'janus'])).toBe('notes');
  });

  it('skips a history entry naming a tab that is not a navigator', () => {
    expect(mostRecentFileNavigatorLabel(TABS, ['janus', 'notes'])).toBe('notes');
  });

  // A docked tree is a valid retarget target, so unlike `popFocusHistory` this one keeps it.
  it('accepts a docked navigator, which the retarget button can still aim at', () => {
    expect(mostRecentFileNavigatorLabel(TABS, ['src'])).toBe('src');
  });

  // A tree that never lost focus since opening is in no history entry at all.
  it('falls back to the first navigator in tab order when the history names none', () => {
    expect(mostRecentFileNavigatorLabel([tab('janus'), ...TABS.slice(1)], [])).toBe('notes');
  });

  it('answers nothing when no tab is a navigator', () => {
    expect(mostRecentFileNavigatorLabel([tab('janus')], ['janus'])).toBeUndefined();
  });
});
