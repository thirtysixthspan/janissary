import { describe, it, expect } from 'vitest';
import { insertTabInGroup } from './tab-utils.js';
import type { Tab } from './types.js';

const makeTab = (label: string, group: number): Tab => ({
  label, dotColor: '#fff', number: 0, group, groupColor: '#fff',
  log: [], cmdHistory: [], cmdHistoryIdx: -1, scrollOffset: 0,
});

describe('insertTabInGroup', () => {
  it('inserts at end of group by default', () => {
    const tabs = [makeTab('a', 1), makeTab('b', 1)];
    const result = insertTabInGroup(tabs, makeTab('c', 1));
    expect(result.map((t) => t.label)).toEqual(['a', 'b', 'c']);
  });

  it('inserts at start of group when position is start', () => {
    const tabs = [makeTab('a', 1), makeTab('b', 1)];
    const result = insertTabInGroup(tabs, makeTab('c', 1), 'start');
    expect(result.map((t) => t.label)).toEqual(['c', 'a', 'b']);
  });

  it('inserts at start of specific group when multiple groups exist', () => {
    const tabs = [makeTab('a', 1), makeTab('b', 2), makeTab('c', 2)];
    const result = insertTabInGroup(tabs, makeTab('d', 2), 'start');
    expect(result.map((t) => t.label)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('inserts at end when group has no members yet', () => {
    const tabs = [makeTab('a', 1)];
    const result = insertTabInGroup(tabs, makeTab('b', 2), 'start');
    expect(result.map((t) => t.label)).toEqual(['a', 'b']);
  });
});
