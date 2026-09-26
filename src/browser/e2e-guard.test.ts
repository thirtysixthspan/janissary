import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';
import { bridgeSession, startE2EGuard, type E2EGuardOptions } from './e2e-guard.js';
import { E2EClientRefusal, WILL_NOT_RESTART } from './e2e-refusal.js';
import { E2E_LOOPBACK_HOST } from './e2e-loopback.js';
import { loopbackBindable } from '../http-test-fixture.js';
import { fakeSocket, closedWith, type FakeSocket } from '../websocket-test-fixture.js';

// The guard against a stub upstream `ws` server. This is the layer that most needs pinning: it is
// the only thing standing between a sandboxed agent's Playwright client and a browser that would
// otherwise happily read the user's home directory over `file://`.
//
// Every case here runs the real session bridge against sockets that record what passed through them,
// so the filter, the ordering, the buffering and the close reasons are the production ones and not a
// restatement of them. What the recording replaces is the byte pipe underneath — see the fixture.

const UPSTREAM_URL = 'ws://127.0.0.1:1/internal-token';
const PUBLISHED_PATH = '/published-token';
const POLICY_VIOLATION = 1008;

const GOTO_HTTPS = JSON.stringify({ id: 1, method: 'Page.navigate', params: { url: 'https://example.com/' } });
const GOTO_FILE = JSON.stringify({ id: 2, method: 'Page.navigate', params: { url: 'file:///etc/passwd' } });
const CLOSE_BROWSER = JSON.stringify({ id: 5, guid: 'browser@3f2a91c4', method: 'close', params: {} });
const CLOSE_CONTEXT = JSON.stringify({ id: 6, guid: 'browser-context@3f2a91c4', method: 'close', params: {} });

// A session, already past the client's handshake, with the browser answerable straight away.
function session(options: Partial<E2EGuardOptions> = {}) {
  const client = fakeSocket();
  const upstream = fakeSocket();
  const dial = vi.fn(() => upstream.socket as WebSocket);
  bridgeSession(client.socket, options.ensureUpstream ?? (() => Promise.resolve(UPSTREAM_URL)), dial);
  return { client, upstream, dial, browser: browser(upstream, dial) };
}

// The browser only exists once the guard has dialled it, and the guard only dials once its supplier
// answers — so a case that wants the browser has to wait for that before it can push a frame back.
function browser(upstream: FakeSocket, dial: ReturnType<typeof vi.fn>) {
  return async () => {
    await vi.waitFor(() => expect(dial).toHaveBeenCalled());
    return upstream;
  };
}

