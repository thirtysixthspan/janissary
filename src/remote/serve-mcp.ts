import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { reserveReachablePort, type ReservedPort } from '../browser/e2e-ports.js';
import { createHandler } from '../mcp/handler.js';
import { createMcpServer, MCP_HOST, mcpUrl } from '../mcp/listener.js';
import type { McpLaunch } from '../mcp/manager.js';
import type { ToolExecutor, ToolResult } from '../mcp/tools.js';
import { makeToken } from '../security.js';
import type { ClientFrame, ServerFrame } from './protocol-frames.js';

const GRACE_MS = 60_000;
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
  private reservation?: ReservedPort;
  private readonly port: number;
  private readonly server: Server;
  private readonly handler: McpHttpHandler;
  private readonly pending = new Map<string, Pending>();
  private grace?: ReturnType<typeof setTimeout>;
  private disconnectedAt?: number;
  private failure?: string;
  private readonly ready: Promise<void>;

  constructor(
    private readonly send: (frame: ServerFrame) => void,
    private readonly id: string,
    disconnectedAt?: number,
  ) {
    this.reservation = reserveReachablePort();
    this.port = this.reservation.port;
    this.handler = createHandler(this.relay);
    this.server = createMcpServer(this.handler, this.token);
    this.ready = new Promise<void>((resolve, reject) => {
      let bound = false;
      this.server.on('error', (error: Error) => {
        if (bound || this.failure !== undefined) return;
        this.releaseReservation();
        this.failure = `MCP endpoint could not bind to ${MCP_HOST}:${this.port}: ${error.message}`;
        reject(new Error(this.failure));
      });
      this.server.on('listening', () => { bound = true; resolve(); });
    });
    void this.ready.catch(() => {});
    this.server.listen(this.port, MCP_HOST);
    this.linkChanged(disconnectedAt);
  }

  async launch(id: string = this.id): Promise<McpLaunch> {
    try {
      await this.ready;
    } catch (error: unknown) {
      this.send({ type: 'output', id, data: `${this.failure}\n` });
      throw error;
    }
    return { url: mcpUrl(this.port), token: this.token };
  }

  result(frame: ResultFrame): void {
    const entry = this.pending.get(frame.call);
    if (entry) {
      this.pending.delete(frame.call);
      entry.signal.removeEventListener('abort', entry.onAbort);
      entry.resolve({ text: frame.text, isError: frame.isError });
    }
    this.send({ type: 'mcp-cancel', call: frame.call, received: true });
  }

  replayableCalls(): string[] {
    return this.graceExpired() ? [] : [...this.pending.keys()];
  }

  linkChanged(disconnectedAt: number | undefined): void {
    if (this.disconnectedAt === disconnectedAt) return;
    const previousDrop = this.disconnectedAt;
    this.disconnectedAt = disconnectedAt;
    this.stopGrace();
    const now = performance.now();
    if (previousDrop !== undefined && now - previousDrop >= GRACE_MS) this.expirePending();
    if (disconnectedAt === undefined) {
      for (const entry of this.pending.values()) this.send(entry.frame);
      return;
    }
    const remaining = GRACE_MS - (now - disconnectedAt);
    if (remaining > 0) this.grace = setTimeout(() => this.expirePending(), remaining);
  }

  dispose(): void {
    this.releaseReservation();
    if (this.server.listening) this.server.close();
    this.stopGrace();
    void this.handler.close();
  }

  private releaseReservation(): void {
    const reservation = this.reservation;
    this.reservation = undefined;
    reservation?.release();
  }

  private fail(call: string, message: string): void {
    const entry = this.pending.get(call);
    if (!entry) return;
    this.send({ type: 'mcp-cancel', call });
    this.pending.delete(call);
    entry.signal.removeEventListener('abort', entry.onAbort);
    entry.reject(new Error(message));
  }

  private stopGrace(): void {
    clearTimeout(this.grace);
    this.grace = undefined;
  }

  private expirePending(): void {
    this.stopGrace();
    for (const call of this.pending.keys()) this.fail(call, NOT_CONNECTED);
  }

  private graceExpired(): boolean {
    return this.disconnectedAt !== undefined && performance.now() - this.disconnectedAt >= GRACE_MS;
  }

  private relay: ToolExecutor = (tool, args, signal) => new Promise<ToolResult>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('MCP call cancelled.')); return; }
    if (this.graceExpired()) {
      reject(new Error(NOT_CONNECTED));
      return;
    }
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
    this.pending.set(call, { signal, onAbort, resolve, reject, frame });
    signal.addEventListener('abort', onAbort, { once: true });
    if (this.disconnectedAt === undefined) this.send(frame);
  });
}
