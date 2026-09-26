import { describe, it, expect, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { WebSocket } from 'ws';
import { startServer, type RunningServer } from './index.js';
import { staticFileServer } from './serve-static.js';
import { guardRequest } from './request-boundary.js';
import { fakeRequest, fakeResponse, loopbackBindable } from './http-test-fixture.js';
import type { ServerEvent } from './protocol.js';
import { messageBus } from './bus.js';

const webDir = mkdtempSync(path.join(tmpdir(), 'janus-test-'));
writeFileSync(path.join(webDir, 'index.html'), '<!DOCTYPE html><html><body></body></html>');

let server: RunningServer | null = null;
afterEach(async () => { await server?.close(); server = null; });

const waitFor = async (pred: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
};

// A WebSocket upgrade is the handshake and nothing else — there is no seam above it to drive without
// a socket, and a stubbed `ws` would only be asserting that the stub works. So the cases below ask
// whether a loopback port can be bound at all, and skip where the sandbox says no rather than
// weakening what they check. Where a port can be bound they run against a real server.
const canBindLoopback = await loopbackBindable();

// The HTTP half needs no socket at all. The server mounts the static handler behind the request
// boundary, and these cases depend on that: a malformed path is answered 400 by the boundary rather
// than thrown out of the handler. So the handler is driven through the same wrapper the server
// mounts, not called bare — the wiring stays covered. The session token rides in the query string,
// which is how a file the app opened is fetched.
const TOKEN = 'test-token';
type OpenFilePath = (id: string) => string | undefined;

// Nothing the app opened resolves to a file unless a case registers one.
function noFile(): string | undefined {
  // Intentionally empty: the absence is the answer.
}

const mount = (openFilePath: OpenFilePath = noFile) =>
  guardRequest(staticFileServer({ webDir, token: TOKEN, openFilePath }));

// The origin gate reads the `Host` header, which a loopback request always carries; without it every
// case below would be answered 403 before reaching the thing it is about.
const LOOPBACK_HOST = { host: '127.0.0.1:1234' };

const serve = async (
  url: string, init: { token?: string | null; openFilePath?: OpenFilePath } = {},
) => {
  const token = init.token === undefined ? TOKEN : init.token;
  const path = token === null ? url : `${url}${url.includes('?') ? '&' : '?'}token=${token}`;
  const fake = fakeResponse();
  mount(init.openFilePath)(fakeRequest({ url: path, headers: LOOPBACK_HOST }), fake.res);
  await fake.done;
  return fake.recorded;
};

// The status a request is answered with, for the cases that are about the status and nothing else.
const statusOf = async (url: string, init?: Parameters<typeof serve>[1]) => {
  const response = await serve(url, init);
  return response.status;
};

describe('the static file server', () => {
  it('refuses a request whose host is not loopback, before anything else', async () => {
    const fake = fakeResponse();
    mount()(fakeRequest({ url: '/', headers: { host: 'example.com' } }), fake.res);
    await fake.done;
    expect(fake.recorded.status).toBe(403);
  });

  it('serves security headers on every response', async () => {
    const response = await serve('/');
    const csp = response.headers['content-security-policy'] ?? '';
    expect(response.status).toBe(200);
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-src https: http:");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('serves the web UI\'s index for an unknown path, so an SPA route answers like a missing asset', async () => {
    const response = await serve('/some/client/route');
    expect(response.status).toBe(200);
    expect(response.body).toContain('<!DOCTYPE html>');
  });

  it('refuses an /open/ request with no token, and 404s an unregistered id with one', async () => {
    expect(await statusOf('/open/not-registered', { token: null })).toBe(403);
    expect(await statusOf('/open/not-registered')).toBe(404);
  });

  it('serves a registered id as the file it names', async () => {
    const clip = path.join(webDir, 'clip.mp4');
    writeFileSync(clip, 'bytes');
    const response = await serve('/open/1', { openFilePath: () => clip });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('video/mp4');
  });

  // A malformed path is the boundary's work, exercised through the same wrapper the server mounts,
  // so the wiring is covered and not just the guard on its own.
  it('answers 400 to an unparseable request path and keeps serving', async () => {
    expect(await statusOf('//')).toBe(400);
    expect(await statusOf('/')).toBe(200);
  });

  it('answers 400 to an /open/ path with a malformed percent escape and keeps serving', async () => {
    expect(await statusOf('/open/%E0%A4%A')).toBe(400);
    expect(await statusOf('/open/not-registered')).toBe(404);
  });
});

describe.skipIf(!canBindLoopback)('startServer (WS + RPC + security)', () => {
  it.each(['resume', 'wall-clock jump', 'idle'] as const)('applies the disconnect grace after %s', async (mode) => {
    server = await startServer({ webDir });
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${server.token}`);
    await new Promise((resolve) => ws.once('open', resolve));
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      ws.close();
      await new Promise((resolve) => ws.once('close', resolve));
      await new Promise<void>((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(750);
      if (mode === 'resume') messageBus.emit('system', { type: 'resumed', sleptMs: 60_000 });
      else if (mode === 'wall-clock jump') vi.setSystemTime(Date.now() + 60_000);
      await vi.advanceTimersByTimeAsync(300);
      expect(exit).toHaveBeenCalledTimes(mode === 'idle' ? 1 : 0);
      if (mode !== 'idle') {
        await vi.advanceTimersByTimeAsync(1000);
        expect(exit).toHaveBeenCalledOnce();
      }
      server = null;
    } finally { vi.useRealTimers(); exit.mockRestore(); }
  });

  it('does not arm shutdown when a resume has no disconnect countdown', async () => {
    server = await startServer({ webDir });
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      messageBus.emit('system', { type: 'resumed', sleptMs: 60_000 });
      await vi.advanceTimersByTimeAsync(2000);
      expect(exit).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); exit.mockRestore(); }
  });
  it('accepts a token-gated client and streams transcript state', async () => {
    server = await startServer({ webDir: tmpdir() });
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${server.token}`);
    const events: ServerEvent[] = [];
    ws.on('message', (d) => { events.push(JSON.parse(d.toString())); });
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

    ws.send(JSON.stringify({ t: 'rpc', id: 1, method: 'init', params: {} }));
    await waitFor(() => events.some((e) => e.t === 'state' && e.tabs[0]?.label === 'janus'));

    ws.send(JSON.stringify({ t: 'rpc', id: 2, method: 'command', params: { text: 'help' } }));
    // `help` output is rendered as Markdown (see Controller.runApp), so it arrives as `markdown` lines.
    await waitFor(() => events.some((e) => e.t === 'state' && e.tabs[0].bufferLines.some((l) => l.type === 'markdown')));
    ws.close();
  });

  it('replies to a complete request with completion results', async () => {
    server = await startServer({ webDir: tmpdir() });
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${server.token}`);
    const events: ServerEvent[] = [];
    ws.on('message', (d) => { events.push(JSON.parse(d.toString())); });
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

    ws.send(JSON.stringify({ t: 'rpc', id: 5, method: 'complete', params: { text: 'shell READ', cursor: 10 } }));
    await waitFor(() => events.some((e) => e.t === 'rpc-reply' && e.id === 5));
    const reply = events.find((e): e is Extract<ServerEvent, { t: 'rpc-reply' }> => e.t === 'rpc-reply' && e.id === 5);
    expect((reply?.result as { newInput: string }).newInput).toBe('shell README.md ');
    ws.close();
  });

  it('drops invalid RPC envelopes without making the socket unusable', async () => {
    server = await startServer({ webDir: tmpdir() });
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${server.token}`);
    const events: ServerEvent[] = [];
    ws.on('message', (data) => { events.push(JSON.parse(data.toString())); });
    await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });

    ws.send(JSON.stringify({ t: 'rpc', id: 60, method: 'unknown', params: {} }));
    ws.send(JSON.stringify({ t: 'rpc', id: 61, method: 'command' }));
    ws.send(JSON.stringify({ t: 'rpc', id: 62, method: 'command', params: [] }));
    ws.send(JSON.stringify({ t: 'event', id: 63, method: 'command', params: {} }));
    ws.send(JSON.stringify({ t: 'rpc', id: 64, method: 'complete', params: { text: 'shell READ', cursor: 10 } }));

    await waitFor(() => events.some((event) => event.t === 'rpc-reply' && event.id === 64));
    expect(events.some((event) => event.t === 'rpc-reply' && [60, 61, 62, 63].includes(event.id))).toBe(false);
    ws.close();
  });

  // A recognized method whose params do not decode is answered rather than dropped: three methods
  // already got a named error from inside the dispatcher, and a deferred method's caller would
  // otherwise wait for a reply that never comes.
  it('answers a recognized method carrying malformed params with an error naming it', async () => {
    server = await startServer({ webDir: tmpdir() });
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${server.token}`);
    const events: ServerEvent[] = [];
    ws.on('message', (data) => { events.push(JSON.parse(data.toString())); });
    await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });

    ws.send(JSON.stringify({
      t: 'rpc', id: 65, method: 'reportLayout', params: { sidebarLeft: '240', sidebarRight: 300, tabAreaPct: 62 },
    }));

    await waitFor(() => events.some((event) => event.t === 'rpc-reply' && event.id === 65));
    expect(events).toContainEqual({ t: 'rpc-reply', id: 65, error: 'Invalid reportLayout params' });
    ws.close();
  });

  it('does not call process.exit if the server is closed right after the last client disconnects', async () => {
    server = await startServer({ webDir: tmpdir() });
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${server.token}`);
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    ws.close();
    await new Promise((res) => ws.on('close', res));
    await server.close();
    server = null;
    await new Promise((res) => setTimeout(res, 150));
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it('keeps serving when a client reconnects after the last connection closes', async () => {
    server = await startServer({ webDir: tmpdir() });
    const first = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${server.token}`);
    await new Promise((res, rej) => { first.on('open', res); first.on('error', rej); });
    first.close();
    await new Promise((res) => first.on('close', res));

    const second = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${server.token}`);
    const events: ServerEvent[] = [];
    second.on('message', (data) => { events.push(JSON.parse(data.toString())); });
    await new Promise((res, rej) => { second.on('open', res); second.on('error', rej); });
    await new Promise((res) => setTimeout(res, 150));

    second.send(JSON.stringify({ t: 'rpc', id: 1, method: 'init', params: {} }));
    await waitFor(() => events.some((event) => event.t === 'state'));
    second.close();
  });

  it('serves plugin files with declaration-derived video MIME types', async () => {
    const projectDir = mkdtempSync(path.join(tmpdir(), 'janus-video-mime-'));
    writeFileSync(path.join(projectDir, 'clip.mp4'), Buffer.alloc(16));
    server = await startServer({ webDir, projectDir });
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${server.token}`);
    const events: ServerEvent[] = [];
    ws.on('message', (data) => { events.push(JSON.parse(data.toString())); });
    await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });

    ws.send(JSON.stringify({
      t: 'rpc', id: 70, method: 'command', params: { text: 'open clip.mp4' },
    }));
    await waitFor(() => events.some((event) =>
      event.t === 'state' && event.tabs.some((tab) => tab.plugin?.id === 'video')));
    const state = events.findLast((event): event is Extract<ServerEvent, { t: 'state' }> =>
      event.t === 'state' && event.tabs.some((tab) => tab.plugin?.id === 'video'))!;
    const plugin = state.tabs.find((tab) => tab.plugin?.id === 'video')!.plugin!;
    const reference = (plugin.payload as { url: string }).url;
    const contentType = await new Promise<string | undefined>((resolve, reject) => {
      const request = http.get(
        `http://127.0.0.1:${server!.port}${reference}?token=${server!.token}`,
        (response) => { response.resume(); resolve(response.headers['content-type']); },
      );
      request.on('error', reject);
    });

    expect(contentType).toBe('video/mp4');
    ws.close();
  });

  it('rejects a connection with a bad token', async () => {
    server = await startServer({ webDir: tmpdir() });
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?token=wrong`);
    const opened = await new Promise<boolean>((res) => {
      ws.on('open', () => res(true));
      ws.on('error', () => res(false));
      ws.on('unexpected-response', () => res(false));
      setTimeout(() => res(false), 1500);
    });
    expect(opened).toBe(false);
  });
});
