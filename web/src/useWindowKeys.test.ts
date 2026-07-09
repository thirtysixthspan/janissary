import { render } from '@testing-library/react';
import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useWindowKeys } from './useWindowKeys';

function dispatchKey(key: string, opts: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean } = {}) {
  globalThis.dispatchEvent(new KeyboardEvent('keydown', {
    key, metaKey: opts.metaKey ?? false, ctrlKey: opts.ctrlKey ?? false, shiftKey: opts.shiftKey ?? false, bubbles: true,
  }));
}

function TestComponent({
  route, themePickerOpen, pickerOpen, navOpen, queueOpen, taskPickerOpen, canSearch, searchOpen, handleScrollKey, callbacks,
}: {
  route?: { cmd: string; choices: string[] } | null;
  themePickerOpen?: boolean;
  pickerOpen?: boolean;
  navOpen?: boolean;
  queueOpen?: boolean;
  taskPickerOpen?: boolean;
  canSearch?: boolean;
  searchOpen?: boolean;
  handleScrollKey?: (e: KeyboardEvent) => boolean;
  callbacks?: Partial<{
    setRouteIndex: (s: (p: number) => number) => void;
    chooseRoute: (i: number) => void;
    runCommand: (t: string) => void;
    setPickerIndex: (s: (p: number) => number) => void;
    setPickerOpen: (o: boolean) => void;
    openPicker: () => void;
    openSearch: () => void;
    setThemePickerIndex: (s: (p: number) => number) => void;
    setThemePickerOpen: (o: boolean) => void;
    pickTheme: (n: string) => void;
    setNavIndex: (s: (p: number) => number) => void;
    setNavQuery: (q: string) => void;
    selectNavTab: (i: number) => void;
    setNavOpen: (o: boolean) => void;
    openTabNav: () => void;
    setQueueIndex: (s: (p: number) => number) => void;
    setQueueOpen: (o: boolean) => void;
    openQueue: () => void;
    setTaskPickerIndex: (s: (p: number) => number) => void;
    setTaskPickerOpen: (o: boolean) => void;
    openTaskPicker: () => void;
    pickTask: (n: string) => void;
  }>;
}) {
  const stateRef = useRef({
    pickerOpen: pickerOpen ?? false,
    pickerIdx: 0,
    recent: ['cmd1', 'cmd2'],
    route: route ?? null,
    routeIdx: 0,
    canSearch: canSearch ?? true,
    searchOpen: searchOpen ?? false,
    themePickerOpen: themePickerOpen ?? false,
    themePickerIdx: 0,
    navOpen: navOpen ?? false,
    navQuery: '',
    navIdx: 0,
    navTabs: [],
    queueOpen: queueOpen ?? false,
    queueIdx: 0,
    queueItems: ['q1', 'q2'],
    taskPickerOpen: taskPickerOpen ?? false,
    taskPickerIdx: 0,
    tasks: ['build-a-feature.md', 'fix-a-small-issue.md'],
  });
  const cb = {
    setRouteIndex: vi.fn(),
    chooseRoute: vi.fn(),
    runCommand: vi.fn(),
    setPickerIndex: vi.fn(),
    setPickerOpen: vi.fn(),
    openPicker: vi.fn(),
    openSearch: vi.fn(),
    setThemePickerIndex: vi.fn(),
    setThemePickerOpen: vi.fn(),
    pickTheme: vi.fn(),
    setNavIndex: vi.fn(),
    setNavQuery: vi.fn(),
    selectNavTab: vi.fn(),
    setNavOpen: vi.fn(),
    openTabNav: vi.fn(),
    setQueueIndex: vi.fn(),
    setQueueOpen: vi.fn(),
    openQueue: vi.fn(),
    setTaskPickerIndex: vi.fn(),
    setTaskPickerOpen: vi.fn(),
    openTaskPicker: vi.fn(),
    pickTask: vi.fn(),
    ...callbacks,
  };
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const client = { send: vi.fn() } as never;
  useWindowKeys(client, stateRef as never, cbRef as never, handleScrollKey ?? vi.fn(() => false), vi.fn());
  return null;
}

