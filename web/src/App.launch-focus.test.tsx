import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { StateEvent, TabView } from '@shared/protocol';
import type { ShellPayload } from '@shared/plugins/shell/shared';
import { App } from './App';
import { createPluginHost, PluginHostProvider } from './plugins/host';
import { JanusClient } from './ws';

// xterm's renderer cannot run in jsdom, so the emulator the shell body opens is a stub that only
// counts the focus calls it receives.
const terminalFocusCalls: number[] = [];

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    options: Record<string, unknown>;
    parser = { registerOscHandler: () => ({ dispose: () => {} }) };
    constructor(options: Record<string, unknown>) { this.options = options; }
    loadAddon() {}
    open() {}
    dispose() {}
    write() {}
    hasSelection() { return false; }
    getSelection() { return ''; }
    clearSelection() {}
    attachCustomKeyEventHandler() {}
    textarea = undefined;
    buffer = { active: { baseY: 0, cursorY: 0, type: 'normal' } };
    onCursorMove() { return { dispose: () => {} }; }
    registerMarker() { return { line: 0, dispose: () => {} }; }
    registerDecoration() {}
    onData() { return { dispose: () => {} }; }
    focus() { terminalFocusCalls.push(1); }
    scrollLines() {}
    scrollToBottom() {}
    get cols() { return 80; }
    get rows() { return 24; }
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class { fit() {} activate() {} dispose() {} },
}));

// The window a launch opens: its first state snapshot carries one tab, the `janus` launch shell, as
// the shell plugin's envelope rather than an agent tab.
describe('App launched with the janus shell tab', () => {
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

  const payload: ShellPayload = {
    instanceKey: 'shell-1', ptyId: 'pty1', cwd: '/tmp', root: '/tmp', workspace: false, cols: 80, rows: 24,
    connections: [], schedule: [], hookNonce: 'a'.repeat(32),
  };
  const tab: TabView = {
    label: 'janus', number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    view: 'plugin',
    plugin: { id: 'shell', schemaVersion: 3, payload, chords: ['ctrl+r', 'meta+t'], hostsCommandBar: true },
  };
  const snapshot: StateEvent = {
    t: 'state', tabs: [tab], activeTab: 0, route: null, tabNameMaxLength: 16, activeTabNameMaxLength: 50,
    clipboardHistoryMaxEntries: 15, globalHistory: [], syntaxTheme: 'github-dark', theme: 'dark', tasks: [], profiles: [],
    projectDir: '/tmp', version: '1.2.3', harnessLaunch: null, scheduleLaunch: null,
  };

  it('puts the keyboard in the janus command bar, not its terminal', async () => {
    const { client, socket } = connectedClient();
    socket.open();
    socket.message(snapshot);

    render(
      <React.StrictMode>
        <PluginHostProvider host={createPluginHost()}>
          <App client={client} />
        </PluginHostProvider>
      </React.StrictMode>,
    );

    const bar = await screen.findByLabelText('Shell command', undefined, { timeout: 10_000 });
    await waitFor(() => { expect(document.activeElement).toBe(bar); });
    expect(terminalFocusCalls).toEqual([]);
    client.dispose();
  }, 15_000);
});
