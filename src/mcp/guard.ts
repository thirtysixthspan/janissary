import type { IncomingMessage, ServerResponse } from 'node:http';
import { bearerToken, originAllowed, tokenMatches } from '../security.js';

export type NodeHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

function isJsonPost(request: IncomingMessage): boolean {
  if (request.method !== 'POST') return true;
  const contentType = request.headers['content-type'];
  return contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

export function guard(handler: NodeHandler, token: string): NodeHandler {
  return async (request, response) => {
    if (!originAllowed(request)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    if (!tokenMatches(token, bearerToken(request))) {
      response.writeHead(401);
      response.end('Unauthorized');
      return;
    }
    if (!isJsonPost(request)) {
      response.writeHead(415);
      response.end('Unsupported Media Type');
      return;
    }
    await handler(request, response);
  };
}
