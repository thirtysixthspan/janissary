import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { RouteChooserView } from '@shared/protocol';
import { useServerState } from './useServerState';

type StateListener = Parameters<Parameters<typeof useServerState>[0]['onState']>[0];

const makeClient = () => {
  let listener: StateListener | undefined;
  return {
    onState: vi.fn((l: StateListener) => { listener = l; return () => {}; }),
    emit: (route: RouteChooserView | null) => {
      listener?.([], 0, route, 16, [], 'github-dark', 'dark', [], '', [], '', '');
    },
  };
};

const makeSetters = () => ({
  setTabs: vi.fn(),
  setActiveTab: vi.fn(),
  setRoute: vi.fn(),
  setTabNameMaxLength: vi.fn(),
  setGlobalHistory: vi.fn(),
  setSyntaxTheme: vi.fn(),
  setTheme: vi.fn(),
  setTasks: vi.fn(),
  setJanissaryTasksDir: vi.fn(),
  setProfiles: vi.fn(),
  setRouteIndex: vi.fn(),
  routeRef: { current: null as RouteChooserView | null },
});

describe('useServerState', () => {
  it('resets routeIndex to 0 when a chooser newly opens', () => {
    const client = makeClient();
    const setters = makeSetters();
    renderHook(() => useServerState(client as never, setters));
    client.emit({ cmd: 'nav', options: [] } as unknown as RouteChooserView);
    expect(setters.setRouteIndex).toHaveBeenCalledWith(0);
  });

  it('resets routeIndex to 0 when the chooser command changes', () => {
    const client = makeClient();
    const setters = makeSetters();
    renderHook(() => useServerState(client as never, setters));
    client.emit({ cmd: 'nav', options: [] } as unknown as RouteChooserView);
    setters.setRouteIndex.mockClear();
    client.emit({ cmd: 'queue', options: [] } as unknown as RouteChooserView);
    expect(setters.setRouteIndex).toHaveBeenCalledWith(0);
  });

  it('does not reset routeIndex when the same chooser command repeats', () => {
    const client = makeClient();
    const setters = makeSetters();
    renderHook(() => useServerState(client as never, setters));
    client.emit({ cmd: 'nav', options: [] } as unknown as RouteChooserView);
    setters.setRouteIndex.mockClear();
    client.emit({ cmd: 'nav', options: [] } as unknown as RouteChooserView);
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
