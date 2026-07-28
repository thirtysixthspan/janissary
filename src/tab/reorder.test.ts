import { describe, expect, it } from 'vitest';
import type { Tab } from '../types.js';
import { computeReorderTo } from './reorder.js';

const makeTab = (label: string, group: number, extra: Partial<Tab> = {}): Tab => ({
  label, dotColor: '#fff', number: 0, group, groupColor: '#fff',
  log: [], cmdHistory: [], cmdHistoryIdx: -1, scrollOffset: 0, ...extra,
});

describe('computeReorderTo', () => {
  it.each([
    [2, 0, ['c', 'a', 'b']],
    [0, 2, ['b', 'c', 'a']],
  ])('moves a tab from %i to %i within its group', (from, to, labels) => {
    const result = computeReorderTo(
      [makeTab('a', 1), makeTab('b', 1), makeTab('c', 1)], from, to,
    );
    expect(result?.tabs.map((tab) => tab.label)).toEqual(labels);
    expect(result?.activeTab).toBe(to);
  });

  it('rejects a destination in another group', () => {
    const result = computeReorderTo(
      [makeTab('a', 1), makeTab('b', 1), makeTab('c', 2)], 0, 2,
    );
    expect(result).toBeUndefined();
  });

  it.each([
    [-1, 0],
    [0, -1],
    [3, 0],
    [0, 3],
    [1, 1],
  ])('returns undefined for from %i and to %i', (from, to) => {
    const tabs = [makeTab('a', 1), makeTab('b', 1), makeTab('c', 1)];
    expect(computeReorderTo(tabs, from, to)).toBeUndefined();
  });

  it('renumbers tabs by their resulting positions', () => {
    const result = computeReorderTo(
      [makeTab('a', 1), makeTab('b', 1), makeTab('c', 1)], 2, 0,
    );
    expect(result?.tabs.map((tab) => tab.number)).toEqual([1, 2, 3]);
  });

  it('accepts a docked tab moving past tabs in other groups', () => {
    const result = computeReorderTo(
      [makeTab('a', 1, { dock: 'left' }), makeTab('b', 2), makeTab('c', 3)], 0, 2,
    );
    expect(result?.tabs.map((tab) => tab.label)).toEqual(['b', 'c', 'a']);
  });

  it('accepts group-0 reporting tabs moving among themselves', () => {
    const result = computeReorderTo(
      [makeTab('a', 0, { view: 'monitor' }), makeTab('b', 0, { view: 'monitor' })], 1, 0,
    );
    expect(result?.tabs.map((tab) => tab.label)).toEqual(['b', 'a']);
  });
});
