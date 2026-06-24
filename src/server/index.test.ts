import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { WebSocket } from 'ws';
import { startServer, type RunningServer } from './index.js';
import type { ServerEvent } from './protocol.js';

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
    ws.on('message', (d) => events.push(JSON.parse(d.toString())));
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

    ws.send(JSON.stringify({ t: 'rpc', id: 1, method: 'init', params: {} }));
    await waitFor(() => events.some((e) => e.t === 'state' && e.tabs[0]?.label === 'janus'));

    ws.send(JSON.stringify({ t: 'rpc', id: 2, method: 'command', params: { text: 'help' } }));
    await waitFor(() => events.some((e) => e.t === 'state' && e.tabs[0].bufferLines.some((l) => l.type === 'output')));
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
