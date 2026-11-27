import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { reserveReachablePort, type ReservedPort } from '../browser/e2e-ports.js';
import { guard, type NodeHandler } from '../mcp/guard.js';
import { createHandler } from '../mcp/handler.js';
import type { McpLaunch } from '../mcp/manager.js';
import type { ToolExecutor, ToolResult } from '../mcp/tools.js';
import { makeToken } from '../security.js';
import type { ClientFrame, ServerFrame } from './protocol-frames.js';

const LOOPBACK = '127.0.0.1';
const MCP_PATH = '/mcp';
const GRACE_TICK_MS = 1000;
const GRACE_TICKS = 60;
const NOT_CONNECTED = 'Janissary is not connected.';

type ResultFrame = Extract<ClientFrame, { type: 'mcp-result' }>;
type CallFrame = Extract<ServerFrame, { type: 'mcp-call' }>;

type Pending = {
  signal: AbortSignal;
  onAbort: () => void;
  resolve: (result: ToolResult) => void;
  reject: (reason: Error) => void;
  frame: CallFrame;
};

/**
 * The far side's own MCP endpoint. One per `remote-serve` process, created on the first harness
 * spawn with MCP requested and kept across a detach: the harnesses on this host keep talking to the
 * same loopback address, while every question travels back over the session to be answered locally.
 * Nothing about the local server's persisted token is involved.
 */
export class FarSideMcp {
  private readonly token = makeToken();
  // `listen(0)` defers the bind behind a host lookup, so `address()` is null until the next tick and
  // the endpoint cannot be named in the harness's spawn environment. Draw an ephemeral port instead,
  // from the same harness-reachable pool and reservation set this host's browser guards draw from,
  // and hold it until this listener is released: a far-side `-b` harness's guard can never be handed
  // the port this endpoint listens on. A collision with another process's bind is a launch failure on
  // this host, not something that travels over the session.
  private readonly reservation: ReservedPort = reserveReachablePort();
  private readonly port = this.reservation.port;
  private readonly server: Server;
  private readonly handler: McpHttpHandler;
  private readonly pending = new Map<string, Pending>();
  private grace?: ReturnType<typeof setInterval>;
  private watch?: ReturnType<typeof setInterval>;
  private ticks = 0;
  private detached = false;
  private failure?: string;
  private readonly ready: Promise<void>;

  constructor(
    private readonly send: (frame: ServerFrame) => boolean | void,
    private readonly id: string,
    private readonly linked: () => boolean = () => true,
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
    this.ready = new Promise<void>((resolve, reject) => {
      this.server.on('error', (error: Error) => {
        this.failure = `MCP endpoint could not bind to ${LOOPBACK}:${this.port}: ${error.message}`;
        this.send({ type: 'output', id: this.id, data: `${this.failure}\n` });
        reject(new Error(this.failure));
      });
      this.server.on('listening', () => resolve());
    });
    void this.ready.catch(() => {});
    this.server.listen(this.port, LOOPBACK);
  }

  async launch(id: string = this.id): Promise<McpLaunch> {
    try {
      await this.ready;
    } catch (error: unknown) {
      this.send({ type: 'output', id, data: `${this.failure}\n` });
      throw error;
    }
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
    this.reservation.release();
    if (this.server.listening) this.server.close();
    this.stopGrace();
    this.stopWatch();
    void this.handler.close();
  }

  private fail(call: string, message: string): void {
    const entry = this.pending.get(call);
    if (!entry) return;
    this.send({ type: 'mcp-cancel', call });
    this.pending.delete(call);
    entry.signal.removeEventListener('abort', entry.onAbort);
    entry.reject(new Error(message));
  }

  private resend(): boolean {
    let delivered = false;
    for (const entry of this.pending.values()) {
      if (this.send(entry.frame) !== false) delivered = true;
    }
    return delivered;
  }

  private stopGrace(): void {
    if (this.grace !== undefined) clearInterval(this.grace);
    this.grace = undefined;
    this.ticks = 0;
  }

  private graceTick(): void {
    if (this.resend()) { this.detached = false; this.stopGrace(); this.watchLink(); return; }
    if (++this.ticks >= GRACE_TICKS) {
      this.stopGrace();
      this.detached = true;
      for (const call of this.pending.keys()) this.fail(call, NOT_CONNECTED);
    }
  }

  private startGrace(): void {
    if (this.grace !== undefined) return;
    this.grace = setInterval(() => this.graceTick(), GRACE_TICK_MS);
  }

  private stopWatch(): void {
    if (this.watch !== undefined) clearInterval(this.watch);
    this.watch = undefined;
  }

  private watchLink(): void {
    if (this.watch !== undefined) return;
    this.watch = setInterval(() => {
      if (this.pending.size === 0) { this.stopWatch(); return; }
      if (this.linked()) return;
      this.stopWatch();
      this.startGrace();
      this.graceTick();
    }, GRACE_TICK_MS);
  }

  private relay: ToolExecutor = (tool, args, signal) => new Promise<ToolResult>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('MCP call cancelled.')); return; }
    if (this.detached && !this.linked()) { reject(new Error(NOT_CONNECTED)); return; }
    const call = randomUUID();
    const frame: CallFrame = {
      type: 'mcp-call', call, tool,
      args: JSON.stringify(args),
    };
    const onAbort = () => {
      this.send({ type: 'mcp-cancel', call });
      this.pending.delete(call);
      reject(new Error('MCP call cancelled.'));
    };
    const delivered = this.send(frame);
    this.pending.set(call, { signal, onAbort, resolve, reject, frame });
    signal.addEventListener('abort', onAbort, { once: true });
    if (delivered === false) { this.stopWatch(); this.startGrace(); return; }
    if (this.grace !== undefined || this.detached) {
      this.detached = false;
      this.stopGrace();
      for (const [id, entry] of this.pending) {
        if (id !== call) this.send(entry.frame);
      }
    }
    this.watchLink();
  });
}
