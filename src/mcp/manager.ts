import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { atomicWriteFile } from '../atomic-write.js';
import { reservePort, reserveReachablePort } from '../browser/e2e-ports.js';
import { getConfig } from '../config.js';
import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { makeToken } from '../security.js';
import type { Tab } from '../tab/types.js';
import { createLocalExecutor } from './executor.js';
import { guard, type NodeHandler } from './guard.js';
import { createHandler } from './handler.js';

const LOOPBACK = '127.0.0.1';
const MCP_PATH = '/mcp';
const STATE_MODE = 0o600;
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
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
    if (missing) return {};
    return { error: `unreadable MCP state file ${file} (${reasonOf(error)}); ${STATE_REMEDY}` };
  }
  const state = decodeState(text);
  return state ? { state } : { error: `invalid MCP state file ${file}; ${STATE_REMEDY}` };
}

function saveState(file: string, state: State): void {
  mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteFile(file, `${JSON.stringify(state, undefined, 2)}\n`, STATE_MODE);
}

function stateToSave(
  state: State | undefined, override: number | undefined, bound: number, token: string,
): State | undefined {
  if (override !== undefined) return state ? undefined : { token };
  return state?.port === undefined ? { port: bound, token } : undefined;
}

async function listen(port: number, token: string, managers: Managers) {
  const handler = createHandler(createLocalExecutor(managers));
  const guarded: NodeHandler = guard(toNodeHandler(handler), token);
  const server = createServer((request, response) => {
    if (request.url?.split('?', 1)[0] !== MCP_PATH) {
      response.writeHead(404);
      response.end('Not Found');
      return;
    }
    void guarded(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { server.off('error', onError); reject(error); };
    server.once('error', onError);
    server.listen(port, LOOPBACK, () => { server.off('error', onError); resolve(); });
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
    const detail = `MCP server failed to start: ${this.failure}`;
    if (managers.tab.cur()) {
      notify(managers, 'mcp-failed', SYSTEM_LABEL, detail);
      return;
    }
    const fallback = Object.create(managers) as Managers;
    const tab = Object.create(managers.tab) as typeof managers.tab;
    tab.cur = () => ({ label: SYSTEM_LABEL, dotColor: undefined }) as unknown as Tab;
    fallback.tab = tab;
    notify(fallback, 'mcp-failed', SYSTEM_LABEL, detail);
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
        this.launch = { url: `http://${LOOPBACK}:${listener.port}${MCP_PATH}`, token };
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
