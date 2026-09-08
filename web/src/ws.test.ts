import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JanusClient } from './ws';
import type { StateEvent } from '@shared/protocol';

describe('JanusClient', () => {
  let messageHandler: ((event: { data: string }) => void) | undefined;
  // The socket ending is an event the client has to hear, so the fake records that handler too and
  // the tests below fire it. `close()` on a real socket only requests the close; the event follows.
  let closeHandler: (() => void) | undefined;
  const wsMockProps = () => ({
    readyState: 1,
    send: vi.fn(),
    addEventListener: vi.fn((_event: string, handler: (...args: unknown[]) => void) => {
      switch (_event) {
      case 'open': { /* stored but unused in tests */ break; }
      case 'message': { messageHandler = handler as (event: { data: string }) => void; break; }
      case 'close': { closeHandler = handler as () => void; break; }
      // No default
      }
    }),
    close: vi.fn(),
  });
  let inst: ReturnType<typeof wsMockProps>;

  beforeEach(() => {
    messageHandler = undefined;
    closeHandler = undefined;
    inst = wsMockProps();
    const wsCtor = function () { return inst; } as unknown as typeof WebSocket;
    (wsCtor as unknown as Record<string, number>).OPEN = 1;
    (wsCtor as unknown as Record<string, number>).CONNECTING = 0;
    (wsCtor as unknown as Record<string, number>).CLOSING = 2;
    (wsCtor as unknown as Record<string, number>).CLOSED = 3;
    vi.stubGlobal('WebSocket', wsCtor);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('constructor registers message and open handlers on the socket', () => {
    const client = new JanusClient();
    expect(inst.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(inst.addEventListener).toHaveBeenCalledWith('open', expect.any(Function));
    expect(client).toBeInstanceOf(JanusClient);
  });

  it('send writes JSON to the socket when open', () => {
    const client = new JanusClient();
    client.send({ method: 'toggleCollapse', params: {} });
    expect(inst.send).toHaveBeenCalledWith(
      expect.stringContaining('"method":"toggleCollapse"'),
    );
  });

  it('send is silent when the socket is not open', () => {
    inst.readyState = 3;
    const client = new JanusClient();
    client.send({ method: 'toggleCollapse', params: {} });
    expect(inst.send).not.toHaveBeenCalled();
  });

  it('request resolves with the server reply via rpc-reply event', async () => {
    const client = new JanusClient();
    const promise = client.request<string>({ method: 'toggleCollapse', params: {} });
    messageHandler!({ data: JSON.stringify({ t: 'rpc-reply', id: 1, result: 'bar' }) });
    await expect(promise).resolves.toBe('bar');
  });

  it('request resolves with undefined when socket is closed', async () => {
    inst.readyState = 3;
    const client = new JanusClient();
    await expect(client.request({ method: 'toggleCollapse', params: {} })).resolves.toBeUndefined();
  });

  it('onState listener is called when a state event arrives', () => {
    const client = new JanusClient();
    const listener = vi.fn();
    client.onState(listener);
    messageHandler!({
      data: JSON.stringify({
        t: 'state', tabs: [], activeTab: 0, secondaryTab: 2, route: null, tabNameMaxLength: 20,
        activeTabNameMaxLength: 40,
        globalHistory: [], syntaxTheme: 'monokai', theme: 'dark', tasks: [],
        profiles: [], projectDir: '/tmp', version: '1.2.3',
        harnessLaunch: { names: ['claude'], models: { claude: ['opus'] } },
      }),
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      t: 'state', tabs: [], activeTab: 0, secondaryTab: 2, route: null,
      tabNameMaxLength: 20, activeTabNameMaxLength: 40, globalHistory: [],
      syntaxTheme: 'monokai', theme: 'dark', tasks: [],
      profiles: [], projectDir: '/tmp', version: '1.2.3',
      harnessLaunch: { names: ['claude'], models: { claude: ['opus'] } }, scheduleLaunch: null,
    });
  });

  it('forwards every field of a complete snapshot to each subscriber', () => {
    const client = new JanusClient();
    const first = vi.fn();
    const second = vi.fn();
    client.onState(first);
    client.onState(second);
    const snapshot: StateEvent = {
      t: 'state', tabs: [], activeTab: 1, secondaryTab: 3,
      route: { cmd: 'command', choices: ['shell', 'acp'] },
      tabNameMaxLength: 23, activeTabNameMaxLength: 71, globalHistory: ['history'],
      syntaxTheme: 'monokai', theme: 'light', tasks: [],
      profiles: [], projectDir: '/project', version: '7.8.9',
      harnessLaunch: { names: ['claude'], models: { claude: ['opus'] } },
      scheduleLaunch: { targets: ['agent'], active: 'agent' },
    };
    messageHandler!({ data: JSON.stringify(snapshot) });
    expect(first).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(second).toHaveBeenCalledExactlyOnceWith(snapshot);
  });

  it.each([undefined, null])('normalizes %s dialog fields to null', (missing) => {
    const client = new JanusClient();
    const listener = vi.fn();
    client.onState(listener);
    messageHandler!({ data: JSON.stringify({
      t: 'state', tabs: [], activeTab: 0, route: missing, harnessLaunch: missing, scheduleLaunch: missing,
      tabNameMaxLength: 16, activeTabNameMaxLength: 50, globalHistory: [], syntaxTheme: 'monokai',
      theme: 'dark', tasks: [], profiles: [], projectDir: '/project', version: '1.2.3',
    }) });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      route: null, harnessLaunch: null, scheduleLaunch: null, activeTabNameMaxLength: 50,
    }));
  });

  it('onState unsubscribe stops the listener from being called', () => {
    const client = new JanusClient();
    const listener = vi.fn();
    const unsub = client.onState(listener);
    unsub();
    messageHandler!({
      data: JSON.stringify({
        t: 'state', tabs: [], activeTab: 0, route: null, tabNameMaxLength: 20,
        globalHistory: [], syntaxTheme: 'monokai', theme: 'dark', tasks: [],
        profiles: [], projectDir: '/tmp', version: '1.2.3',
      }),
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('onPtyExit listener is called on pty-exit event', () => {
    const client = new JanusClient();
    const listener = vi.fn();
    client.onPtyExit(listener);
    messageHandler!({ data: JSON.stringify({ t: 'pty-exit', id: 'tab-1', exitCode: 0 }) });
    expect(listener).toHaveBeenCalledWith('tab-1', 0);
  });

  it('attachPty flushes buffered data then routes live', () => {
    const client = new JanusClient();
    messageHandler!({ data: JSON.stringify({ t: 'pty', id: 'tab-1', data: 'hello' }) });
    messageHandler!({ data: JSON.stringify({ t: 'pty', id: 'tab-1', data: ' world' }) });
    const handler = vi.fn();
    client.attachPty('tab-1', handler);
    expect(handler).toHaveBeenCalledWith('hello');
    expect(handler).toHaveBeenCalledWith(' world');
    handler.mockClear();
    messageHandler!({ data: JSON.stringify({ t: 'pty', id: 'tab-1', data: 'live' }) });
    expect(handler).toHaveBeenCalledWith('live');
  });

  it('saveFile resolves with result from the pending map', async () => {
    const client = new JanusClient();
    const promise = client.saveFile('/file.txt', 'content');
    messageHandler!({ data: JSON.stringify({ t: 'rpc-reply', id: 1, result: undefined, error: undefined }) });
    await expect(promise).resolves.toBeUndefined();
  });

  it('saveFile resolves with "not connected" when socket is closed', async () => {
    inst.readyState = 3;
    const client = new JanusClient();
    await expect(client.saveFile('/file.txt', 'content')).resolves.toBe('not connected');
  });

  it('resourceUrl appends the page\'s session token, percent-encoded', () => {
    history.replaceState(null, '', '/?token=s3cr3t%2Ftoken');
    expect(new JanusClient().resourceUrl('/open/abc')).toBe('/open/abc?token=s3cr3t%2Ftoken');
  });

  it('resourceUrl sends an empty token when the page has none, rather than omitting the parameter', () => {
    history.replaceState(null, '', '/');
    expect(new JanusClient().resourceUrl('/open/abc')).toBe('/open/abc?token=');
  });

  it('readFile resolves with the body text, fetching the URL resourceUrl builds', async () => {
    history.replaceState(null, '', '/?token=abc');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('line one\n') });
    vi.stubGlobal('fetch', fetchMock);
    const client = new JanusClient();

    await expect(client.readFile('/open/1')).resolves.toBe('line one\n');
    expect(fetchMock).toHaveBeenCalledWith('/open/1?token=abc');
  });

  it('readFile throws with the status when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('') }));
    const client = new JanusClient();
    await expect(client.readFile('/open/missing')).rejects.toThrow('HTTP 404');
  });

  it('bye event closes the window', () => {
    const closeSpy = vi.spyOn(globalThis, 'close').mockImplementation(() => {});
    new JanusClient();
    messageHandler!({ data: JSON.stringify({ t: 'bye' }) });
    expect(closeSpy).toHaveBeenCalled();
    closeSpy.mockRestore();
  });

  it('renameTab sends a renameTab RPC', () => {
    const client = new JanusClient();
    client.renameTab(0, 'new name');
    expect(inst.send).toHaveBeenCalledWith(
      expect.stringContaining('"method":"renameTab"'),
    );
  });

  it('editorSync sends an editorSync RPC', () => {
    const client = new JanusClient();
    client.editorSync('/file.txt', 'content');
    expect(inst.send).toHaveBeenCalledWith(
      expect.stringContaining('"method":"editorSync"'),
    );
  });

  it('collect-tree-state answers with the registered collector records, carrying the request id', () => {
    const client = new JanusClient();
    client.registerStateCollector('fileNavigatorSelections', () => [
      { index: 2, cursor: 'src/a.ts', anchor: 'src', selected: ['src', 'src/a.ts'] },
    ]);

    messageHandler!({ data: JSON.stringify({ t: 'collect-tree-state', id: 9 }) });

    expect(inst.send).toHaveBeenCalledWith(JSON.stringify({
      t: 'rpc', id: 1, method: 'reportFileNavigatorSelection',
      params: { id: 9, navigators: [{ index: 2, cursor: 'src/a.ts', anchor: 'src', selected: ['src', 'src/a.ts'] }] },
    }));
  });

  it('collect-tree-state replies with no records when no collector is registered', () => {
    new JanusClient();

    messageHandler!({ data: JSON.stringify({ t: 'collect-tree-state', id: 4 }) });

    expect(inst.send).toHaveBeenCalledWith(
      expect.stringContaining('"params":{"id":4,"navigators":[]}'),
    );
  });

  it('registerStateCollector returns an unregister that stops the collector being consulted', () => {
    const client = new JanusClient();
    const collect = vi.fn().mockReturnValue([{ index: 0, selected: ['src'] }]);
    const unregister = client.registerStateCollector('fileNavigatorSelections', collect);

    unregister();
    messageHandler!({ data: JSON.stringify({ t: 'collect-tree-state', id: 7 }) });

    expect(collect).not.toHaveBeenCalled();
    expect(inst.send).toHaveBeenCalledWith(
      expect.stringContaining('"params":{"id":7,"navigators":[]}'),
    );
  });

  it('dispose closes the socket', () => {
    const client = new JanusClient();
    client.dispose();
    expect(inst.close).toHaveBeenCalled();
  });

  it('dispose stops state listeners being called for a later state event', () => {
    const client = new JanusClient();
    const listener = vi.fn();
    client.onState(listener);

    client.dispose();
    messageHandler!({
      data: JSON.stringify({
        t: 'state', tabs: [], activeTab: 0, route: null, tabNameMaxLength: 20,
        globalHistory: [], syntaxTheme: 'monokai', theme: 'dark', tasks: [],
        profiles: [], projectDir: '/tmp', version: '1.2.3',
      }),
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('dispose stops layout listeners being called for a later layout event', () => {
    const client = new JanusClient();
    const listener = vi.fn();
    client.onLayout(listener);

    client.dispose();
    messageHandler!({ data: JSON.stringify({ t: 'layout', sidebarLeft: 320 }) });

    expect(listener).not.toHaveBeenCalled();
  });

  it('dispose stops pty-exit listeners being called for a later exit event', () => {
    const client = new JanusClient();
    const listener = vi.fn();
    client.onPtyExit(listener);

    client.dispose();
    messageHandler!({ data: JSON.stringify({ t: 'pty-exit', id: 'tab-1', exitCode: 0 }) });

    expect(listener).not.toHaveBeenCalled();
  });

  it('dispose stops routing pty output to an attached handler', () => {
    const client = new JanusClient();
    const handler = vi.fn();
    client.attachPty('tab-1', handler);

    client.dispose();
    messageHandler!({ data: JSON.stringify({ t: 'pty', id: 'tab-1', data: 'live' }) });

    expect(handler).not.toHaveBeenCalled();
  });

  it('dispose drops buffered early output, so a handler attached afterwards is flushed nothing', () => {
    const client = new JanusClient();
    messageHandler!({ data: JSON.stringify({ t: 'pty', id: 'tab-1', data: 'hello' }) });

    client.dispose();
    const handler = vi.fn();
    client.attachPty('tab-1', handler);

    expect(handler).not.toHaveBeenCalled();
  });

  // A reply is the only thing that used to remove a pending request, so a connection ending with one
  // outstanding left its promise pending for the life of the page — and whatever was waiting on it
  // waiting with it.
  describe('requests outstanding when the connection ends', () => {
    it('settles every pending request when the socket closes', async () => {
      const client = new JanusClient();
      const completion = client.request<string>({ method: 'toggleCollapse', params: {} });
      const save = client.saveFile('/file.txt', 'content');

      closeHandler!();

      await expect(completion).resolves.toBeUndefined();
      await expect(save).resolves.toBe('connection closed');
    });

    it('drops a reply that arrives after the connection ended', async () => {
      const client = new JanusClient();
      const completion = client.request<string>({ method: 'toggleCollapse', params: {} });
      closeHandler!();
      await expect(completion).resolves.toBeUndefined();

      expect(() => {
        messageHandler!({ data: JSON.stringify({ t: 'rpc-reply', id: 1, result: 'late' }) });
      }).not.toThrow();
    });

    it('is idempotent across a second close and a following dispose', async () => {
      const client = new JanusClient();
      const save = client.saveFile('/file.txt', 'content');

      closeHandler!();
      closeHandler!();
      client.dispose();

      await expect(save).resolves.toBe('connection closed');
    });

    it('settles a request outstanding at dispose rather than abandoning it', async () => {
      const client = new JanusClient();
      const completion = client.request<string>({ method: 'toggleCollapse', params: {} });
      const save = client.saveFile('/file.txt', 'content');

      client.dispose();

      await expect(completion).resolves.toBeUndefined();
      await expect(save).resolves.toBe('connection closed');
    });

    it('settles a request whose send throws instead of retaining its callback', async () => {
      const client = new JanusClient();
      inst.send.mockImplementation(() => { throw new Error('InvalidStateError'); });

      const save = client.saveFile('/file.txt', 'content');

      await expect(save).resolves.toBe('connection closed');
      expect(() => {
        messageHandler!({ data: JSON.stringify({ t: 'rpc-reply', id: 1, error: 'late' }) });
      }).not.toThrow();
    });
  });

  it('registering the same collector name again replaces the previous collector', () => {
    const client = new JanusClient();
    const first = vi.fn().mockReturnValue([{ index: 0, selected: ['first'] }]);
    client.registerStateCollector('fileNavigatorSelections', first);
    client.registerStateCollector('fileNavigatorSelections', () => [{ index: 1, selected: ['second'] }]);

    messageHandler!({ data: JSON.stringify({ t: 'collect-tree-state', id: 8 }) });

    expect(first).not.toHaveBeenCalled();
    expect(inst.send).toHaveBeenCalledWith(
      expect.stringContaining('"navigators":[{"index":1,"selected":["second"]}]'),
    );
  });
});