describe('the session bridge', () => {
  it('relays a navigation to an https: URL through to the browser', async () => {
    const { client, upstream } = session();
    client.receive(GOTO_HTTPS);
    await vi.waitFor(() => expect(upstream.sent).toHaveLength(1));
    expect(upstream.texts()).toEqual([GOTO_HTTPS]);
    expect(client.sent).toEqual([]);
  });

  it('ends the session on a navigation to a file: URL and destroys the upstream connection', async () => {
    const { client, upstream, browser: up } = session();
    const browser = await up();
    client.receive(GOTO_FILE);
    expect(await closedWith(client)).toEqual({ code: POLICY_VIOLATION, reason: 'file: URL blocked' });
    expect(browser.terminated).toBe(true);
    expect(upstream.sent).toEqual([]);
  });

  it('catches a file: URL hidden behind JSON Unicode escapes, which a substring scan would miss', async () => {
    const { client, upstream } = session();
    await vi.waitFor(() => expect(upstream.sent).toBeDefined());
    // `file:///etc/passwd` with every character of the scheme written as a JSON Unicode escape, so
    // the raw frame text contains no literal `file:` at all and only parsing before matching
    // catches it. Built here rather than pasted so the escapes survive the source file itself.
    const scheme = [...'file'].map((c) => String.raw`\u` + (c.codePointAt(0) ?? 0).toString(16).padStart(4, '0')).join('');
    const escaped = `{"id":3,"method":"Page.navigate","params":{"url":"${scheme}:///etc/passwd"}}`;
    expect(escaped.includes('file:')).toBe(false);
    client.receive(escaped);
    const ended = await closedWith(client);
    expect(ended.code).toBe(POLICY_VIOLATION);
    expect(upstream.sent).toEqual([]);
  });

  // The scheme with an ASCII tab inside it. Chromium removes tabs and newlines from a URL before it
  // parses, so this reaches the browser as `file:///etc/passwd` — and the guard used to relay it,
  // because trimming leading padding leaves `fi<TAB>le` as the scheme. Asserting the upstream
  // received nothing is the whole point: this layer refuses *before* the navigation, and a check on
  // the close code alone would still pass if the frame had been forwarded first.
  it('catches a file: URL whose scheme is split by a tab, before it reaches the browser', async () => {
    const { client, upstream } = session();
    await vi.waitFor(() => expect(upstream.sent).toBeDefined());
    client.receive(JSON.stringify({ id: 4, method: 'Page.navigate', params: { url: 'fi\tle:///etc/passwd' } }));
    const ended = await closedWith(client);
    expect(ended.code).toBe(POLICY_VIOLATION);
    expect(upstream.sent).toEqual([]);
  });

  it('catches a file: URL in a binary frame rather than exempting it from inspection', async () => {
    const { client, upstream } = session();
    await vi.waitFor(() => expect(upstream.sent).toBeDefined());
    client.receive(Buffer.from(GOTO_FILE, 'utf8'), true);
    const ended = await closedWith(client);
    expect(ended.code).toBe(POLICY_VIOLATION);
    expect(upstream.sent).toEqual([]);
  });

  it('ends the session on a frame that is not valid JSON', async () => {
    const { client, upstream } = session();
    await vi.waitFor(() => expect(upstream.sent).toBeDefined());
    client.receive('not json at all');
    const ended = await closedWith(client);
    expect(ended.code).toBe(POLICY_VIOLATION);
    expect(upstream.sent).toEqual([]);
  });

  it('ends the session when the browser reports a navigation result on a file: URL', async () => {
    const { client, upstream, browser: up } = session();
    const browser = await up();
    client.receive(GOTO_HTTPS);
    await vi.waitFor(() => expect(upstream.sent).toHaveLength(1));
    browser.receive(JSON.stringify({ id: 1, result: { url: 'file:///etc/passwd' } }));
    const ended = await closedWith(client);
    expect(ended.code).toBe(POLICY_VIOLATION);
  });

  it('relays a browser frame whose page content merely contains the text file://', async () => {
    const { client, upstream, browser: up } = session();
    const browser = await up();
    client.receive(GOTO_HTTPS);
    await vi.waitFor(() => expect(upstream.sent).toHaveLength(1));
    const body = JSON.stringify({ id: 1, result: { value: 'the docs mention file:// URLs', url: 'https://example.com/' } });
    browser.receive(body);
    await vi.waitFor(() => expect(client.sent).toHaveLength(1));
    expect(client.texts()).toEqual([body]);
  });

  // The browser is the tab's, not the guest's. Asserting the upstream received nothing is the point:
  // the refusal has to happen in front of the browser, and a check on the close code alone would
  // still pass if the frame had been relayed first.
  it('ends the session on a request to close the browser, without relaying it', async () => {
    const { client, upstream, browser: up } = session();
    const browser = await up();
    client.receive(CLOSE_BROWSER);
    const ended = await closedWith(client);
    expect(ended.code).toBe(POLICY_VIOLATION);
    expect(browser.terminated).toBe(true);
    expect(upstream.sent).toEqual([]);
  });

  it('relays a request to close a browser context through to the browser', async () => {
    const { client, upstream } = session();
    await vi.waitFor(() => expect(upstream.sent).toBeDefined());
    client.receive(CLOSE_CONTEXT);
    await vi.waitFor(() => expect(upstream.sent).toHaveLength(1));
    expect(upstream.texts()).toEqual([CLOSE_CONTEXT]);
  });
});

