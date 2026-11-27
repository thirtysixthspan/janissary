import { randomInt, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { guard, type NodeHandler } from '../mcp/guard.js';
import { createHandler } from '../mcp/handler.js';
import type { McpLaunch } from '../mcp/manager.js';
import type { ToolExecutor, ToolResult } from '../mcp/tools.js';
import { makeToken } from '../security.js';
import type { ClientFrame, ServerFrame } from './protocol-frames.js';

const LOOPBACK = '127.0.0.1';
const MCP_PATH = '/mcp';
const FIRST_PORT = 49_152;
// Stop short of the e2e browser band at the tail of the dynamic range. Those ports are denied to
// confined harnesses, and a question tool must stay reachable from one.
const PORT_COUNT = 16_128;
const reserved = new Set<number>();

type ResultFrame = Extract<ClientFrame, { type: 'mcp-result' }>;

type Pending = {
  signal: AbortSignal;
  onAbort: () => void;
  resolve: (result: ToolResult) => void;
};

// `listen(0)` defers the bind behind a host lookup, so `address()` is null until the next tick and
// the endpoint cannot be named in the harness's spawn environment. Draw an ephemeral port here
// instead and reserve it until this listener is released, the way `browser/e2e-ports.ts` does. Two
// endpoints in one process never share a port; a collision with another process's bind is a launch
// failure on this host, not something that travels over the session.
function claimPort(): number {
  const start = randomInt(FIRST_PORT, FIRST_PORT + PORT_COUNT);
  for (let offset = 0; offset < PORT_COUNT; offset++) {
    const port = FIRST_PORT + (start - FIRST_PORT + offset) % PORT_COUNT;
    if (!reserved.has(port)) {
      reserved.add(port);
      return port;
    }
  }
  throw new Error('no free MCP port');
}

/**
 * The far side's own MCP endpoint. One per `remote-serve` process, created on the first harness
 * spawn with MCP requested and kept across a detach: the harnesses on this host keep talking to the
 * same loopback address, while every question travels back over the session to be answered locally.
 * Nothing about the local server's persisted token is involved.
 */
export class FarSideMcp {
  private readonly token = makeToken();
  private readonly port = claimPort();
  private readonly server: Server;
  private readonly handler: McpHttpHandler;
  private readonly pending = new Map<string, Pending>();
  private failure?: string;

  constructor(
    private readonly send: (frame: ServerFrame) => void,
    private readonly id: string,
  ) {
    this.handler = createHandler(this.relay);
    const guarded: NodeHandler = guard(toNodeHandler(this.handler), this.token);
    this.server = createServer((request, response) => {
      if (request.url?.split('?', 1)[0] !== MCP_PATH) {
        response.writeHead(404);
        response.end('Not Found');
        return;
      }
      void guarded(request, response);
    });
    this.server.on('error', (error: Error) => {
      this.failure = `MCP endpoint could not bind to ${LOOPBACK}:${this.port}: ${error.message}`;
      this.send({ type: 'output', id: this.id, data: `${this.failure}\n` });
    });
    this.server.listen(this.port, LOOPBACK);
  }

  launch(): McpLaunch {
    if (this.failure !== undefined) throw new Error(this.failure);
    return { url: `http://${LOOPBACK}:${this.port}${MCP_PATH}`, token: this.token };
  }

  result(frame: ResultFrame): void {
    const entry = this.pending.get(frame.call);
    if (!entry) return;
    this.pending.delete(frame.call);
    entry.signal.removeEventListener('abort', entry.onAbort);
    entry.resolve({ text: frame.text, isError: frame.isError });
  }

  dispose(): void {
    reserved.delete(this.port);
    if (this.server.listening) this.server.close();
    void this.handler.close();
  }

  private relay: ToolExecutor = (tool, args, signal) => new Promise<ToolResult>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('MCP call cancelled.')); return; }
    const call = randomUUID();
    const onAbort = () => {
      this.pending.delete(call);
      reject(new Error('MCP call cancelled.'));
    };
    this.pending.set(call, { signal, onAbort, resolve });
    signal.addEventListener('abort', onAbort, { once: true });
    this.send({
      type: 'mcp-call', call, tool,
      args: Buffer.from(JSON.stringify(args)).toString('base64'),
    });
  });
}
