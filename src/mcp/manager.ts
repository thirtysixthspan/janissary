import type { Server } from 'node:http';
import { closeSync, fchmodSync, fstatSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { atomicWritePrivateFile, OWNER_ONLY_FILE_MODE } from '../atomic-write.js';
import { reservePort, reserveReachablePort } from '../browser/e2e-ports.js';
import { getConfig } from '../config.js';
import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { makeToken } from '../security.js';
import { createLocalExecutor } from './executor.js';
import { createHandler } from './handler.js';
import { createMcpServer, MCP_HOST, mcpUrl } from './listener.js';

const SYSTEM_LABEL = 'janus';
const STATE_REMEDY = 'delete it and restart Janissary to replace it';

export type McpStatus =
  | { status: 'running'; url: string; port: number }
  | { status: 'not running'; reason: string };

export type McpLaunch = { url: string; token: string };

type State = { port?: number; token: string };

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 65_535;
}

function decodeState(value: string): State | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const { port, token } = parsed as Record<string, unknown>;
    if (typeof token !== 'string' || token === '') return undefined;
    if (port === undefined) return { token };
    return isPort(port) ? { port, token } : undefined;
  } catch {
    return undefined;
  }
}

function loadState(file: string): { state?: State; error?: string } {
  let descriptor: number | undefined;
  let state: State | undefined;
  try {
    descriptor = openSync(file, 'r');
    state = decodeState(readFileSync(descriptor, 'utf8'));
    if (!state) return { error: `invalid MCP state file ${file}; ${STATE_REMEDY}` };
    if ((fstatSync(descriptor).mode & 0o7777) !== OWNER_ONLY_FILE_MODE) {
      fchmodSync(descriptor, OWNER_ONLY_FILE_MODE);
    }
    return { state };
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
    if (descriptor === undefined && missing) return {};
    const failure = state ? 'could not secure' : 'unreadable';
    return { error: `${failure} MCP state file ${file} (${reasonOf(error)}); ${STATE_REMEDY}` };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function saveState(file: string, state: State): void {
  mkdirSync(path.dirname(file), { recursive: true });
  atomicWritePrivateFile(file, `${JSON.stringify(state, undefined, 2)}\n`);
}

function stateToSave(
  state: State | undefined, override: number | undefined, bound: number, token: string,
): State | undefined {
  if (override !== undefined) return state ? undefined : { token };
  return state?.port === undefined ? { port: bound, token } : undefined;
}

async function listen(port: number, token: string, managers: Managers) {
  const handler = createHandler(createLocalExecutor(managers));
  const server = createMcpServer(handler, token);
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { server.off('error', onError); reject(error); };
    server.once('error', onError);
    server.listen(port, MCP_HOST, () => { server.off('error', onError); resolve(); });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    void handler.close();
    throw new Error('MCP listener has no address');
  }
  return { server, handler, port: address.port };
}

export class McpManager {
  private server?: Server;
  private handler?: { close(): Promise<void> };
  private launch?: McpLaunch;
  private port?: number;
  private failure?: string;
  private releasePort?: () => void;
  private disposed = false;
  private readonly stateFile: string;
  readonly ready: Promise<void>;

  constructor(managers: Managers, projectDir = process.cwd()) {
    this.stateFile = path.join(projectDir, '.janissary', 'mcp.json');
    this.ready = this.start(managers);
  }

  status(): McpStatus {
    if (this.launch && this.port !== undefined) {
      return { status: 'running', url: this.launch.url, port: this.port };
    }
    return { status: 'not running', reason: this.failure ?? 'not started' };
  }

  localLaunch(): McpLaunch | undefined {
    return this.launch;
  }

  dispose(): void {
    this.disposed = true;
    const { server, handler } = this;
    this.server = undefined;
    this.handler = undefined;
    this.launch = undefined;
    this.releasePort?.();
    this.releasePort = undefined;
    if (server?.listening) server.close();
    void handler?.close();
  }

  private recordFailure(managers: Managers): void {
    notify(managers, 'mcp-failed', SYSTEM_LABEL, `MCP server failed to start: ${this.failure}`);
  }

  private async start(managers: Managers): Promise<void> {
    try {
      const { state, error } = loadState(this.stateFile);
      if (error) throw new Error(error);
      const token = state?.token ?? makeToken();
      const override = getConfig().mcpPort;
      const configured = override ?? state?.port;
      const chosen = configured === undefined
        ? reserveReachablePort()
        : reservePort(configured);
      try {
        const listener = await listen(chosen.port, token, managers);
        if (this.disposed) {
          listener.server.close();
          await listener.handler.close();
          chosen.release();
          return;
        }
        try {
          const next = stateToSave(state, override, listener.port, token);
          if (next) saveState(this.stateFile, next);
        } catch (error_) {
          listener.server.close();
          await listener.handler.close();
          throw error_;
        }
        this.server = listener.server;
        this.handler = listener.handler;
        this.port = listener.port;
        this.releasePort = chosen.release;
        this.launch = { url: mcpUrl(listener.port), token };
      } catch (error) {
        chosen.release();
        throw error;
      }
    } catch (error) {
      this.failure = reasonOf(error);
      this.recordFailure(managers);
    }
  }
}
