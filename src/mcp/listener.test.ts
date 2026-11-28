import type { IncomingMessage, ServerResponse } from 'node:http';
import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import type * as Guard from './guard.js';
import type { NodeHandler } from './guard.js';
import { createMcpServer, MCP_HOST, mcpUrl } from './listener.js';

const guardMock = vi.hoisted(() => ({ guarded: undefined as ReturnType<typeof vi.fn> | undefined }));
vi.mock('./guard.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Guard>();
  return {
    ...actual,
    guard: (handler: NodeHandler, token: string) => {
      const guarded = vi.fn(actual.guard(handler, token));
      guardMock.guarded = guarded;
      return guarded;
    },
  };
});

type FakeResponse = { status: number; body: string };

function request(url: string, headers: Record<string, string> = {}): IncomingMessage {
  return { url, method: 'POST', headers: { host: '127.0.0.1:1234', ...headers } } as never;
}

function response(): { fake: FakeResponse; res: ServerResponse } {
  const fake: FakeResponse = { status: 0, body: '' };
  const res = {
    writeHead(status: number) { fake.status = status; },
    end(body?: string) { fake.body = body ?? ''; },
  };
  return { fake, res: res as never };
}

function serve(url: string, headers?: Record<string, string>) {
  const fetch = vi.fn(async () => new Response());
  const handler = { fetch, close: vi.fn(async () => {}) } as unknown as McpHttpHandler;
  const server = createMcpServer(handler, 'secret');
  const { fake, res } = response();
  server.emit('request', request(url, headers), res);
  return { fake, fetch, guarded: guardMock.guarded };
}

describe('createMcpServer', () => {
  it.each(['/', '/other', '/mcp/', '/mcpx', '/other?x=/mcp'])(
    'answers 404 for %s without reaching the guard',
    (url) => {
      const { fake, fetch, guarded } = serve(url);

      expect(fake).toEqual({ status: 404, body: 'Not Found' });
      expect(guarded).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('lets an /mcp request with a query string reach the guard', async () => {
    const { guarded } = serve('/mcp?session=1');

    expect(guarded).toHaveBeenCalledOnce();
    await guarded?.mock.results[0]?.value;
  });

  it('answers 401 for an unauthenticated /mcp request without reaching the MCP handler', async () => {
    const { fake, fetch, guarded } = serve('/mcp', { 'content-type': 'application/json' });
    await guarded?.mock.results[0]?.value;

    expect(fake).toEqual({ status: 401, body: 'Unauthorized' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('mcpUrl', () => {
  it('formats the loopback endpoint URL for a port', () => {
    expect(MCP_HOST).toBe('127.0.0.1');
    expect(mcpUrl(4321)).toBe('http://127.0.0.1:4321/mcp');
  });
});
