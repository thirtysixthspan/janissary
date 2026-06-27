import { describe, it, expect, afterEach } from 'vitest';
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

  it('serves security headers on HTTP responses', async () => {
    server = await startServer({ webDir });
    const headers = await new Promise<http.IncomingMessage['headers']>((res, rej) => {
      const req = http.get(`http://127.0.0.1:${server!.port}/`, (r) => { r.resume(); res(r.headers); });
      req.on('error', rej);
    });
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
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
