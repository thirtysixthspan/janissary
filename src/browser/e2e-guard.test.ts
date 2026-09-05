import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { E2E_LOOPBACK_HOST } from './e2e-loopback.js';
import { startE2EGuard, type E2EGuardHandle } from './e2e-guard.js';

// The guard against a stub upstream `ws` server. This is the layer that most needs pinning: it is
// the only thing standing between a sandboxed agent's Playwright client and a browser that would
// otherwise happily read the user's home directory over `file://`.

const UPSTREAM_PATH = '/internal-token';
const PUBLISHED_PATH = '/published-token';

type Upstream = {
  port: number;
  server: WebSocketServer;
  // Everything the browser side actually received, in order.
  received: string[];
  // Sockets the stub accepted, so a case can push a frame back down one.
  sockets: WebSocket[];
  closed: () => Promise<void>;
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  const pending = [...cleanups];
  cleanups.length = 0;
  for (const cleanup of pending) cleanup();
});

// `host` is a parameter so one case can put the stub where an IPv6-first resolver would have put the
// real browser. Every other case binds the address the guard dials, as they always did.
async function startUpstream(host: string = E2E_LOOPBACK_HOST): Promise<Upstream> {
  const server = new WebSocketServer({ host, port: 0, path: UPSTREAM_PATH });
  await new Promise<void>((resolve) => server.on('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  const received: string[] = [];
  const sockets: WebSocket[] = [];
  const closedPromise = Promise.withResolvers<void>();
  server.on('connection', (socket: WebSocket) => {
    sockets.push(socket);
    socket.on('message', (data: Buffer) => { received.push(data.toString('utf8')); });
    socket.on('close', () => closedPromise.resolve());
  });
  cleanups.push(() => { server.close(); });
  return { port, server, received, sockets, closed: () => closedPromise.promise };
}

// A free port, taken the same way the guard's own caller takes one: bind to 0, read what the OS
// handed out, give it back. The window between closing and the guard binding is the same one the
// production path lives with.
async function freePort(): Promise<number> {
  const probe = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => probe.on('listening', resolve));
  const address = probe.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

async function startGuard(upstream: Upstream): Promise<number> {
  const port = await freePort();
  const handle: E2EGuardHandle = startE2EGuard({
    port, wsPath: PUBLISHED_PATH, upstreamPort: upstream.port, upstreamPath: UPSTREAM_PATH,
  });
  cleanups.push(() => handle.close());
  return port;
}

function connect(port: number, path = PUBLISHED_PATH): WebSocket {
  const socket = new WebSocket(`ws://${E2E_LOOPBACK_HOST}:${port}${path}`);
  cleanups.push(() => socket.terminate());
  return socket;
}

// Whether this host can bind IPv6 loopback at all. Probed once, at module load, so the case below
// can be skipped rather than failing for the wrong reason on a host with IPv6 switched off.
const ipv6Loopback = await (async (): Promise<boolean> => {
  try {
    const probe = new WebSocketServer({ host: '::1', port: 0 });
    await new Promise<void>((resolve, reject) => {
      probe.on('listening', resolve);
      probe.on('error', reject);
    });
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    return true;
  } catch {
    return false;
  }
})();

async function opened(socket: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.on('open', resolve);
    socket.on('error', reject);
  });
}

// Resolves with the close code the guard used to end the session.
function closeCode(socket: WebSocket): Promise<number> {
  return new Promise<number>((resolve) => socket.on('close', (code: number) => resolve(code)));
}

// Give the relay a moment to carry a frame through the guard and into the stub.
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

const GOTO_HTTPS = JSON.stringify({ id: 1, method: 'Page.navigate', params: { url: 'https://example.com/' } });
const GOTO_FILE = JSON.stringify({ id: 2, method: 'Page.navigate', params: { url: 'file:///etc/passwd' } });

