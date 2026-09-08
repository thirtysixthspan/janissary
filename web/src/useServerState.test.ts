import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { RouteChooserView, StateEvent } from '@shared/protocol';
import { useServerState } from './useServerState';

type StateListener = Parameters<Parameters<typeof useServerState>[0]['onState']>[0];

const makeClient = () => {
  let listener: StateListener | undefined;
  return {
    onState: vi.fn((l: StateListener) => { listener = l; return () => {}; }),
    emitSnapshot: (snapshot: StateEvent) => listener?.(snapshot),
    emit: (route: RouteChooserView | null, secondary?: number) => {
      listener?.({
        t: 'state', tabs: [], activeTab: 0, secondaryTab: secondary, route,
        tabNameMaxLength: 16, activeTabNameMaxLength: 50, globalHistory: [],
        syntaxTheme: 'github-dark', theme: 'dark', tasks: [],
        profiles: [], projectDir: '', version: '', harnessLaunch: null, scheduleLaunch: null,
      });
    },
  };
};

const makeSetters = () => ({
  setTabs: vi.fn(),
  setActiveTab: vi.fn(),
  setSecondaryTab: vi.fn(),
  setRoute: vi.fn(),
  setHarnessLaunch: vi.fn(),
  setScheduleLaunch: vi.fn(),
  setTabNameMaxLength: vi.fn(),
  setActiveTabNameMaxLength: vi.fn(),
  setGlobalHistory: vi.fn(),
  setSyntaxTheme: vi.fn(),
  setTheme: vi.fn(),
  setTasks: vi.fn(),
  setProfiles: vi.fn(),
  setRouteIndex: vi.fn(),
  routeRef: { current: null as RouteChooserView | null },
});

describe('useServerState', () => {
  it('fans out a complete named snapshot and updates the project title', () => {
    const client = makeClient();
    const setters = makeSetters();
    renderHook(() => useServerState(client as never, setters));
    const snapshot: StateEvent = {
      t: 'state', tabs: [], activeTab: 2, secondaryTab: 5,
      route: { cmd: 'route-command', choices: ['shell', 'acp'] },
      tabNameMaxLength: 19, activeTabNameMaxLength: 63, globalHistory: ['previous-command'],
      syntaxTheme: 'monokai', theme: 'light',
      tasks: [{ path: 'task.md', name: 'task', depth: 3, dir: false, source: 'project' }],
      profiles: [{ name: 'profile', source: 'janissary' }],
      projectDir: '/projects/example', version: '4.5.6',
      harnessLaunch: { names: ['claude'], models: { claude: ['opus'] } },
      scheduleLaunch: { targets: ['agent'], active: 'agent' },
    };
    act(() => { client.emitSnapshot(snapshot); });
    expect(setters.setTabs).toHaveBeenCalledWith(snapshot.tabs);
    expect(setters.setActiveTab).toHaveBeenCalledWith(2);
    expect(setters.setSecondaryTab).toHaveBeenCalledWith(5);
    expect(setters.setRoute).toHaveBeenCalledWith(snapshot.route);
    expect(setters.setTabNameMaxLength).toHaveBeenCalledWith(19);
    expect(setters.setActiveTabNameMaxLength).toHaveBeenCalledWith(63);
    expect(setters.setGlobalHistory).toHaveBeenCalledWith(['previous-command']);
    expect(setters.setSyntaxTheme).toHaveBeenCalledWith('monokai');
    expect(setters.setTheme).toHaveBeenCalledWith('light');
    expect(setters.setTasks).toHaveBeenCalledWith(snapshot.tasks);
    expect(setters.setProfiles).toHaveBeenCalledWith(snapshot.profiles);
    expect(setters.setHarnessLaunch).toHaveBeenCalledWith(snapshot.harnessLaunch);
    expect(setters.setScheduleLaunch).toHaveBeenCalledWith(snapshot.scheduleLaunch);
    expect(setters.routeRef.current).toEqual(snapshot.route);
    expect(setters.setRouteIndex).toHaveBeenCalledWith(1);
    expect(document.title).toBe('Janissary (4.5.6): /projects/example');

    act(() => { client.emit(null); });
    expect(setters.setSecondaryTab).toHaveBeenLastCalledWith(undefined);
    expect(setters.setRoute).toHaveBeenLastCalledWith(null);
    expect(setters.setHarnessLaunch).toHaveBeenLastCalledWith(null);
    expect(setters.setScheduleLaunch).toHaveBeenLastCalledWith(null);
  });

  it('fans out the synchronized secondary selection', () => {
    const client = makeClient();
    const setters = makeSetters();
    renderHook(() => useServerState(client as never, setters));
    client.emit(null, 3);
    expect(setters.setSecondaryTab).toHaveBeenCalledWith(3);
  });

  it('defaults routeIndex to the last choice (acp) when a chooser newly opens', () => {
    const client = makeClient();
    const setters = makeSetters();
    renderHook(() => useServerState(client as never, setters));
    client.emit({ cmd: 'nav', choices: ['shell', 'acp (agent prompt)'] } as unknown as RouteChooserView);
    expect(setters.setRouteIndex).toHaveBeenCalledWith(1);
  });

  it('defaults routeIndex to the last choice (acp) when the chooser command changes', () => {
    const client = makeClient();
    const setters = makeSetters();
    renderHook(() => useServerState(client as never, setters));
    client.emit({ cmd: 'nav', choices: ['shell', 'acp (agent prompt)'] } as unknown as RouteChooserView);
    setters.setRouteIndex.mockClear();
    client.emit({ cmd: 'queue', choices: ['shell', 'db query → test', 'acp (agent prompt)'] } as unknown as RouteChooserView);
    expect(setters.setRouteIndex).toHaveBeenCalledWith(2);
  });

  it('defaults routeIndex to 0 when a newly opened chooser has no choices', () => {
    const client = makeClient();
    const setters = makeSetters();
    renderHook(() => useServerState(client as never, setters));
    client.emit({ cmd: 'nav', choices: [] } as unknown as RouteChooserView);
    expect(setters.setRouteIndex).toHaveBeenCalledWith(0);
  });

  it('does not reset routeIndex when the same chooser command repeats', () => {
    const client = makeClient();
    const setters = makeSetters();
    renderHook(() => useServerState(client as never, setters));
    client.emit({ cmd: 'nav', choices: ['shell', 'acp (agent prompt)'] } as unknown as RouteChooserView);
    setters.setRouteIndex.mockClear();
    client.emit({ cmd: 'nav', choices: ['shell', 'acp (agent prompt)'] } as unknown as RouteChooserView);
    expect(setters.setRouteIndex).not.toHaveBeenCalled();
  });

  it('does not reset routeIndex when no chooser is open', () => {
    const client = makeClient();
    const setters = makeSetters();
    renderHook(() => useServerState(client as never, setters));
    client.emit(null);
    expect(setters.setRouteIndex).not.toHaveBeenCalled();
  });
});
