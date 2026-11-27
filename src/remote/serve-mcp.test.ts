import type * as Crypto from 'node:crypto';
import type * as Http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutor } from '../mcp/tools.js';
import { spawnPty } from '../pty.js';
import { decodeFrame, encodeFrame } from './protocol.js';
import type { ServerFrame } from './protocol-frames.js';
import { FarSideMcp } from './serve-mcp.js';
import { RemoteProcesses } from './serve-processes.js';

// The far side's endpoint is exercised through the executor the real handler factory is handed.
// Only the HTTP listener and the PTY are faked: guard, token minting, the relay and the pending map
// are the ones production uses, with a fake `send` standing in for the session's framed transport.
const mcpMock = vi.hoisted(() => ({
  executor: undefined as ToolExecutor | undefined,
  close: vi.fn(async () => {}),
}));
const httpMock = vi.hoisted(() => ({
  server: { listening: true, listen: vi.fn(), close: vi.fn(), on: vi.fn() },
  createServer: vi.fn(),
}));

const cryptoMock = vi.hoisted(() => ({
  randomInt: undefined as ((min: number, max: number) => number) | undefined,
}));
vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof Http>();
  httpMock.createServer.mockImplementation(() => httpMock.server);
  return { ...actual, createServer: httpMock.createServer };
});
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof Crypto>();
  return {
    ...actual,
    randomInt: (min: number, max: number) => cryptoMock.randomInt?.(min, max) ?? actual.randomInt(min, max),
  };
});
vi.mock('../mcp/handler.js', () => ({
  createHandler: (executor: ToolExecutor) => {
    mcpMock.executor = executor;
    return { fetch: vi.fn(), close: mcpMock.close };
  },
}));
vi.mock('../pty.js');

const ARGS = { tab: 'build', kind: 'approve', question: 'Ship it?' };
const LOCAL_TOKEN = 'local-persisted-token';

let send: ReturnType<typeof vi.fn>;
let online = true;
let delivered: ServerFrame[] = [];

function linkSend(frame: ServerFrame): boolean | undefined {
  if (!online) return false;
  delivered.push(frame);
  return undefined;
}

function relayedCalls(): Array<Extract<ServerFrame, { type: 'mcp-call' }>> {
  return delivered.filter(
    (frame): frame is Extract<ServerFrame, { type: 'mcp-call' }> => frame.type === 'mcp-call',
  );
}

function spawnHarness(mcp: boolean, env?: Record<string, string>): RemoteProcesses {
  const processes = new RemoteProcesses(send, '/remote/workspace', 'build', {}, () => online);
  processes.spawn({
    type: 'spawn', id: 'r1', program: 'opencode', command: 'opencode', mode: 'pty',
    harness: 'opencode', cols: 80, rows: 24, ...(mcp && { mcp: true }), ...(env && { env }),
  });
  return processes;
}

function relayedCall() {
  const frame = send.mock.calls.map(([sent]) => sent).find((sent) => sent.type === 'mcp-call');
  if (frame === undefined || frame.type !== 'mcp-call') throw new Error('expected an mcp-call');
  return frame;
}

beforeEach(() => {
  vi.useFakeTimers();
  send = vi.fn();
  online = true;
  delivered = [];
  mcpMock.executor = undefined;
  httpMock.createServer.mockClear();
  httpMock.server.listen.mockClear();
  httpMock.server.close.mockClear();
  httpMock.server.on.mockClear();
  vi.mocked(spawnPty).mockReset().mockReturnValue({
    id: 'pty1', program: 'opencode', write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
  });
});

afterEach(() => { vi.useRealTimers(); });

