import { describe, it, expect, vi } from 'vitest';
import { handleRouteChooserKey, handlePickerKey, handleTabNavKey, handleQueueKey } from './keyboard-handlers';
import type { RouteChooserView, TabView } from '@shared/protocol';
import type { TabNavEntry } from './TabNavPicker';

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

function makeRoute(): RouteChooserView {
  return { cmd: 'route', choices: ['cmd1', 'cmd2', 'cmd3'] };
}

describe('handleRouteChooserKey', () => {
  it('returns false for an unhandled key', () => {
    const e = fakeEvent('a');
    expect(handleRouteChooserKey(e, makeRoute(), 0, vi.fn(), vi.fn())).toBe(false);
  });

  it('moves up on ArrowUp, clamped at 0', () => {
    const e = fakeEvent('ArrowUp');
    const setIdx = vi.fn();
    expect(handleRouteChooserKey(e, makeRoute(), 1, setIdx, vi.fn())).toBe(true);
    expect(setIdx).toHaveBeenCalledWith(expect.any(Function));
    const fn = setIdx.mock.calls[0][0] as (n: number) => number;
    expect(fn(1)).toBe(0);
    expect(fn(0)).toBe(0);
  });

  it('moves down on ArrowDown, clamped at length-1', () => {
    const e = fakeEvent('ArrowDown');
    const setIdx = vi.fn();
    expect(handleRouteChooserKey(e, makeRoute(), 0, setIdx, vi.fn())).toBe(true);
    const fn = setIdx.mock.calls[0][0] as (n: number) => number;
    expect(fn(0)).toBe(1);
    expect(fn(2)).toBe(2);
  });

  it('calls chooseRoute with current index on Enter', () => {
    const e = fakeEvent('Enter');
    const chooseRoute = vi.fn();
    handleRouteChooserKey(e, makeRoute(), 2, vi.fn(), chooseRoute);
    expect(chooseRoute).toHaveBeenCalledWith(2);
  });

  it('calls chooseRoute with -1 on Escape', () => {
    const e = fakeEvent('Escape');
    const chooseRoute = vi.fn();
    handleRouteChooserKey(e, makeRoute(), 0, vi.fn(), chooseRoute);
    expect(chooseRoute).toHaveBeenCalledWith(-1);
  });
});

describe('handlePickerKey', () => {
  it('returns false for an unhandled key', () => {
    const e = fakeEvent('a');
    expect(handlePickerKey(e, [], 0, vi.fn(), vi.fn(), vi.fn())).toBe(false);
  });

  it('moves up on ArrowUp, clamped at 0', () => {
    const e = fakeEvent('ArrowUp');
    const setIdx = vi.fn();
    handlePickerKey(e, ['a', 'b'], 1, setIdx, vi.fn(), vi.fn());
    const fn = setIdx.mock.calls[0][0] as (n: number) => number;
    expect(fn(1)).toBe(0);
    expect(fn(0)).toBe(0);
  });

  it('moves down on ArrowDown, clamped at length-1', () => {
    const e = fakeEvent('ArrowDown');
    const setIdx = vi.fn();
    handlePickerKey(e, ['a', 'b'], 0, setIdx, vi.fn(), vi.fn());
    const fn = setIdx.mock.calls[0][0] as (n: number) => number;
    expect(fn(0)).toBe(1);
    expect(fn(1)).toBe(1);
  });

  it('runs the command and closes picker on Enter', () => {
    const e = fakeEvent('Enter');
    const runCommand = vi.fn();
    const setPickerOpen = vi.fn();
    handlePickerKey(e, ['cmd1', 'cmd2'], 1, vi.fn(), runCommand, setPickerOpen);
    expect(runCommand).toHaveBeenCalledWith('cmd2');
    expect(setPickerOpen).toHaveBeenCalledWith(false);
  });

  it('closes the picker on Escape', () => {
    const e = fakeEvent('Escape');
    const setPickerOpen = vi.fn();
    handlePickerKey(e, [], 0, vi.fn(), vi.fn(), setPickerOpen);
    expect(setPickerOpen).toHaveBeenCalledWith(false);
  });
});

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

describe('handleQueueKey', () => {
  it('moves up on ArrowUp, clamped at 0', () => {
    const e = fakeEvent('ArrowUp');
    const setIdx = vi.fn();
    expect(handleQueueKey(e, ['a', 'b'], 1, setIdx, vi.fn())).toBe(true);
    const fn = setIdx.mock.calls[0][0] as (n: number) => number;
    expect(fn(1)).toBe(0);
    expect(fn(0)).toBe(0);
  });

  it('moves down on ArrowDown, clamped at length-1', () => {
    const e = fakeEvent('ArrowDown');
    const setIdx = vi.fn();
    expect(handleQueueKey(e, ['a', 'b'], 0, setIdx, vi.fn())).toBe(true);
    const fn = setIdx.mock.calls[0][0] as (n: number) => number;
    expect(fn(0)).toBe(1);
    expect(fn(1)).toBe(1);
  });

  it('Enter is a no-op: does not close, select, or run anything', () => {
    const setQueueOpen = vi.fn();
    expect(handleQueueKey(fakeEvent('Enter'), ['a'], 0, vi.fn(), setQueueOpen)).toBe(true);
    expect(setQueueOpen).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const setQueueOpen = vi.fn();
    expect(handleQueueKey(fakeEvent('Escape'), ['a'], 0, vi.fn(), setQueueOpen)).toBe(true);
    expect(setQueueOpen).toHaveBeenCalledWith(false);
  });

  it('returns false for printable keys and Backspace, so they fall through to the textarea', () => {
    expect(handleQueueKey(fakeEvent('x'), ['a'], 0, vi.fn(), vi.fn())).toBe(false);
    expect(handleQueueKey(fakeEvent('Backspace'), ['a'], 0, vi.fn(), vi.fn())).toBe(false);
  });
});
