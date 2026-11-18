import { describe, expect, it } from 'vitest';
import type { CenterPane, Tab } from './types.js';
import { selectSurvivor } from './survivor.js';

function tab(label: string, pane?: CenterPane, over: Partial<Tab> = {}): Tab {
  return { label, pane, view: 'agent', ...over } as unknown as Tab;
}

describe('selectSurvivor', () => {
  it('answers the first candidate that is an eligible tab in the pane', () => {
    expect(selectSurvivor([tab('a'), tab('b'), tab('c')], 'left', ['c', 'b'], [])).toBe('c');
  });

  it('skips a candidate that is missing or sits in the other pane', () => {
    const tabs = [tab('a'), tab('b'), tab('c', 'right')];
    expect(selectSurvivor(tabs, 'left', ['c', 'gone', 'b'], [])).toBe('b');
  });

  it('falls back to the most recent eligible label in the focus history', () => {
    const tabs = [tab('a'), tab('b'), tab('c')];
    expect(selectSurvivor(tabs, 'left', [], ['a', 'c', 'b'])).toBe('b');
  });

  it('falls back to the first eligible tab when nothing else matches', () => {
    expect(selectSurvivor([tab('a'), tab('b')], 'left', [], ['gone'])).toBe('a');
  });

  it('never selects a notification tab or a tab outside the pane', () => {
    const tabs = [tab('note', 'left', { view: 'notifications' }), tab('other', 'right')];
    expect(selectSurvivor(tabs, 'left', ['note'], ['note'])).toBeUndefined();
    expect(selectSurvivor(tabs, 'left', ['other'], ['other'])).toBeUndefined();
  });
});
