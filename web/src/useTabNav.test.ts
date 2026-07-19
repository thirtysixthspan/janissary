import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { useTabNav } from './useTabNav';

function TestComponent({
  client, tabs, onHook,
}: {
  client: JanusClient; tabs: TabView[]; onHook: (hook: ReturnType<typeof useTabNav>) => void;
}) {
  const hook = useTabNav(client, tabs);
  onHook(hook);
  return null;
}

function makeTabs(overrides: Partial<TabView> = {}): TabView[] {
  return [
    { label: 'tab1', number: 1, dotColor: '', group: 0, groupColor: '', busy: false, hasUnread: false, cwd: '', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false, ...overrides },
  ];
}

describe('useTabNav', () => {
  it('openTabNav resets query and index and opens the nav', () => {
    let hook: ReturnType<typeof useTabNav> | undefined;
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = makeTabs();
    render(React.createElement(TestComponent, { client, tabs, onHook: (h) => { hook = h; } }));
    act(() => { hook!.setNavQuery('test'); hook!.setNavIndex(2); });
    act(() => hook!.openTabNav());
    expect(hook!.navOpen).toBe(true);
    expect(hook!.navQuery).toBe('');
    expect(hook!.navIndex).toBe(0);
  });

  it('openTabNavWithQuery sets query and opens the nav', () => {
    let hook: ReturnType<typeof useTabNav> | undefined;
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = makeTabs();
    render(React.createElement(TestComponent, { client, tabs, onHook: (h) => { hook = h; } }));
    act(() => hook!.openTabNavWithQuery('test'));
    expect(hook!.navOpen).toBe(true);
    expect(hook!.navQuery).toBe('test');
    expect(hook!.navIndex).toBe(0);
  });

  it('selectNavTab sends setActiveTab message and closes the nav', () => {
    let hook: ReturnType<typeof useTabNav> | undefined;
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const tabs = makeTabs();
    render(React.createElement(TestComponent, { client, tabs, onHook: (h) => { hook = h; } }));
    act(() => hook!.openTabNav());
    act(() => hook!.selectNavTab(0));
    expect(send).toHaveBeenCalledWith({ method: 'setActiveTab', params: { index: 0 } });
    expect(hook!.navOpen).toBe(false);
  });

  it('setNavIndex updates the index state', () => {
    let hook: ReturnType<typeof useTabNav> | undefined;
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = makeTabs();
    render(React.createElement(TestComponent, { client, tabs, onHook: (h) => { hook = h; } }));
    act(() => hook!.setNavIndex(3));
    expect(hook!.navIndex).toBe(3);
  });

  it('setNavQuery updates the query state', () => {
    let hook: ReturnType<typeof useTabNav> | undefined;
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = makeTabs();
    render(React.createElement(TestComponent, { client, tabs, onHook: (h) => { hook = h; } }));
    act(() => hook!.setNavQuery('search'));
    expect(hook!.navQuery).toBe('search');
  });

  it('navTabs computes filtered entries from tabs and query', () => {
    let hook: ReturnType<typeof useTabNav> | undefined;
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [
      makeTabs({ label: 'alpha', number: 1 })[0],
      makeTabs({ label: 'beta', number: 2 })[0],
    ];
    render(React.createElement(TestComponent, { client, tabs, onHook: (h) => { hook = h; } }));
    expect(hook!.navTabs).toHaveLength(2);
    act(() => hook!.setNavQuery('alpha'));
    expect(hook!.navTabs).toHaveLength(1);
    expect(hook!.navTabs[0].tab.label).toBe('alpha');
  });
});
