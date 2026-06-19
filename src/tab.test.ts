import { describe, it, expect } from 'vitest';
import { makeTab, swapTabsLeft, swapTabsRight, renumberTabs } from './tab.js';

describe('swapTabsLeft', () => {
  it('swaps tab at idx with its left neighbor', () => {
    const tabs = [makeTab('a', '#red', 1), makeTab('b', '#blue', 2), makeTab('c', '#green', 3)];
    const result = swapTabsLeft(tabs, 1);
    expect(result[0].label).toBe('b');
    expect(result[1].label).toBe('a');
    expect(result[2].label).toBe('c');
  });

  it('renumbers tabs after swap', () => {
    const tabs = [makeTab('a', '#red', 1), makeTab('b', '#blue', 2), makeTab('c', '#green', 3)];
    const result = swapTabsLeft(tabs, 1);
    expect(result[0].number).toBe(1);
    expect(result[1].number).toBe(2);
    expect(result[2].number).toBe(3);
  });

  it('returns same array for first tab (no-op)', () => {
    const tabs = [makeTab('a', '#red', 1), makeTab('b', '#blue', 2)];
    const result = swapTabsLeft(tabs, 0);
    expect(result).toBe(tabs);
  });

  it('returns same array for negative index (no-op)', () => {
    const tabs = [makeTab('a', '#red', 1)];
    const result = swapTabsLeft(tabs, -1);
    expect(result).toBe(tabs);
  });
});

describe('swapTabsRight', () => {
  it('swaps tab at idx with its right neighbor', () => {
    const tabs = [makeTab('a', '#red', 1), makeTab('b', '#blue', 2), makeTab('c', '#green', 3)];
    const result = swapTabsRight(tabs, 1);
    expect(result[0].label).toBe('a');
    expect(result[1].label).toBe('c');
    expect(result[2].label).toBe('b');
  });

  it('renumbers tabs after swap', () => {
    const tabs = [makeTab('a', '#red', 1), makeTab('b', '#blue', 2), makeTab('c', '#green', 3)];
    const result = swapTabsRight(tabs, 1);
    expect(result[0].number).toBe(1);
    expect(result[1].number).toBe(2);
    expect(result[2].number).toBe(3);
  });

  it('returns same array for last tab (no-op)', () => {
    const tabs = [makeTab('a', '#red', 1), makeTab('b', '#blue', 2)];
    const result = swapTabsRight(tabs, 1);
    expect(result).toBe(tabs);
  });

  it('returns same array for out-of-bounds index (no-op)', () => {
    const tabs = [makeTab('a', '#red', 1)];
    const result = swapTabsRight(tabs, 5);
    expect(result).toBe(tabs);
  });
});

describe('renumberTabs', () => {
  it('assigns sequential numbers starting at 1', () => {
    const tabs = [
      makeTab('a', '#red', 99),
      makeTab('b', '#blue', 88),
      makeTab('c', '#green', 77),
    ];
    const result = renumberTabs(tabs);
    expect(result[0].number).toBe(1);
    expect(result[1].number).toBe(2);
    expect(result[2].number).toBe(3);
  });

  it('preserves other tab properties', () => {
    const tabs = [makeTab('a', '#red', 1)];
    const result = renumberTabs(tabs);
    expect(result[0].label).toBe('a');
    expect(result[0].dotColor).toBe('#red');
  });
});
