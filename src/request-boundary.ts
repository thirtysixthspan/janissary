import type { IncomingMessage, ServerResponse } from 'node:http';

export type RequestHandler = (request: IncomingMessage, res: ServerResponse) => Promise<void>;

// URL parsing and percent-decoding are the two steps a malformed request can break, and they fail
// with exactly these error types; anything else is the server's own fault.
const isMalformedRequest = (error: unknown): boolean => error instanceof TypeError || error instanceof URIError;

export function answerRequestFailure(res: ServerResponse, error: unknown): void {
  if (res.headersSent) { res.destroy(); return; }
  if (isMalformedRequest(error)) res.writeHead(400).end('bad request');
  else res.writeHead(500).end('internal error');
}

// The one error boundary for the HTTP server: a rejected handler is answered instead of becoming an
// unhandled rejection, which would terminate the process and every agent tab with it.
export function guardRequest(handler: RequestHandler): (request: IncomingMessage, res: ServerResponse) => void {
  return (request, res) => {
    void handler(request, res).catch((error: unknown) => { answerRequestFailure(res, error); });
  };
}