// The browser is not up yet when the agent first connects, and the connect is what brings it up. The
// client's handshake is held across that gap and its frames wait in order, so the one thing that can
// tell a client whether a browser started is the connect it already made.
describe('the session bridge while the browser is still starting', () => {
  it('holds the frames a client sends before the browser is there, and forwards them in order', async () => {
    const upstream = fakeSocket();
    const dial = vi.fn(() => upstream.socket as WebSocket);
    const browser = Promise.withResolvers<string>();
    const client = fakeSocket();
    bridgeSession(client.socket, () => browser.promise, dial);
    client.receive(GOTO_HTTPS);
    client.receive(CLOSE_CONTEXT);
    await vi.waitFor(() => expect(upstream.sent).toHaveLength(0));
    expect(dial).not.toHaveBeenCalled();

    browser.resolve(UPSTREAM_URL);
    await vi.waitFor(() => expect(upstream.sent).toHaveLength(2));
    expect(upstream.texts()).toEqual([GOTO_HTTPS, CLOSE_CONTEXT]);
  });

  // The judgement happens on arrival, not on relay, or a client could smuggle a `file:` navigation
  // through the one window in which the guard is not yet holding a browser to refuse it into.
  it('still refuses a file: URL sent before the browser is there', async () => {
    const dial = vi.fn(() => fakeSocket().socket as WebSocket);
    const browser = Promise.withResolvers<string>();
    const client = fakeSocket();
    bridgeSession(client.socket, () => browser.promise, dial);
    client.receive(GOTO_FILE);
    const ended = await closedWith(client);
    expect(ended.code).toBe(POLICY_VIOLATION);
    expect(dial).not.toHaveBeenCalled();
  });

  it('closes the client with a fixed phrase when the browser will not start', async () => {
    const dial = vi.fn(() => fakeSocket().socket as WebSocket);
    const client = fakeSocket();
    bridgeSession(client.socket, () => Promise.reject(new Error('e2e browser failed to start: EADDRINUSE')), dial);
    expect(await closedWith(client)).toEqual({ code: POLICY_VIOLATION, reason: 'e2e browser failed to start' });
    expect(dial).not.toHaveBeenCalled();
  });

  // The client is a confined agent that is denied the installation, the browser's scratch path and
  // the host account's home directory. A close reason that quoted a filesystem error would hand it
  // all three; the account reaches the human through the report and the browser's log instead.
  it('keeps a filesystem path out of the reason a failed start closes the client with', async () => {
    const dial = vi.fn(() => fakeSocket().socket as WebSocket);
    const client = fakeSocket();
    bridgeSession(client.socket, () => Promise.reject(new Error(
      'e2e browser failed to start: EACCES: permission denied, mkdir \'/Users/ada/.janissary/workspace/chat/browsers/claude-4kx2\'',
    )), dial);
    const { reason } = await closedWith(client);
    expect(reason).toBe('e2e browser failed to start');
    expect(reason).not.toContain('ada');
    expect(reason).not.toContain('.janissary');
    expect(reason).not.toContain('EACCES');
  });

  // The one reason that is the agent's to read: a tab past its restart budget is not a browser that
  // failed to start, and the phrase is what tells the agent that connecting again will not help.
  it('closes the client with a refusal\'s own phrase when the supplier refuses', async () => {
    const dial = vi.fn(() => fakeSocket().socket as WebSocket);
    const client = fakeSocket();
    bridgeSession(client.socket, () => Promise.reject(new E2EClientRefusal(WILL_NOT_RESTART)), dial);
    expect(await closedWith(client)).toEqual({ code: POLICY_VIOLATION, reason: 'e2e browser will not be restarted' });
    expect(dial).not.toHaveBeenCalled();
  });

  // A client that gave up while the browser was starting has nothing left to relay to, and dialling
  // on its behalf would open a session nothing would ever close.
  it('does not dial a browser for a client that has already gone', async () => {
    const dial = vi.fn(() => fakeSocket().socket as WebSocket);
    const browser = Promise.withResolvers<string>();
    const client = fakeSocket();
    bridgeSession(client.socket, () => browser.promise, dial);
    client.socket.terminate();
    browser.resolve(UPSTREAM_URL);
    await vi.waitFor(() => expect(dial).not.toHaveBeenCalled());
  });
});

// The listener itself — the bind, the path gate, and the wiring to the bridge — is the one part with
// no seam above it, because the handshake *is* the behaviour. So these ask first whether this
// environment will bind a loopback port, and skip where it will not. Where it will they run against a
// real listener and a real client, with the browser behind it still the recording fake.
describe.skipIf(!(await loopbackBindable()))('startE2EGuard', () => {
  // A free port, taken the way the guard's own caller takes one: bind to 0, read what the OS handed
  // out, give it back. The window between closing and the guard binding is the one production lives with.
  async function freePort(): Promise<number> {
    const probe = createServer();
    await new Promise<void>((resolve) => { probe.listen(0, E2E_LOOPBACK_HOST, resolve); });
    const { port } = probe.address() as { port: number };
    await new Promise<void>((resolve) => { probe.close(() => resolve()); });
    return port;
  }

  const opened = (socket: WebSocket) => new Promise<void>((resolve, reject) => {
    socket.on('open', resolve);
    socket.on('error', reject);
  });

  const start = async () => {
    const port = await freePort();
    const upstream = fakeSocket();
    const handle = startE2EGuard({
      port,
      wsPath: PUBLISHED_PATH,
      ensureUpstream: () => Promise.resolve(UPSTREAM_URL),
      dial: () => upstream.socket as WebSocket,
    });
    const client = new WebSocket(`ws://${E2E_LOOPBACK_HOST}:${port}${PUBLISHED_PATH}`);
    return { client, upstream, port, close: () => { client.terminate(); handle.close(); } };
  };

  it('accepts a client on the published path and bridges it to the browser', async () => {
    const { client, upstream, close } = await start();
    try {
      await opened(client);
      client.send(GOTO_HTTPS);
      await vi.waitFor(() => expect(upstream.sent).toHaveLength(1));
      expect(upstream.texts()).toEqual([GOTO_HTTPS]);
    } finally {
      close();
    }
  });

  it('refuses an upgrade on any path other than the published one', async () => {
    const { port, close } = await start();
    const stranger = new WebSocket(`ws://${E2E_LOOPBACK_HOST}:${port}/internal-token`);
    try {
      await expect(opened(stranger)).rejects.toThrow();
    } finally {
      stranger.terminate();
      close();
    }
  });
});
