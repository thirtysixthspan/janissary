import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { StateEvent, TabView } from '@shared/protocol';
import { App } from './App';
import { JanusClient } from './ws';

vi.mock('./shared/terminal/useXterm', () => ({
  useXterm: () => ({ focus: vi.fn(), selection: { view: null, holds: () => false, text: () => '', clear: () => {} } }),
}));

// On a real launch the socket opens and `init` is answered while the first render is still pending,
// so the one snapshot the server sends for `init` can land before App has subscribed to state.
describe('App mounted after the first state snapshot arrived', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  function connectedClient() {
    const sockets: FakeSocket[] = [];
    class FakeSocket extends EventTarget {
      static OPEN = 1;
      static CONNECTING = 0;
      readyState = 0;
      send = vi.fn();
      constructor() { super(); sockets.push(this); }
      open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
      close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
      message(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) })); }
    }
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('WebSocket', FakeSocket);
    return { client: new JanusClient(), socket: sockets[0] };
  }

  const tab: TabView = {
    label: 'janus', number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
  };
  const snapshot: StateEvent = {
    t: 'state', tabs: [tab], activeTab: 0, route: null, tabNameMaxLength: 16, activeTabNameMaxLength: 50,
    globalHistory: [], syntaxTheme: 'github-dark', theme: 'dark', tasks: [], profiles: [],
    projectDir: '/tmp', version: '1.2.3', harnessLaunch: null, scheduleLaunch: null,
  };

  it('renders the tabs from the init reply instead of waiting on "Connecting…"', () => {
    const { client, socket } = connectedClient();
    socket.open();
    socket.message(snapshot);

    const { container } = render(<App client={client} />);

    expect(screen.queryByText('Connecting…')).toBeNull();
    expect(container.querySelector('.tabstrip')).not.toBeNull();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    client.dispose();
  }, 15_000);
});
