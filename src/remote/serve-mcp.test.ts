import type * as Crypto from 'node:crypto';
import type * as Http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allocateBrowserPorts, reserveReachablePort } from '../browser/e2e-ports.js';
import type { ToolExecutor } from '../mcp/tools.js';
import { spawnPty } from '../pty.js';
import { BROWSER_PORT_BAND_FIRST, isBrowserBandPort } from '../sandbox/browser/ports.js';
import { decodeFrame, encodeFrame } from './protocol.js';
import type { ClientFrame, ServerFrame } from './protocol-frames.js';
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
  server: {
    listening: true,
    listen: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => { if (event === 'listening') handler(); }),
  },
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

function relayedCalls(): Array<Extract<ServerFrame, { type: 'mcp-call' }>> {
  return send.mock.calls.map(([sent]) => sent).filter(
    (frame): frame is Extract<ServerFrame, { type: 'mcp-call' }> => frame.type === 'mcp-call',
  );
}

function cancelFrames(): Array<Extract<ServerFrame, { type: 'mcp-cancel' }>> {
  return send.mock.calls.map(([sent]) => sent).filter(
    (sent): sent is Extract<ServerFrame, { type: 'mcp-cancel' }> => sent.type === 'mcp-cancel',
  );
}

function spawnHarness(mcp: boolean, env?: Record<string, string>): RemoteProcesses {
  const processes = new RemoteProcesses(send, '/remote/workspace', 'build');
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
    expect(cancelFrames()).toEqual([]);
  });

  it('withholds the MCP address until the endpoint is listening', async () => {
    let listening!: () => void;
    httpMock.server.on.mockImplementationOnce(() => {});
    httpMock.server.on.mockImplementationOnce((_event: string, handler: () => void) => { listening = handler; });

    const mcp = new FarSideMcp(vi.fn(), 'r1');
    let published: string | undefined;
    const launching = (async () => { const launched = await mcp.launch(); published = launched.url; })();
    await Promise.resolve();

    expect(published).toBeUndefined();
    listening();
    await launching;
    expect(published).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    mcp.dispose();
  });

  it('mints its own token that matches nothing the spawn frame carried', async () => {
    spawnHarness(true, {
      JANISSARY_MCP_TOKEN: LOCAL_TOKEN,
      JANISSARY_MCP_URL: 'http://127.0.0.1:1/mcp',
      LOCAL_SECRET: LOCAL_TOKEN,
    });
    await vi.advanceTimersByTimeAsync(0);
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

  it('sends a cancel frame for a call the caller aborts', async () => {
    spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    const controller = new AbortController();

    const answer = executor('question', ARGS, controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    const frame = relayedCall();
    controller.abort();

    await expect(answer).rejects.toThrow('MCP call cancelled.');
    expect(cancelFrames()).toEqual([{ type: 'mcp-cancel', call: frame.call }]);
  });

  it('reports a real port collision without crashing the session', async () => {
    vi.useRealTimers();
    const actual = await vi.importActual<typeof Http>('node:http');

    const probe = new FarSideMcp(vi.fn(), 'probe');
    const probeLaunch = await probe.launch();
    const port = Number(new URL(probeLaunch.url).port);
    probe.dispose();
    cryptoMock.randomInt = () => port;

    const blocker = actual.createServer();
    await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', () => resolve()));

    const collisionSend = vi.fn();
    httpMock.createServer.mockImplementationOnce((handler: Http.RequestListener) => actual.createServer(handler));

    const mcp = new FarSideMcp(collisionSend, 'r1');
    try {
      await expect(mcp.launch()).rejects.toThrow(/MCP endpoint could not bind/);
      expect(collisionSend.mock.calls).toEqual([
        [{ type: 'output', id: 'r1', data: expect.stringContaining('EADDRINUSE') }],
      ]);

      const reclaimed = reserveReachablePort();
      try {
        expect(reclaimed.port).toBe(port);
        mcp.dispose();
        const later = reserveReachablePort();
        try {
          expect(later.port).not.toBe(port);
        } finally {
          later.release();
        }
      } finally {
        reclaimed.release();
      }

      const after = new FarSideMcp(vi.fn(), 'after');
      try {
        const launch = await after.launch();
        expect(Number(new URL(launch.url).port)).toBe(port);
      } finally {
        after.dispose();
      }
    } finally {
      mcp.dispose();
      cryptoMock.randomInt = undefined;
      blocker.close();
    }
  });

  it('reports the stored bind failure to a later harness that asks for the failed endpoint', async () => {
    vi.useRealTimers();
    const actual = await vi.importActual<typeof Http>('node:http');

    const probe = new FarSideMcp(vi.fn(), 'probe');
    const probeLaunch = await probe.launch();
    const port = Number(new URL(probeLaunch.url).port);
    probe.dispose();
    cryptoMock.randomInt = () => port;

    const blocker = actual.createServer();
    await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', () => resolve()));

    const frames: ServerFrame[] = [];
    const collisionSend = vi.fn((frame: ServerFrame) => { frames.push(frame); });
    httpMock.createServer.mockImplementationOnce((handler: Http.RequestListener) => actual.createServer(handler));

    const mcp = new FarSideMcp(collisionSend, 'r1');
    await expect(mcp.launch('r1')).rejects.toThrow(/MCP endpoint could not bind/);
    await expect(mcp.launch('r2')).rejects.toThrow(/MCP endpoint could not bind/);
    expect(frames).toEqual([
      { type: 'output', id: 'r1', data: expect.stringContaining('EADDRINUSE') },
      { type: 'output', id: 'r2', data: expect.stringContaining('MCP endpoint could not bind') },
    ]);

    mcp.dispose();
    cryptoMock.randomInt = undefined;
    blocker.close();
  });

  // Other cases leave endpoints reserved, so each of these reads the port the endpoint actually got
  // rather than assuming the forced draw landed on it.
  async function endpointPort(mcp: FarSideMcp): Promise<number> {
    const launched = await mcp.launch();
    return Number(new URL(launched.url).port);
  }

  it('draws its port from the shared pool so a far-side browser guard cannot take it', async () => {
    const mcp = new FarSideMcp(vi.fn(), 'r1');
    try {
      const port = await endpointPort(mcp);
      cryptoMock.randomInt = () => port;
      const browser = allocateBrowserPorts();
      try {
        expect(browser.guardPort).not.toBe(port);
      } finally {
        browser.release();
      }
    } finally {
      cryptoMock.randomInt = undefined;
      mcp.dispose();
    }
  });

  it('returns its port to the shared pool when disposed', async () => {
    const mcp = new FarSideMcp(vi.fn(), 'r1');
    const port = await endpointPort(mcp);
    mcp.dispose();
    cryptoMock.randomInt = () => port;
    try {
      const browser = allocateBrowserPorts();
      try {
        expect(browser.guardPort).toBe(port);
      } finally {
        browser.release();
      }
    } finally {
      cryptoMock.randomInt = undefined;
    }
  });

  it('listens below the denied browser band when the draw lands inside it', async () => {
    cryptoMock.randomInt = () => BROWSER_PORT_BAND_FIRST + 7;
    try {
      const mcp = new FarSideMcp(vi.fn(), 'r1');
      const port = await endpointPort(mcp);
      mcp.dispose();
      expect(port).toBeLessThan(BROWSER_PORT_BAND_FIRST);
      expect(isBrowserBandPort(port)).toBe(false);
    } finally {
      cryptoMock.randomInt = undefined;
    }
  });

  it('holds in-flight and new calls through a link loss and re-sends them when it returns', async () => {
    const processes = spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    processes.linkChanged(performance.now());
    const first = executor('question', ARGS, new AbortController().signal);
    const second = executor('question', ARGS, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(relayedCalls()).toEqual([]);

    processes.linkChanged(undefined);
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
    const processes = spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    processes.linkChanged(performance.now());
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
    const cancels = cancelFrames();
    expect(cancels).toHaveLength(2);
    expect(new Set(cancels.map((frame) => frame.call)).size).toBe(2);
  });

  it('fails a call made while detached at once with the detach error', async () => {
    const processes = spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    processes.linkChanged(performance.now());
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

  it('allows a first call late in an idle outage only the remaining grace time', async () => {
    const processes = spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    processes.linkChanged(performance.now());
    await vi.advanceTimersByTimeAsync(59_000);

    const answer = executor('question', ARGS, new AbortController().signal);
    const rejected = vi.fn();
    void answer.catch(rejected);
    await vi.advanceTimersByTimeAsync(999);
    expect(rejected).not.toHaveBeenCalled();
    expect(relayedCalls()).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    await expect(answer).rejects.toThrow('Janissary is not connected.');
  });

  it('uses the original disconnect time for an endpoint created during the outage', async () => {
    const disconnectedAt = performance.now();
    await vi.advanceTimersByTimeAsync(60_000);
    const endpoint = new FarSideMcp(send, 'r1', disconnectedAt);
    try {
      const executor = mcpMock.executor;
      if (executor === undefined) throw new Error('expected a relaying executor');
      await expect(executor('question', ARGS, new AbortController().signal)).rejects.toThrow('Janissary is not connected.');
      expect(send).not.toHaveBeenCalled();
    } finally {
      endpoint.dispose();
    }
  });

  it('starts a new window after an idle recovery from an expired outage', async () => {
    const processes = spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    processes.linkChanged(performance.now());
    await vi.advanceTimersByTimeAsync(60_000);
    processes.linkChanged(undefined);
    await vi.advanceTimersByTimeAsync(10);
    processes.linkChanged(performance.now());

    const answer = executor('question', ARGS, new AbortController().signal);
    void answer.catch(() => {});
    await vi.advanceTimersByTimeAsync(59_999);
    expect(relayedCalls()).toEqual([]);
    processes.linkChanged(undefined);
    const frame = relayedCall();
    processes.mcpResult({ type: 'mcp-result', call: frame.call, text: 'yes', isError: false });
    await expect(answer).resolves.toEqual({ text: 'yes', isError: false });
  });

  it('relays a new call normally once the link is back', async () => {
    const processes = spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    processes.linkChanged(performance.now());
    const held = executor('question', ARGS, new AbortController().signal);
    void held.catch(() => {});
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(held).rejects.toThrow('Janissary is not connected.');

    processes.linkChanged(undefined);
    const next = executor('question', ARGS, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);
    const calls = relayedCalls();
    expect(calls).toHaveLength(1);

    processes.mcpResult({ type: 'mcp-result', call: calls[0]!.call, text: 'yes', isError: false });
    await expect(next).resolves.toEqual({ text: 'yes', isError: false });
  });

  it('holds, re-sends and expires calls through repeated link changes', async () => {
    const processes = new RemoteProcesses(send, '/remote/workspace', 'build');
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'opencode', command: 'opencode', mode: 'pty',
      harness: 'opencode', cols: 80, rows: 24, mcp: true,
    });
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    processes.linkChanged(performance.now());
    const first = executor('question', ARGS, new AbortController().signal);
    const second = executor('question', ARGS, new AbortController().signal);
    void first.catch(() => {});
    void second.catch(() => {});
    await vi.advanceTimersByTimeAsync(30_000);
    expect(relayedCalls()).toEqual([]);

    processes.linkChanged(undefined);
    const resent = relayedCalls();
    expect(resent).toHaveLength(2);
    expect(new Set(resent.map((frame) => frame.call)).size).toBe(2);

    for (const frame of resent) {
      processes.mcpResult({ type: 'mcp-result', call: frame.call, text: 'yes', isError: false });
    }
    await expect(first).resolves.toEqual({ text: 'yes', isError: false });
    await expect(second).resolves.toEqual({ text: 'yes', isError: false });

    processes.linkChanged(performance.now());
    const held = executor('question', ARGS, new AbortController().signal);
    void held.catch(() => {});
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(held).rejects.toThrow('Janissary is not connected.');
  });

  it('starts the grace window for a call already in flight when the link drops', async () => {
    const processes = spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    const answer = executor('question', ARGS, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);
    const original = relayedCall();
    expect(relayedCalls()).toEqual([original]);

    processes.linkChanged(performance.now());
    void answer.catch(() => {});
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(answer).rejects.toThrow('Janissary is not connected.');
    expect(relayedCalls()).toEqual([original]);
  });

  it('re-sends an in-flight call once with its original id when the link returns inside the window', async () => {
    const processes = spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    const answer = executor('question', ARGS, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);
    const original = relayedCall();

    processes.linkChanged(performance.now());
    await vi.advanceTimersByTimeAsync(500);
    processes.linkChanged(undefined);

    const calls = relayedCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.call).toBe(original.call);

    processes.mcpResult({ type: 'mcp-result', call: original.call, text: 'yes', isError: false });
    await expect(answer).resolves.toEqual({ text: 'yes', isError: false });
  });

  it('fails a held call when the link drops a second time after an in-window re-send', async () => {
    const processes = spawnHarness(true);
    const executor = mcpMock.executor;
    if (executor === undefined) throw new Error('expected a relaying executor');
    const answer = executor('question', ARGS, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);
    const original = relayedCall();
    void answer.catch(() => {});

    processes.linkChanged(performance.now());
    await vi.advanceTimersByTimeAsync(1000);

    processes.linkChanged(undefined);
    await vi.advanceTimersByTimeAsync(1000);

    processes.linkChanged(performance.now());
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(answer).rejects.toThrow('Janissary is not connected.');
    expect(relayedCalls().map((frame) => frame.call)).toEqual([original.call, original.call]);
  });
});

// Frames for a harness keep arriving while its spawn waits on the endpoint's bind. Holding the
// `listening` event keeps the spawn in that window for as long as each test needs.
describe('an MCP spawn waiting on its endpoint bind', () => {
  const SPAWN: Extract<ClientFrame, { type: 'spawn' }> = {
    type: 'spawn', id: 'r1', program: 'opencode', command: 'opencode', mode: 'pty',
    harness: 'opencode', cols: 80, rows: 24, mcp: true,
  };
  const CANCELLED = 'Spawn r1 was cancelled before it started.';

  function holdBind(): { processes: RemoteProcesses; release: () => void } {
    let listening: (() => void) | undefined;
    httpMock.server.on.mockImplementationOnce(() => {});
    httpMock.server.on.mockImplementationOnce((_event: string, handler: () => void) => { listening = handler; });
    const processes = new RemoteProcesses(send, '/remote/workspace', 'build');
    return { processes, release: () => listening?.() };
  }

  it('starts no harness for a spawn killed during the wait, and frees its id', async () => {
    const { processes, release } = holdBind();

    const spawned = processes.spawn(SPAWN);
    processes.kill('r1');
    release();

    await expect(spawned).rejects.toThrow(CANCELLED);
    expect(spawnPty).not.toHaveBeenCalled();
    expect(processes.states()).toEqual([]);

    await processes.spawn(SPAWN);
    expect(spawnPty).toHaveBeenCalledTimes(1);
  });

  it('starts no harness for a spawn pending when killAll runs', async () => {
    const { processes, release } = holdBind();

    const spawned = processes.spawn(SPAWN);
    processes.killAll();
    release();

    await expect(spawned).rejects.toThrow(CANCELLED);
    expect(spawnPty).not.toHaveBeenCalled();
    expect(processes.states()).toEqual([]);
  });

  it('applies input in order and the latest resize once the harness starts', async () => {
    const write = vi.fn();
    const resize = vi.fn();
    vi.mocked(spawnPty).mockReturnValue({ id: 'pty1', program: 'opencode', write, resize, kill: vi.fn() });
    const { processes, release } = holdBind();

    const spawned = processes.spawn(SPAWN);
    processes.input('r1', 'he');
    processes.resize('r1', 100, 40);
    processes.input('r1', 'llo');
    processes.resize('r1', 120, 50);
    expect(spawnPty).not.toHaveBeenCalled();
    release();
    await spawned;

    expect(write.mock.calls).toEqual([['he'], ['llo']]);
    expect(resize.mock.calls).toEqual([[120, 50]]);
  });

  it('refuses a second spawn with the same id during the wait', async () => {
    const { processes, release } = holdBind();

    const first = processes.spawn(SPAWN);
    expect(processes.spawn(SPAWN)).toBeUndefined();
    release();
    await first;

    expect(spawnPty).toHaveBeenCalledTimes(1);
    expect(processes.states()).toHaveLength(1);
  });
});
