import { createServer, type Server } from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { guard, type NodeHandler } from './guard.js';

export const MCP_HOST = '127.0.0.1';
const MCP_PATH = '/mcp';

export function createMcpServer(handler: McpHttpHandler, token: string): Server {
  const guarded: NodeHandler = guard(toNodeHandler(handler), token);
  return createServer((request, response) => {
    if (request.url?.split('?', 1)[0] !== MCP_PATH) {
      response.writeHead(404);
      response.end('Not Found');
      return;
    }
    void guarded(request, response);
  });
}

export function mcpUrl(port: number): string {
  return `http://${MCP_HOST}:${port}${MCP_PATH}`;
}
