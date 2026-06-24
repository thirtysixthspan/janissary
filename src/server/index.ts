import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { Controller } from './controller.js';
import { makeToken, originAllowed, tokenFromReq, tokenMatches } from './security.js';
import type { ClientMessage, ServerEvent } from './protocol.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json',
};

export type ServerOptions = { webDir: string; host?: string; port?: number; token?: string; relaunch?: boolean };
export type RunningServer = { url: string; port: number; token: string; close: () => Promise<void> };

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const token = opts.token ?? makeToken();
  const host = opts.host ?? '127.0.0.1';
  const clients = new Set<WebSocket>();

  const broadcast = (ev: ServerEvent) => {
    const s = JSON.stringify(ev);
    for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(s);
  };

  const controller = new Controller({
    emitState: () => broadcast({ t: 'state', tabs: controller.view(), activeTab: controller.activeTab }),
    sendPty: (id, data) => broadcast({ t: 'pty', id, data }),
    sendPtyExit: (id, exitCode) => broadcast({ t: 'pty-exit', id, exitCode }),
  });
  if (opts.relaunch) controller.rehydrate();

  const serveStatic = async (req: IncomingMessage, res: ServerResponse) => {
    if (!originAllowed(req)) { res.writeHead(403).end('forbidden'); return; }
    const urlPath = new URL(req.url ?? '/', 'http://localhost').pathname;
    // Resolve within webDir; fall back to index.html for SPA routes / unknown assets.
    const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '').replace(/^\/+/, '');
    let file = join(opts.webDir, rel || 'index.html');
    if (!file.startsWith(opts.webDir)) file = join(opts.webDir, 'index.html');
    let body: Buffer;
    try {
      body = await readFile(file);
    } catch {
      try { body = await readFile(join(opts.webDir, 'index.html')); file = 'index.html'; }
      catch { res.writeHead(404).end('not found'); return; }
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  };

  const http = createServer((req, res) => { void serveStatic(req, res); });
  const wss = new WebSocketServer({ noServer: true });

  http.on('upgrade', (req, socket, head) => {
    if (!originAllowed(req) || !tokenMatches(token, tokenFromReq(req))) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      try {
        handle(controller, msg, (ev) => ws.send(JSON.stringify(ev)));
      } catch (e) {
        ws.send(JSON.stringify({ t: 'rpc-reply', id: msg.id, error: e instanceof Error ? e.message : String(e) }));
      }
    });
    ws.on('close', () => clients.delete(ws));
  });

  const port = await new Promise<number>((resolve, reject) => {
    http.on('error', reject);
    http.listen(opts.port ?? 0, host, () => {
      const addr = http.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });

  return {
    url: `http://${host}:${port}/?token=${token}`,
    port,
    token,
    close: () => new Promise((resolve) => {
      controller.shutdown();
      for (const c of clients) c.close();
      wss.close(() => http.close(() => resolve()));
    }),
  };
}

// Apply one client request to the controller and reply. State changes are broadcast by the
// controller's sinks, so the reply itself only acknowledges.
function handle(controller: Controller, msg: ClientMessage, reply: (ev: ServerEvent) => void): void {
  switch (msg.method) {
    case 'init':
      reply({ t: 'state', tabs: controller.view(), activeTab: controller.activeTab });
      break;
    case 'command': controller.dispatch(msg.params.text); break;
    case 'setActiveTab': controller.setActiveTab(msg.params.index); break;
    case 'moveTab': controller.moveTab(msg.params.dir); break;
    case 'reorderTab': controller.reorderTab(msg.params.dir); break;
    case 'toggleCollapse': controller.toggleCollapse(); break;
    case 'resize': controller.resize(msg.params.cols, msg.params.rows); break;
    case 'ptyInput': controller.ptyInput(msg.params.id, msg.params.data); break;
    case 'ptyResize': controller.ptyResize(msg.params.id, msg.params.cols, msg.params.rows); break;
    case 'ptyKill': controller.ptyKill(msg.params.id); break;
  }
  reply({ t: 'rpc-reply', id: msg.id, result: 'ok' });
}
