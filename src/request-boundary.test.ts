import { describe, it, expect, afterEach } from 'vitest';
import http, { createServer, type Server } from 'node:http';
import { guardRequest, type RequestHandler } from './request-boundary.js';

let server: Server | null = null;
afterEach(() => { server?.close(); server = null; });

type Outcome = 'aborted' | { status: number; body: string };

async function request(handler: RequestHandler): Promise<Outcome> {
  server = createServer(guardRequest(handler));
  const port = await new Promise<number>((resolve) => {
    server!.listen(0, '127.0.0.1', () => {
      const address = server!.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
  return new Promise<Outcome>((resolve) => {
    const outgoing = http.get({ host: '127.0.0.1', port, path: '/' }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.on('aborted', () => { resolve('aborted'); });
      response.on('end', () => { resolve({ status: response.statusCode ?? 0, body }); });
    });
    outgoing.on('error', () => { resolve('aborted'); });
  });
}

describe('guardRequest', () => {
  it('answers 400 for a URL parsing failure', async () => {
    const outcome = await request(async () => { new URL('//', 'http://localhost'); });
    expect(outcome).toEqual({ status: 400, body: 'bad request' });
  });

  it('answers 400 for a percent-decoding failure', async () => {
    const outcome = await request(async () => { decodeURIComponent('%E0%A4%A'); });
    expect(outcome).toEqual({ status: 400, body: 'bad request' });
  });

  it('answers 500 for any other failure', async () => {
    const outcome = await request(async () => { throw new Error('boom'); });
    expect(outcome).toEqual({ status: 500, body: 'internal error' });
  });

  it('destroys the response instead of writing a second status once headers are sent', async () => {
    const outcome = await request(async (_request, res) => {
      res.writeHead(200);
      res.write('partial');
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error('late failure');
    });
    expect(outcome).toBe('aborted');
  });

  it('leaves a handler that succeeds alone', async () => {
    const outcome = await request(async (_request, res) => { res.writeHead(200).end('ok'); });
    expect(outcome).toEqual({ status: 200, body: 'ok' });
  });
});
