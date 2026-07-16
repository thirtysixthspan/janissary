import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JanusClient } from './ws';

describe('JanusClient', () => {
  let messageHandler: ((event: { data: string }) => void) | undefined;
  const wsMockProps = () => ({
    readyState: 1,
    send: vi.fn(),
    addEventListener: vi.fn((_event: string, handler: (...args: unknown[]) => void) => {
      if (_event === 'open') { /* stored but unused in tests */ }
      else if (_event === 'message') messageHandler = handler as (event: { data: string }) => void;
    }),
    close: vi.fn(),
  });
  let inst: ReturnType<typeof wsMockProps>;

  beforeEach(() => {
    messageHandler = undefined;
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
        t: 'state', tabs: [], activeTab: 0, route: null, tabNameMaxLength: 20,
        globalHistory: [], syntaxTheme: 'monokai', theme: 'dark', tasks: [],
        profiles: [], projectDir: '/tmp', version: '1.2.3',
      }),
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith([], 0, null, 20, [], 'monokai', 'dark', [], [], '/tmp', '1.2.3');
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

  it('pageSync sends a pageSync RPC', () => {
    const client = new JanusClient();
    client.pageSync('https://example.org', 'visible text');
    expect(inst.send).toHaveBeenCalledWith(
      expect.stringContaining('"method":"pageSync"'),
    );
  });
});
