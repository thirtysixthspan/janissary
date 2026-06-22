import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { useInputHandler, type InputHandlerDeps } from './useInputHandler.js';
import { makeTab, type Tab, type LogEntry } from './tab.js';

// Enough entries that the flattened buffer exceeds the visible height (so there is
// somewhere to scroll).
const sampleLog: LogEntry[] = Array.from({ length: 5 }, (_, i) => ({ input: `cmd${i}`, output: `out${i}` }));

const Harness = ({ deps }: { deps: InputHandlerDeps }) => {
  useInputHandler(deps);
  return null;
};

const makeDeps = (over: Partial<InputHandlerDeps> = {}): InputHandlerDeps => ({
  input: '',
  cursor: 0,
  setInput: vi.fn(),
  setCursor: vi.fn(),
  tabs: [makeTab('janus', '#fff', 1)],
  activeTab: 0,
  setTabs: vi.fn(),
  setActiveTab: vi.fn(),
  updateCurrentTab: vi.fn(),
  executeRef: { current: null },
  shellsRef: { current: new Map() },
  visibleHeight: 2,
  exit: vi.fn(),
  historyPickerOpen: false,
  historyPickerIdx: 0,
  setHistoryPickerOpen: vi.fn(),
  setHistoryPickerIdx: vi.fn(),
  frequentHistory: [],
  flashScrollBoundary: vi.fn(),
  interactive: false,
  cwd: '/tmp',
  agents: [],
  connections: [],
  ...over,
});

const tabWith = (scrollOffset: number): Tab => ({ ...makeTab('janus', '#fff', 1), log: sampleLog, scrollOffset });

const press = async (seq: string, deps: InputHandlerDeps) => {
  const { stdin, unmount } = render(<Harness deps={deps} />);
  await new Promise((r) => setTimeout(r, 20));
  stdin.write(seq);
  await new Promise((r) => setTimeout(r, 20));
  unmount();
};

// Escape sequences for modified arrow keys: ESC [ 1 ; <mod> <dir>  (mod 2=shift, 5=ctrl)
const SHIFT_UP = '[1;2A';
const CTRL_UP = '[1;5A';
const SHIFT_DOWN = '[1;2B';
const CTRL_DOWN = '[1;5B';

describe('transcript scrolling', () => {
  it('scrolls up on Shift+Up', async () => {
    const updateCurrentTab = vi.fn();
    await press(SHIFT_UP, makeDeps({ updateCurrentTab }));
    expect(updateCurrentTab).toHaveBeenCalledTimes(1);
    const updater = updateCurrentTab.mock.calls[0][0] as (t: Tab) => Tab;
    expect(updater(tabWith(0)).scrollOffset).toBe(1);
  });

  it('scrolls up on Ctrl+Up', async () => {
    const updateCurrentTab = vi.fn();
    await press(CTRL_UP, makeDeps({ updateCurrentTab }));
    expect(updateCurrentTab).toHaveBeenCalledTimes(1);
    const updater = updateCurrentTab.mock.calls[0][0] as (t: Tab) => Tab;
    expect(updater(tabWith(0)).scrollOffset).toBe(1);
  });

  it('scrolls down on Shift+Down', async () => {
    const updateCurrentTab = vi.fn();
    await press(SHIFT_DOWN, makeDeps({ updateCurrentTab }));
    expect(updateCurrentTab).toHaveBeenCalledTimes(1);
    const updater = updateCurrentTab.mock.calls[0][0] as (t: Tab) => Tab;
    expect(updater(tabWith(2)).scrollOffset).toBe(1);
  });

  it('scrolls down on Ctrl+Down', async () => {
    const updateCurrentTab = vi.fn();
    await press(CTRL_DOWN, makeDeps({ updateCurrentTab }));
    expect(updateCurrentTab).toHaveBeenCalledTimes(1);
    const updater = updateCurrentTab.mock.calls[0][0] as (t: Tab) => Tab;
    expect(updater(tabWith(2)).scrollOffset).toBe(1);
  });

  it('does not scroll past the top and flashes the boundary', async () => {
    const updateCurrentTab = vi.fn();
    const flashScrollBoundary = vi.fn();
    await press(SHIFT_UP, makeDeps({ updateCurrentTab, flashScrollBoundary }));
    const updater = updateCurrentTab.mock.calls[0][0] as (t: Tab) => Tab;
    const maxed = tabWith(999); // already scrolled beyond max offset
    expect(updater(maxed)).toBe(maxed); // unchanged
    expect(flashScrollBoundary).toHaveBeenCalled();
  });

  it('does not scroll past the bottom and flashes the boundary', async () => {
    const updateCurrentTab = vi.fn();
    const flashScrollBoundary = vi.fn();
    await press(CTRL_DOWN, makeDeps({ updateCurrentTab, flashScrollBoundary }));
    const updater = updateCurrentTab.mock.calls[0][0] as (t: Tab) => Tab;
    const atBottom = tabWith(0);
    expect(updater(atBottom)).toBe(atBottom); // unchanged
    expect(flashScrollBoundary).toHaveBeenCalled();
  });
});