describe('the far-side MCP endpoint', () => {
  it('relays a question as mcp-call and settles it when mcp-result arrives', async () => {
    const processes = spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');

    const answer = executor('question', ARGS, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);

    const frame = relayedCall();
    expect(frame.tool).toBe('question');
    const wire = decodeFrame(encodeFrame(frame));
    if (wire.type !== 'mcp-call') throw new Error('expected an mcp-call');
    expect(JSON.parse(wire.args)).toEqual(ARGS);
    expect(httpMock.server.listen).toHaveBeenCalledWith(expect.any(Number), '127.0.0.1');

    processes.mcpResult({ type: 'mcp-result', call: frame.call, text: 'yes', isError: false });
    await expect(answer).resolves.toEqual({ text: 'yes', isError: false });
  });

  it('mints its own token that matches nothing the spawn frame carried', () => {
    spawnHarness(true, {
      JANISSARY_MCP_TOKEN: LOCAL_TOKEN,
      JANISSARY_MCP_URL: 'http://127.0.0.1:1/mcp',
      LOCAL_SECRET: LOCAL_TOKEN,
    });
    const env = vi.mocked(spawnPty).mock.calls[0]?.[7] as Record<string, string>;

    expect(env.JANISSARY_MCP_TOKEN).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(env.JANISSARY_MCP_TOKEN).not.toBe(LOCAL_TOKEN);
    expect(env.JANISSARY_MCP_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(env.JANISSARY_MCP_URL).not.toBe('http://127.0.0.1:1/mcp');
    expect(env.JANISSARY_TAB).toBe('build');
  });

  it('creates no endpoint and relays nothing for a spawn without mcp', () => {
    const processes = spawnHarness(false);

    expect(httpMock.createServer).not.toHaveBeenCalled();
    expect(mcpMock.executor).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
    expect(processes.states()).toHaveLength(1);
  });

  it('drops an aborted call and sends nothing further for it', async () => {
    const processes = spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    const controller = new AbortController();

    const answer = executor('question', ARGS, controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    const frame = relayedCall();
    controller.abort();

    await expect(answer).rejects.toThrow('MCP call cancelled.');
    processes.mcpResult({ type: 'mcp-result', call: frame.call, text: 'late', isError: false });
    expect(send.mock.calls.filter(([sent]) => sent.type === 'mcp-call')).toHaveLength(1);
  });

  it('reports a real port collision without crashing the session', async () => {
    vi.useRealTimers();
    const actual = await vi.importActual<typeof Http>('node:http');

    const probe = new FarSideMcp(vi.fn(), 'probe');
    const port = Number(new URL(probe.launch().url).port);
    probe.dispose();
    cryptoMock.randomInt = () => port;

    const blocker = actual.createServer();
    await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', () => resolve()));

    const { promise: reported, resolve: report } = Promise.withResolvers<void>();
    const collisionSend = vi.fn(() => report());
    httpMock.createServer.mockImplementationOnce((handler: Http.RequestListener) => actual.createServer(handler));

    const mcp = new FarSideMcp(collisionSend, 'r1');
    await reported;

    expect(collisionSend).toHaveBeenCalledWith({
      type: 'output', id: 'r1', data: expect.stringContaining('EADDRINUSE'),
    });
    expect(() => mcp.launch()).toThrow(/MCP endpoint could not bind/);

    mcp.dispose();
    const after = new FarSideMcp(vi.fn(), 'after');
    expect(Number(new URL(after.launch().url).port)).toBe(port);
    after.dispose();
    cryptoMock.randomInt = undefined;
    blocker.close();
  });

  it('reports the stored bind failure to a later harness that asks for the failed endpoint', async () => {
    vi.useRealTimers();
    const actual = await vi.importActual<typeof Http>('node:http');

    const probe = new FarSideMcp(vi.fn(), 'probe');
    const port = Number(new URL(probe.launch().url).port);
    probe.dispose();
    cryptoMock.randomInt = () => port;

    const blocker = actual.createServer();
    await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', () => resolve()));

    const { promise: reported, resolve: report } = Promise.withResolvers<void>();
    const frames: ServerFrame[] = [];
    const collisionSend = vi.fn((frame: ServerFrame) => { frames.push(frame); report(); });
    httpMock.createServer.mockImplementationOnce((handler: Http.RequestListener) => actual.createServer(handler));

    const mcp = new FarSideMcp(collisionSend, 'r1');
    await reported;

    expect(() => mcp.launch('r2')).toThrow(/MCP endpoint could not bind/);
    expect(frames).toEqual([
      { type: 'output', id: 'r1', data: expect.stringContaining('EADDRINUSE') },
      { type: 'output', id: 'r2', data: expect.stringContaining('MCP endpoint could not bind') },
    ]);

    mcp.dispose();
    cryptoMock.randomInt = undefined;
    blocker.close();
  });

  it('holds in-flight and new calls through a link loss and re-sends them when it returns', async () => {
    const processes = spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    send.mockImplementation(linkSend);

    online = false;
    const first = executor('question', ARGS, new AbortController().signal);
    const second = executor('question', ARGS, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(relayedCalls()).toEqual([]);

    online = true;
    await vi.advanceTimersByTimeAsync(1000);
    const calls = relayedCalls();
    expect(calls).toHaveLength(2);
    expect(new Set(calls.map((frame) => frame.call)).size).toBe(2);

    for (const frame of calls) {
      processes.mcpResult({ type: 'mcp-result', call: frame.call, text: 'yes', isError: false });
    }
    await expect(first).resolves.toEqual({ text: 'yes', isError: false });
    await expect(second).resolves.toEqual({ text: 'yes', isError: false });
  });

  it('fails every held call with the detach error when the grace window expires', async () => {
    spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    send.mockImplementation(linkSend);

    online = false;
    const first = executor('question', ARGS, new AbortController().signal);
    const second = executor('question', ARGS, new AbortController().signal);
    void first.catch(() => {});
    void second.catch(() => {});
    await vi.advanceTimersByTimeAsync(59_000);
    expect(relayedCalls()).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(first).rejects.toThrow('Janissary is not connected.');
    await expect(second).rejects.toThrow('Janissary is not connected.');
    expect(relayedCalls()).toEqual([]);
  });

  it('fails a call made while detached at once with the detach error', async () => {
    spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    send.mockImplementation(linkSend);

    online = false;
    const held = executor('question', ARGS, new AbortController().signal);
    void held.catch(() => {});
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(held).rejects.toThrow('Janissary is not connected.');

    send.mockClear();

    const later = executor('question', ARGS, new AbortController().signal);
    void later.catch(() => {});
    await expect(later).rejects.toThrow('Janissary is not connected.');
    expect(send).not.toHaveBeenCalled();
    expect(relayedCalls()).toEqual([]);
  });

  it('relays a new call normally once the link is back', async () => {
    const processes = spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    send.mockImplementation(linkSend);

    online = false;
    const held = executor('question', ARGS, new AbortController().signal);
    void held.catch(() => {});
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(held).rejects.toThrow('Janissary is not connected.');

    online = true;
    const next = executor('question', ARGS, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);
    const calls = relayedCalls();
    expect(calls).toHaveLength(1);

    processes.mcpResult({ type: 'mcp-result', call: calls[0]!.call, text: 'yes', isError: false });
    await expect(next).resolves.toEqual({ text: 'yes', isError: false });
  });

  it('holds, re-sends and expires calls through the production link callback without stubbing send', async () => {
    let linked = true;
    const processes = new RemoteProcesses(send, '/remote/workspace', 'build', {}, () => linked);
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'opencode', command: 'opencode', mode: 'pty',
      harness: 'opencode', cols: 80, rows: 24, mcp: true,
    });
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    const calls = () => send.mock.calls.map(([sent]) => sent)
      .filter((sent): sent is Extract<ServerFrame, { type: 'mcp-call' }> => sent.type === 'mcp-call');

    linked = false;
    const first = executor('question', ARGS, new AbortController().signal);
    const second = executor('question', ARGS, new AbortController().signal);
    void first.catch(() => {});
    void second.catch(() => {});
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls()).toEqual([]);

    linked = true;
    await vi.advanceTimersByTimeAsync(1000);
    const resent = calls();
    expect(resent).toHaveLength(2);
    expect(new Set(resent.map((frame) => frame.call)).size).toBe(2);

    for (const frame of resent) {
      processes.mcpResult({ type: 'mcp-result', call: frame.call, text: 'yes', isError: false });
    }
    await expect(first).resolves.toEqual({ text: 'yes', isError: false });
    await expect(second).resolves.toEqual({ text: 'yes', isError: false });

    linked = false;
    const held = executor('question', ARGS, new AbortController().signal);
    void held.catch(() => {});
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(held).rejects.toThrow('Janissary is not connected.');
  });

  it('starts the grace window for a call already in flight when the link drops', async () => {
    spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    send.mockImplementation(linkSend);

    const answer = executor('question', ARGS, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);
    const original = relayedCall();
    expect(relayedCalls()).toEqual([original]);

    online = false;
    void answer.catch(() => {});
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(answer).rejects.toThrow('Janissary is not connected.');
    expect(relayedCalls()).toEqual([original]);
  });

  it('re-sends an in-flight call once with its original id when the link returns inside the window', async () => {
    const processes = spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    send.mockImplementation(linkSend);

    const answer = executor('question', ARGS, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);
    const original = relayedCall();

    online = false;
    await vi.advanceTimersByTimeAsync(5000);
    online = true;
    await vi.advanceTimersByTimeAsync(1000);

    const calls = relayedCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.call).toBe(original.call);

    processes.mcpResult({ type: 'mcp-result', call: original.call, text: 'yes', isError: false });
    await expect(answer).resolves.toEqual({ text: 'yes', isError: false });
  });
});
