import { describe, it, expect, vi } from 'vitest';
import { handleTabNavKey } from './tab-nav-keys';
import type { TabView } from '@shared/protocol';
import type { TabNavEntry } from './tab-nav-match';

function fakeEvent(key: string, opts: { ctrlKey?: boolean; metaKey?: boolean } = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ctrlKey: opts.ctrlKey ?? false, metaKey: opts.metaKey ?? false });
}

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'janus', number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    ...overrides,
  };
}

function makeNavTabs(): TabNavEntry[] {
  return [{ tab: makeTab({ label: 'one' }), index: 0 }, { tab: makeTab({ label: 'two', number: 2 }), index: 1 }];
}

describe('handleTabNavKey', () => {
  it('moves the selection with ArrowUp/ArrowDown, clamped to the list', () => {
    const setIdx = vi.fn();
    handleTabNavKey(fakeEvent('ArrowDown'), makeNavTabs(), 0, setIdx, vi.fn(), vi.fn(), '', vi.fn());
    let fn = setIdx.mock.calls[0][0] as (n: number) => number;
    expect(fn(0)).toBe(1);
    expect(fn(1)).toBe(1);

    setIdx.mockClear();
    handleTabNavKey(fakeEvent('ArrowUp'), makeNavTabs(), 1, setIdx, vi.fn(), vi.fn(), '', vi.fn());
    fn = setIdx.mock.calls[0][0] as (n: number) => number;
    expect(fn(1)).toBe(0);
    expect(fn(0)).toBe(0);
  });

  it('moves the selection with Ctrl+N/Ctrl+P', () => {
    const setIdx = vi.fn();
    handleTabNavKey(fakeEvent('n', { ctrlKey: true }), makeNavTabs(), 0, setIdx, vi.fn(), vi.fn(), '', vi.fn());
    expect((setIdx.mock.calls[0][0] as (n: number) => number)(0)).toBe(1);

    setIdx.mockClear();
    handleTabNavKey(fakeEvent('p', { ctrlKey: true }), makeNavTabs(), 1, setIdx, vi.fn(), vi.fn(), '', vi.fn());
    expect((setIdx.mock.calls[0][0] as (n: number) => number)(1)).toBe(0);
  });

  it('selects the highlighted tab and closes on Enter', () => {
    const selectNavTab = vi.fn();
    const setNavOpen = vi.fn();
    handleTabNavKey(fakeEvent('Enter'), makeNavTabs(), 1, vi.fn(), selectNavTab, setNavOpen, '', vi.fn());
    expect(selectNavTab).toHaveBeenCalledWith(1);
    expect(setNavOpen).toHaveBeenCalledWith(false);
  });

  it('closes without selecting on Escape', () => {
    const selectNavTab = vi.fn();
    const setNavOpen = vi.fn();
    handleTabNavKey(fakeEvent('Escape'), makeNavTabs(), 0, vi.fn(), selectNavTab, setNavOpen, '', vi.fn());
    expect(selectNavTab).not.toHaveBeenCalled();
    expect(setNavOpen).toHaveBeenCalledWith(false);
  });

  it('closes on Ctrl+G (toggle)', () => {
    const setNavOpen = vi.fn();
    handleTabNavKey(fakeEvent('g', { ctrlKey: true }), makeNavTabs(), 0, vi.fn(), vi.fn(), setNavOpen, '', vi.fn());
    expect(setNavOpen).toHaveBeenCalledWith(false);
  });

  it('trims the query on Backspace', () => {
    const setNavQuery = vi.fn();
    handleTabNavKey(fakeEvent('Backspace'), makeNavTabs(), 0, vi.fn(), vi.fn(), vi.fn(), 'dep', setNavQuery);
    expect(setNavQuery).toHaveBeenCalledWith('de');
  });

  it('appends a printable character to the query and resets the index', () => {
    const setNavQuery = vi.fn();
    const setNavIndex = vi.fn();
    handleTabNavKey(fakeEvent('x'), makeNavTabs(), 1, setNavIndex, vi.fn(), vi.fn(), 'de', setNavQuery);
    expect(setNavQuery).toHaveBeenCalledWith('dex');
    expect((setNavIndex.mock.calls[0][0] as (n: number) => number)(1)).toBe(0);
  });

  it('ignores modifier-only combinations it does not recognize', () => {
    const setNavQuery = vi.fn();
    handleTabNavKey(fakeEvent('a', { metaKey: true }), makeNavTabs(), 0, vi.fn(), vi.fn(), vi.fn(), '', setNavQuery);
    expect(setNavQuery).not.toHaveBeenCalled();
  });
});
