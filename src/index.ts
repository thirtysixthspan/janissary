import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { createController } from './controller.js';
import { makeToken, originAllowed, tokenFromReq as tokenFromRequest, tokenMatches } from './security.js';
import type { ServerEvent } from './protocol.js';
import { handle } from './message/handler.js';
import { buildStateEvent } from './state-event.js';
import { clientParamsProblem, isClientMessage } from './client-message.js';
import { guardRequest } from './request-boundary.js';
import { staticFileServer } from './serve-static.js';
import { errorText } from './error-text.js';
import { messageBus } from './bus.js';
import { ResumeWatch } from './resume-watch.js';

const CLIENT_RECONNECT_GRACE_MS = 1000;

export type ServerOptions = { webDir: string; host?: string; port?: number; token?: string; relaunch?: boolean; projectDir?: string };
export type RunningServer = { url: string; port: number; token: string; close: () => Promise<void>; shutdown: () => void };

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const token = options.token ?? makeToken();
  const host = options.host ?? '127.0.0.1';
  const clients = new Set<WebSocket>();
  let closed = false;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  const resumeWatch = new ResumeWatch();
  const armExit = () => {
    clearTimeout(exitTimer);
    exitTimer = setTimeout(() => {
      if (resumeWatch.check()) return;
      exitTimer = undefined;
      void close().then(() => process.exit(0));
    }, CLIENT_RECONNECT_GRACE_MS);
  };
  const resumeSubscription = messageBus.on('system', 'resumed', () => {
    if (exitTimer && !closed) armExit();
  });
  resumeWatch.start();

  const broadcast = (event: ServerEvent) => {
    const s = JSON.stringify(event);
    for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(s);
  };

  // Reassigned below once `close` exists, so the `quit` command can shut the server down cleanly.
  let requestExit: () => void = () => process.exit(0);
  const controller = createController({
    emitState: () => broadcast(buildStateEvent(controller)),
    sendPty: (id, data) => broadcast({ t: 'pty', id, data }),
    sendPtyExit: (id, exitCode) => broadcast({ t: 'pty-exit', id, exitCode }),
    exit: () => requestExit(),
    sendLayout: (event) => broadcast({ t: 'layout', ...event }),
    sendCollectTreeState: (event) => broadcast({ t: 'collect-tree-state', ...event }),
    sendToast: (event) => broadcast({ t: 'toast', ...event }),
    sendToastClear: () => broadcast({ t: 'toast-clear' }),
    sendNotificationsReveal: (dock) => broadcast({ t: 'notifications-reveal', dock }),
  }, options.projectDir);
  if (options.relaunch) controller.rehydrate();

  const serveStatic = staticFileServer({
    webDir: options.webDir, token, openFilePath: (id) => controller.openFilePath(id),
  });

  const http = createServer(guardRequest(serveStatic));
  const wss = new WebSocketServer({ noServer: true });

  http.on('upgrade', (request, socket, head) => {
    if (!originAllowed(request) || !tokenMatches(token, tokenFromRequest(request))) { socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });

  wss.on('connection', (ws: WebSocket) => {
    if (exitTimer) {
      clearTimeout(exitTimer);
      exitTimer = undefined;
    }
    clients.add(ws);
    ws.on('message', (raw) => {
      let message: unknown;
      try { message = JSON.parse(raw.toString()) as unknown; } catch { return; }
      if (!isClientMessage(message)) return;
      const problem = clientParamsProblem(message);
      if (problem !== undefined) {
        ws.send(JSON.stringify({ t: 'rpc-reply', id: message.id, error: problem }));
        return;
      }
      try {
        handle(controller, message, (event) => ws.send(JSON.stringify(event)));
      } catch (error) {
        ws.send(JSON.stringify({ t: 'rpc-reply', id: message.id, error: errorText(error) }));
      }
    });
    ws.on('close', () => {
      clients.delete(ws);
      if (clients.size === 0 && !closed) {
        broadcast({ t: 'bye' });
        armExit();
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
    closed = true;
    resumeWatch.stop();
    resumeSubscription.unsubscribe();
    if (exitTimer) clearTimeout(exitTimer);
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
