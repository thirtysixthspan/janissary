import type * as Http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutor } from '../mcp/tools.js';
import { spawnPty } from '../pty.js';
import { RemoteProcesses } from './serve-processes.js';

// The far side's endpoint is exercised through the executor the real handler factory is handed.
// Only the HTTP listener and the PTY are faked: guard, token minting, the relay and the pending map
// are the ones production uses, with a fake `send` standing in for the session's framed transport.
const mcpMock = vi.hoisted(() => ({
  executor: undefined as ToolExecutor | undefined,
  close: vi.fn(async () => {}),
}));
const httpMock = vi.hoisted(() => ({
  server: { listening: true, listen: vi.fn(), close: vi.fn() },
  createServer: vi.fn(),
}));

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof Http>();
  httpMock.createServer.mockImplementation(() => httpMock.server);
  return { ...actual, createServer: httpMock.createServer };
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
    expect(JSON.parse(Buffer.from(frame.args, 'base64').toString('utf8'))).toEqual(ARGS);
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
});
