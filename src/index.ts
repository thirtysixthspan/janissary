import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { Controller } from './controller.js';
import { makeToken, originAllowed, tokenFromReq as tokenFromRequest, tokenMatches } from './security.js';
import type { ClientMessage, ServerEvent } from './protocol.js';
import { getConfig } from './config.js';
import { globalCommands } from './global-history.js';
import { listTasks } from './tasks.js';
import { handle } from './message-handler.js';

// Applied to every HTTP response: defence-in-depth for the XSS path and token leak.
const SECURITY_HEADERS = {
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; frame-src https: http:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
} as const;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json',
  // Image types served via the `/open/<id>` route (opened files).
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif',
  // Markdown files served via the `/open/<id>` route.
  '.md': 'text/markdown; charset=utf-8', '.markdown': 'text/markdown; charset=utf-8',
  // Text types with their own registered MIME, served via the `/open/<id>` route (editor opener).
  '.mjs': 'text/javascript', '.cjs': 'text/javascript', '.xml': 'application/xml',
  '.csv': 'text/csv; charset=utf-8',
  // The rest of the editor opener's plain-text extensions all serve as text/plain.
  ...Object.fromEntries([
    '.txt', '.text', '.log', '.yaml', '.yml', '.toml', '.ini', '.conf', '.cfg', '.env',
    '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs', '.c', '.h', '.cpp', '.hpp', '.java',
    '.sh', '.bash', '.zsh', '.sql',
  ].map((extension) => [extension, 'text/plain; charset=utf-8'])),
};

export type ServerOptions = { webDir: string; host?: string; port?: number; token?: string; relaunch?: boolean; projectDir?: string };
export type RunningServer = { url: string; port: number; token: string; close: () => Promise<void>; shutdown: () => void };

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const token = options.token ?? makeToken();
  const host = options.host ?? '127.0.0.1';
  const clients = new Set<WebSocket>();

  const broadcast = (event: ServerEvent) => {
    const s = JSON.stringify(event);
    for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(s);
  };

  // Reassigned below once `close` exists, so the `quit` command can shut the server down cleanly.
  let requestExit: () => void = () => process.exit(0);
  const controller = new Controller({
    emitState: () => broadcast({
      t: 'state', tabs: controller.view(), activeTab: controller.managers.tab.activeTab,
      route: controller.routeView(), tabNameMaxLength: getConfig().tabNameMaxLength,
      globalHistory: globalCommands(), syntaxTheme: getConfig().syntaxTheme, tasks: listTasks(),
    }),
    sendPty: (id, data) => broadcast({ t: 'pty', id, data }),
    sendPtyExit: (id, exitCode) => broadcast({ t: 'pty-exit', id, exitCode }),
    exit: () => requestExit(),
  }, options.projectDir);
  if (options.relaunch) controller.rehydrate();

  const serveStatic = async (request: IncomingMessage, res: ServerResponse) => {
    if (!originAllowed(request)) { res.writeHead(403).end('forbidden'); return; }
    const urlPath = new URL(request.url ?? '/', 'http://localhost').pathname;
    // A file explicitly opened in the app (`open <file>`). Guarded by the session token and served
    // only from the controller's allow-list — an arbitrary local path is never reachable.
    if (urlPath.startsWith('/open/')) {
      if (!tokenMatches(token, tokenFromRequest(request))) { res.writeHead(403).end('forbidden'); return; }
      const id = decodeURIComponent(urlPath.slice('/open/'.length));
      const filePath = controller.openFilePath(id);
      if (!filePath) { res.writeHead(404).end('not found'); return; }
      let bytes: Buffer;
      try { bytes = await readFile(filePath); }
      catch { bytes = Buffer.alloc(0); }
      res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream' });
      res.end(bytes);
      return;
    }
    // Resolve within webDir; fall back to index.html for SPA routes / unknown assets.
    const rel = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '').replace(/^\/+/, '');
    let file = path.join(options.webDir, rel || 'index.html');
    if (!file.startsWith(options.webDir)) file = path.join(options.webDir, 'index.html');
    let body: Buffer;
    try {
      body = await readFile(file);
    } catch {
      try { body = await readFile(path.join(options.webDir, 'index.html')); file = 'index.html'; }
      catch { res.writeHead(404).end('not found'); return; }
    }
    res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  };

  const http = createServer((request, res) => { void serveStatic(request, res); });
  const wss = new WebSocketServer({ noServer: true });

  http.on('upgrade', (request, socket, head) => {
    if (!originAllowed(request) || !tokenMatches(token, tokenFromRequest(request))) { socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    ws.on('message', (raw) => {
      let message: ClientMessage;
      try { message = JSON.parse(raw.toString()) as ClientMessage; } catch { return; }
      try {
        handle(controller, message, (event) => ws.send(JSON.stringify(event)));
      } catch (error) {
        ws.send(JSON.stringify({ t: 'rpc-reply', id: message.id, error: error instanceof Error ? error.message : String(error) }));
      }
    });
    ws.on('close', () => {
      clients.delete(ws);
      if (clients.size === 0) {
        broadcast({ t: 'bye' });
        setTimeout(() => { void close().then(() => process.exit(0)); }, 100);
      }
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    http.on('error', reject);
    http.listen(options.port ?? 0, host, () => {
      const addr = http.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });

  const close = (): Promise<void> => new Promise((resolve) => {
    controller.shutdown();
    for (const c of clients) c.close();
    wss.close(() => http.close(() => resolve()));
  });
  requestExit = () => {
    // Ask connected windows to close themselves, then stop the server and process.
    broadcast({ t: 'bye' });
    setTimeout(() => { void close().then(() => process.exit(0)); }, 100);
  };

  return { url: `http://${host}:${port}/?token=${token}`, port, token, close, shutdown: () => requestExit() };
}

