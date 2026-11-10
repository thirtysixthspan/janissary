import type { WebSocket } from 'ws';
import type { Controller } from './controller.js';
import type { ServerEvent } from './protocol.js';
import { handle } from './message/handler.js';
import { clientParamsProblem, isClientMessage } from './client-message.js';
import { errorText } from './error-text.js';

export type ClientConnectionDeps = {
  controller: Controller;
  clients: Set<WebSocket>;
  broadcast: (event: ServerEvent) => void;
  cancelExit: () => void;
  armExit: () => void;
  isClosed: () => boolean;
};

export function attachClientConnection(ws: WebSocket, deps: ClientConnectionDeps): void {
  const { controller, clients, broadcast, cancelExit, armExit, isClosed } = deps;
  cancelExit();
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
    if (clients.size === 0 && !isClosed()) {
      broadcast({ t: 'bye' });
      armExit();
    }
  });
}
