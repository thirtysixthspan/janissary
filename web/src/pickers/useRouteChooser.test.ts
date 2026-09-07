import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import React from 'react';
import type { RouteChooserView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { useRouteChooser } from './useRouteChooser';

function fakeClient(): JanusClient {
  return { send: vi.fn() } as unknown as JanusClient;
}

function TestComponent({
  client, onHook,
}: {
  client: JanusClient; onHook: (hook: ReturnType<typeof useRouteChooser>) => void;
}) {
  const hook = useRouteChooser(client);
  onHook(hook);
  return null;
}

function mount(client: JanusClient) {
  let hook: ReturnType<typeof useRouteChooser> | undefined;
  render(React.createElement(TestComponent, { client, onHook: (h) => { hook = h; } }));
  return () => hook!;
}

const VIEW: RouteChooserView = { cmd: 'run build', choices: ['shell', 'agent', 'acp'] };

describe('useRouteChooser', () => {
  it('starts closed with the first option highlighted', () => {
    const hook = mount(fakeClient());
    expect(hook().route).toBeNull();
    expect(hook().routeIndex).toBe(0);
  });

  it('chooseRoute sends the chosen index to the server', () => {
    const client = fakeClient();
    const hook = mount(client);
    act(() => hook().chooseRoute(2));
    expect(client.send).toHaveBeenCalledWith({ method: 'chooseRoute', params: { index: 2 } });
  });

  it('setRoute opens the chooser on the view the server sent', () => {
    const hook = mount(fakeClient());
    act(() => hook().setRoute(VIEW));
    expect(hook().route).toBe(VIEW);
    act(() => hook().setRoute(null));
    expect(hook().route).toBeNull();
  });

  it('setRouteIndex moves the highlight', () => {
    const hook = mount(fakeClient());
    act(() => hook().setRouteIndex(1));
    expect(hook().routeIndex).toBe(1);
  });

  // `useServerState` compares each incoming view against this ref to tell a newly-opened chooser
  // from a re-render of an open one, then writes the new view back — so the hook must leave it
  // empty and must not overwrite what the caller stores there.
  it('exposes an empty ref for the server state stream to seed the highlight from', () => {
    const hook = mount(fakeClient());
    expect(hook().routeRef.current).toBeNull();
    hook().routeRef.current = VIEW;
    act(() => hook().setRoute(VIEW));
    expect(hook().routeRef.current).toBe(VIEW);
  });
});