describe('startE2EGuard', () => {
  it('relays a navigation to an https: URL through to the browser', async () => {
    const upstream = await startUpstream();
    const port = await startGuard(upstream);
    const client = connect(port);
    await opened(client);
    client.send(GOTO_HTTPS);
    await settle();
    expect(upstream.received).toEqual([GOTO_HTTPS]);
  });

  it('ends the session on a navigation to a file: URL and destroys the upstream connection', async () => {
    const upstream = await startUpstream();
    const port = await startGuard(upstream);
    const client = connect(port);
    await opened(client);
    const code = closeCode(client);
    client.send(GOTO_FILE);
    expect(await code).toBe(1008);
    await upstream.closed();
    expect(upstream.received).toEqual([]);
  });

  it('catches a file: URL hidden behind JSON Unicode escapes, which a substring scan would miss', async () => {
    const upstream = await startUpstream();
    const port = await startGuard(upstream);
    const client = connect(port);
    await opened(client);
    // `file:///etc/passwd` with every character of the scheme written as a JSON Unicode escape, so
    // the raw frame text contains no literal `file:` at all and only parsing before matching
    // catches it. Built here rather than pasted so the escapes survive the source file itself.
    const scheme = [...'file'].map((c) => String.raw`\u` + (c.codePointAt(0) ?? 0).toString(16).padStart(4, '0')).join('');
    const escaped = `{"id":3,"method":"Page.navigate","params":{"url":"${scheme}:///etc/passwd"}}`;
    expect(escaped.includes('file:')).toBe(false);
    const code = closeCode(client);
    client.send(escaped);
    expect(await code).toBe(1008);
    expect(upstream.received).toEqual([]);
  });

  it('catches a file: URL in a binary frame rather than exempting it from inspection', async () => {
    const upstream = await startUpstream();
    const port = await startGuard(upstream);
    const client = connect(port);
    await opened(client);
    const code = closeCode(client);
    client.send(Buffer.from(GOTO_FILE, 'utf8'), { binary: true });
    expect(await code).toBe(1008);
    expect(upstream.received).toEqual([]);
  });

  it('ends the session on a frame that is not valid JSON', async () => {
    const upstream = await startUpstream();
    const port = await startGuard(upstream);
    const client = connect(port);
    await opened(client);
    const code = closeCode(client);
    client.send('not json at all');
    expect(await code).toBe(1008);
    expect(upstream.received).toEqual([]);
  });

  it('ends the session when the browser reports a navigation result on a file: URL', async () => {
    const upstream = await startUpstream();
    const port = await startGuard(upstream);
    const client = connect(port);
    await opened(client);
    client.send(GOTO_HTTPS);
    await settle();
    const code = closeCode(client);
    upstream.sockets[0].send(JSON.stringify({ id: 1, result: { url: 'file:///etc/passwd' } }));
    expect(await code).toBe(1008);
  });

  it('relays a browser frame whose page content merely contains the text file://', async () => {
    const upstream = await startUpstream();
    const port = await startGuard(upstream);
    const client = connect(port);
    await opened(client);
    client.send(GOTO_HTTPS);
    await settle();
    const body = JSON.stringify({ id: 1, result: { value: 'the docs mention file:// URLs', url: 'https://example.com/' } });
    const relayed = new Promise<string>((resolve) => client.on('message', (data: Buffer) => resolve(data.toString('utf8'))));
    upstream.sockets[0].send(body);
    expect(await relayed).toBe(body);
  });

  it('refuses an upgrade on any path other than the published one', async () => {
    const upstream = await startUpstream();
    const port = await startGuard(upstream);
    const client = connect(port, UPSTREAM_PATH);
    await expect(opened(client)).rejects.toThrow();
  });
});

// The disagreement this suite used to hide by binding its stub to the address the guard dials. A
// browser that came up on IPv6 loopback is where a `localhost` default would have put it on a host
// that resolves the name that way; the guard is pinned to one address, and so now is the browser,
// so the pair cannot end up split across families.
describe.skipIf(!ipv6Loopback)('startE2EGuard against an IPv6-only listener', () => {
  it('does not reach it, and ends the client session rather than holding it half open', async () => {
    const upstream = await startUpstream('::1');
    const port = await startGuard(upstream);
    const client = connect(port);
    await opened(client);
    await new Promise<void>((resolve) => client.on('close', () => resolve()));
    expect(upstream.received).toEqual([]);
  });
});
