import { describe, it, expect, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { WebSocket } from 'ws';
import { startServer, type RunningServer } from './index.js';
import type { ServerEvent } from './protocol.js';

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

describe('startServer (WS + RPC + security)', () => {
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

  it('serves security headers on HTTP responses', async () => {
    server = await startServer({ webDir });
    const headers = await new Promise<http.IncomingMessage['headers']>((res, rej) => {
      const req = http.get(`http://127.0.0.1:${server!.port}/`, (r) => { r.resume(); res(r.headers); });
      req.on('error', rej);
    });
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['content-security-policy']).toContain("frame-src https: http:");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
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

  it('rejects an /open/ request with no token, and 404s an unregistered id with one', async () => {
    server = await startServer({ webDir });
    const get = (query: string) => new Promise<number>((res, rej) => {
      const request = http.get(`http://127.0.0.1:${server!.port}/open/not-registered${query}`, (r) => {
        r.resume();
        res(r.statusCode ?? 0);
      });
      request.on('error', rej);
    });

    expect(await get('')).toBe(403);
    expect(await get(`?token=${server.token}`)).toBe(404);
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