describe('useWindowKeys', () => {
  it('routes keys to route chooser when a route is open', () => {
    render(React.createElement(TestComponent, { route: { cmd: 'run', choices: ['shell'] } }));
    dispatchKey('ArrowDown');
  });

  it('routes keys to theme picker when open', () => {
    render(React.createElement(TestComponent, { themePickerOpen: true }));
    dispatchKey('ArrowDown');
  });

  it('routes keys to history picker when open', () => {
    render(React.createElement(TestComponent, { pickerOpen: true }));
    dispatchKey('ArrowDown');
  });

  it('Cmd+F opens search when canSearch is true', () => {
    const openSearch = vi.fn();
    render(React.createElement(TestComponent, { callbacks: { openSearch } }));
    dispatchKey('f', { metaKey: true });
    expect(openSearch).toHaveBeenCalled();
  });

  it('Cmd+F does nothing when canSearch is false', () => {
    const openSearch = vi.fn();
    render(React.createElement(TestComponent, { canSearch: false, callbacks: { openSearch } }));
    dispatchKey('f', { metaKey: true });
    expect(openSearch).not.toHaveBeenCalled();
  });

  it('does not reopen search if already open', () => {
    const openSearch = vi.fn();
    render(React.createElement(TestComponent, { searchOpen: true, callbacks: { openSearch } }));
    dispatchKey('f', { metaKey: true });
    expect(openSearch).not.toHaveBeenCalled();
  });

  it('Ctrl+R opens the history picker', () => {
    const openPicker = vi.fn();
    render(React.createElement(TestComponent, { callbacks: { openPicker } }));
    dispatchKey('r', { ctrlKey: true });
    expect(openPicker).toHaveBeenCalled();
  });

  it('Ctrl+G opens the tab navigator', () => {
    const openTabNav = vi.fn();
    render(React.createElement(TestComponent, { callbacks: { openTabNav } }));
    dispatchKey('g', { ctrlKey: true });
    expect(openTabNav).toHaveBeenCalled();
  });

  it('Ctrl+E opens the queue popup', () => {
    const openQueue = vi.fn();
    render(React.createElement(TestComponent, { callbacks: { openQueue } }));
    dispatchKey('e', { ctrlKey: true });
    expect(openQueue).toHaveBeenCalled();
  });

  it('Ctrl+A opens the task picker', () => {
    const openTaskPicker = vi.fn();
    render(React.createElement(TestComponent, { callbacks: { openTaskPicker } }));
    dispatchKey('a', { ctrlKey: true });
    expect(openTaskPicker).toHaveBeenCalled();
  });

  it('routes Arrow keys to the task picker when open', () => {
    const setTaskPickerIndex = vi.fn();
    render(React.createElement(TestComponent, { taskPickerOpen: true, callbacks: { setTaskPickerIndex } }));
    dispatchKey('ArrowDown');
    expect(setTaskPickerIndex).toHaveBeenCalled();
  });

  it('routes Enter to pickTask (populate) when the task picker is open', () => {
    const pickTask = vi.fn();
    render(React.createElement(TestComponent, { taskPickerOpen: true, callbacks: { pickTask } }));
    dispatchKey('Enter');
    expect(pickTask).toHaveBeenCalledWith('build-a-feature.md');
  });

  it('Cmd+T runs the agent command to open a new root-project tab', () => {
    const runCommand = vi.fn();
    render(React.createElement(TestComponent, { callbacks: { runCommand } }));
    dispatchKey('t', { metaKey: true });
    expect(runCommand).toHaveBeenCalledWith('agent');
  });

  it('Ctrl+T does not run the Cmd+T new-tab action', () => {
    const runCommand = vi.fn();
    const sendMock = vi.fn();
    const client = { send: sendMock } as never;
    function C() {
      const stateRef = useRef({
        pickerOpen: false, pickerIdx: 0, recent: [], route: null, routeIdx: 0, canSearch: true, searchOpen: false,
        themePickerOpen: false, themePickerIdx: 0, navOpen: false, navQuery: '', navIdx: 0, navTabs: [],
        queueOpen: false, queueIdx: 0, queueItems: [],
      });
      const cb = {
        setRouteIndex: vi.fn(), chooseRoute: vi.fn(), runCommand, setPickerIndex: vi.fn(), setPickerOpen: vi.fn(),
        openPicker: vi.fn(), openSearch: vi.fn(), setThemePickerIndex: vi.fn(), setThemePickerOpen: vi.fn(), pickTheme: vi.fn(),
        setNavIndex: vi.fn(), setNavQuery: vi.fn(), selectNavTab: vi.fn(), setNavOpen: vi.fn(), openTabNav: vi.fn(),
        setQueueIndex: vi.fn(), setQueueOpen: vi.fn(), openQueue: vi.fn(),
      };
      const cbRef = useRef(cb);
      cbRef.current = cb;
      useWindowKeys(client, stateRef as never, cbRef as never, vi.fn(() => false), vi.fn());
      return null;
    }
    render(React.createElement(C));
    dispatchKey('t', { ctrlKey: true });
    expect(runCommand).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledWith({ method: 'toggleCollapse', params: {} });
  });

  it('routes keys to the queue popup when open', () => {
    const setQueueIndex = vi.fn();
    render(React.createElement(TestComponent, { queueOpen: true, callbacks: { setQueueIndex } }));
    dispatchKey('ArrowDown');
    expect(setQueueIndex).toHaveBeenCalled();
  });

  it('routes keys to the tab navigator when open, instead of falling through to tab shortcuts', () => {
    const setNavIndex = vi.fn();
    const sendMock = vi.fn();
    const client = { send: sendMock } as never;
    function C() {
      const stateRef = useRef({
        pickerOpen: false, pickerIdx: 0, recent: [], route: null, routeIdx: 0, canSearch: true, searchOpen: false,
        themePickerOpen: false, themePickerIdx: 0, navOpen: true, navQuery: '', navIdx: 0, navTabs: [],
      });
      const cb = {
        setRouteIndex: vi.fn(), chooseRoute: vi.fn(), runCommand: vi.fn(), setPickerIndex: vi.fn(), setPickerOpen: vi.fn(),
        openPicker: vi.fn(), openSearch: vi.fn(), setThemePickerIndex: vi.fn(), setThemePickerOpen: vi.fn(), pickTheme: vi.fn(),
        setNavIndex, setNavQuery: vi.fn(), selectNavTab: vi.fn(), setNavOpen: vi.fn(), openTabNav: vi.fn(),
      };
      const cbRef = useRef(cb);
      cbRef.current = cb;
      useWindowKeys(client, stateRef as never, cbRef as never, vi.fn(() => false), vi.fn());
      return null;
    }
    render(React.createElement(C));
    dispatchKey('ArrowDown');
    expect(setNavIndex).toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('delegates to scroll handler when search is closed', () => {
    const scrollFn = vi.fn(() => true);
    render(React.createElement(TestComponent, { handleScrollKey: scrollFn }));
    dispatchKey('PageDown');
    expect(scrollFn).toHaveBeenCalled();
  });

  it('skips scroll handler when search is open', () => {
    const scrollFn = vi.fn(() => true);
    render(React.createElement(TestComponent, { searchOpen: true, handleScrollKey: scrollFn }));
    dispatchKey('PageDown');
    expect(scrollFn).not.toHaveBeenCalled();
  });

  it('does nothing when state is null', () => {
    const client = { send: vi.fn() };
    const stateRef = { current: null } as never;
    const cbRef = { current: null } as never;
    function C() {
      useWindowKeys(client as never, stateRef, cbRef, vi.fn(() => false), vi.fn());
      return null;
    }
    render(React.createElement(C));
    dispatchKey('ArrowLeft', { ctrlKey: true });
    expect(client.send).not.toHaveBeenCalled();
  });

  it('registers and cleans up event listeners', () => {
    const addSpy = vi.spyOn(globalThis, 'addEventListener');
    const removeSpy = vi.spyOn(globalThis, 'removeEventListener');
    const { unmount } = render(React.createElement(TestComponent, {}));
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
