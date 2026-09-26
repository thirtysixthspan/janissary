import { describe, it, expect, vi, afterEach } from 'vitest';
import { CHANNEL_SIGNALS, runRemoteServer, wireShutdown } from './serve-start.js';
import { parseHandshake, REMOTE_PROTOCOL_VERSION } from './protocol.js';
import type { RemoteServer } from './serve.js';

// `serve-start.ts` is the process-level entry point: the signal wiring and the hand-off to
// `RemoteServer.listen()`. The server itself is exercised in serve.test.ts, so here the only
// collaborators faked are the two stdio surfaces it touches and `process.on`, so no real terminal
// goes into raw mode and no real signal handler is left behind.

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Harness {
  server: { detach: ReturnType<typeof vi.fn>; shutdown: ReturnType<typeof vi.fn> };
  handlers: Map<string, () => void>;
  io: {
    writes: string[];
    on: ReturnType<typeof vi.spyOn>;
    setEncoding: ReturnType<typeof vi.spyOn>;
    stdinOn: ReturnType<typeof vi.spyOn>;
    stdoutOn: ReturnType<typeof vi.spyOn>;
    resume: ReturnType<typeof vi.spyOn>;
  };
}

function harness(): Harness {
  const writes: string[] = [];
  const handlers = new Map<string, () => void>();
  const io = {
    writes,
    on: vi.spyOn(process, 'on').mockImplementation((signal, handler) => {
      if (typeof handler === 'function') handlers.set(String(signal), handler as () => void);
      return process;
    }),
    write: vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { writes.push(String(chunk)); return true; }),
    stdoutOn: vi.spyOn(process.stdout, 'on').mockImplementation(() => process.stdout),
    stdinOn: vi.spyOn(process.stdin, 'on').mockImplementation(() => process.stdin),
    setEncoding: vi.spyOn(process.stdin, 'setEncoding').mockImplementation(() => process.stdin),
    resume: vi.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin),
  };
  const server = { detach: vi.fn(), shutdown: vi.fn() };
  return { server, handlers, io };
}

function asServer(server: Harness['server']): RemoteServer {
  return server as unknown as RemoteServer;
}

// Wire up only the shutdown signals, leaving the stdio stubs to the caller.
function wireReal(server: Harness['server']): void {
  wireShutdown(asServer(server));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CHANNEL_SIGNALS', () => {
  it('names the three signals that can end the session, the lost transport first', () => {
    expect([...CHANNEL_SIGNALS]).toEqual(['SIGHUP', 'SIGTERM', 'SIGINT']);
  });
});

describe('wireShutdown', () => {
  it('registers every channel signal', () => {
    const { server, handlers } = harness();
    wireShutdown(asServer(server), (signal, handler) => { handlers.set(signal, handler); });
    expect([...handlers.keys()]).toEqual([...CHANNEL_SIGNALS]);
  });

  it('parks the peer on SIGHUP rather than ending the session', () => {
    const { server, handlers } = harness();
    wireShutdown(asServer(server), (signal, handler) => { handlers.set(signal, handler); });
    handlers.get('SIGHUP')!();
    expect(server.detach).toHaveBeenCalledOnce();
    expect(server.shutdown).not.toHaveBeenCalled();
  });

  it.each(['SIGTERM', 'SIGINT'])('ends the session on %s', (signal) => {
    const { server, handlers } = harness();
    wireShutdown(asServer(server), (name, handler) => { handlers.set(name, handler); });
    handlers.get(signal)!();
    expect(server.shutdown).toHaveBeenCalledWith(0);
    expect(server.detach).not.toHaveBeenCalled();
  });

  it('falls back to the real process registrar when no injector is given', () => {
    const { server, io } = harness();
    wireReal(server);
    expect(io.on.mock.calls.map(([signal]) => signal)).toEqual([...CHANNEL_SIGNALS]);
    for (const signal of CHANNEL_SIGNALS) expect(io.on.mock.calls.some(([name]) => name === signal)).toBe(true);
  });

  it('routes the signals it registered on the real process to the right answer', () => {
    const { server, handlers } = harness();
    wireReal(server);
    handlers.get('SIGHUP')!();
    expect(server.detach).toHaveBeenCalledOnce();
    expect(server.shutdown).not.toHaveBeenCalled();
    handlers.get('SIGTERM')!();
    expect(server.shutdown).toHaveBeenCalledWith(0);
  });
});

describe('runRemoteServer', () => {
  it('announces the handshake at once, carrying a session and no root', () => {
    const { server, io } = harness();
    runRemoteServer('/nonexistent/project');
    expect(io.writes).toHaveLength(1);
    expect(parseHandshake(io.writes[0]!)).toEqual({
      version: REMOTE_PROTOCOL_VERSION,
      session: expect.stringMatching(SESSION_ID),
    });
    expect(io.writes[0]).not.toContain('root');
    expect(io.setEncoding).toHaveBeenCalledWith('utf8');
    expect(server.detach).not.toHaveBeenCalled();
  });

  it('hooks stdio so frames, a closed stdin, and a stream error all reach the server', () => {
    const { io } = harness();
    runRemoteServer(undefined);
    expect(io.stdinOn.mock.calls.map(([event]) => event)).toEqual(['data', 'end', 'error']);
    expect(io.stdoutOn.mock.calls.map(([event]) => event)).toEqual(['error']);
    expect(io.resume).toHaveBeenCalledOnce();
  });

  it('wires the shutdown signals too, so a running process is never left unguarded', () => {
    const { io } = harness();
    runRemoteServer(undefined);
    expect(io.on.mock.calls.map(([signal]) => signal)).toEqual([...CHANNEL_SIGNALS]);
  });
});
