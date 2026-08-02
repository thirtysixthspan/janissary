import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseByteRange, serveOpenFile } from './open-route.js';

const dir = mkdtempSync(path.join(tmpdir(), 'janus-open-route-'));
const file = path.join(dir, 'clip.mp4');
writeFileSync(file, 'abcdefghij');

let server: Server | null = null;
afterEach(() => { server?.close(); server = null; });

type Fetched = { status: number; headers: http.IncomingMessage['headers']; body: string };

// Serve the one fixture file through the route under test and issue a single request against it.
async function fetchRange(range?: string): Promise<Fetched> {
  server = createServer((request, res) => {
    void serveOpenFile(request, res, file, { 'content-type': 'video/mp4' });
  });
  const port = await new Promise<number>((resolve) => {
    server!.listen(0, '127.0.0.1', () => {
      const address = server!.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
  return new Promise<Fetched>((resolve, reject) => {
    const request = http.get(
      { host: '127.0.0.1', port, path: '/open/1', headers: range ? { range } : {} },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => { body += chunk; });
        response.on('end', () => { resolve({ status: response.statusCode ?? 0, headers: response.headers, body }); });
      },
    );
    request.on('error', reject);
  });
}

describe('parseByteRange', () => {
  it('parses a closed range', () => {
    expect(parseByteRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 });
  });

  it('parses an open-ended range as running to the last byte', () => {
    expect(parseByteRange('bytes=4-', 10)).toEqual({ start: 4, end: 9 });
  });

  it('parses a suffix range as the final N bytes', () => {
    expect(parseByteRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
  });

  it('clamps an end past the last byte', () => {
    expect(parseByteRange('bytes=8-99', 10)).toEqual({ start: 8, end: 9 });
  });

  it('reports a range starting past the end as unsatisfiable', () => {
    expect(parseByteRange('bytes=20-30', 10)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=0-0', 0)).toBe('unsatisfiable');
  });

  it('ignores an absent, malformed, or multi-range header', () => {
    expect(parseByteRange(undefined, 10)).toBeUndefined();
    expect(parseByteRange('items=0-1', 10)).toBeUndefined();
    expect(parseByteRange('bytes=-', 10)).toBeUndefined();
    expect(parseByteRange('bytes=0-1,4-5', 10)).toBeUndefined();
  });
});

describe('serveOpenFile', () => {
  it('answers the whole body with 200 when no Range header is sent', async () => {
    const response = await fetchRange();
    expect(response.status).toBe(200);
    expect(response.body).toBe('abcdefghij');
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['content-type']).toBe('video/mp4');
  });

  it('answers a satisfiable Range with 206, Content-Range, and just that slice', async () => {
    const response = await fetchRange('bytes=2-5');
    expect(response.status).toBe(206);
    expect(response.body).toBe('cdef');
    expect(response.headers['content-range']).toBe('bytes 2-5/10');
    expect(response.headers['content-length']).toBe('4');
    expect(response.headers['accept-ranges']).toBe('bytes');
  });

  it('answers a suffix Range with the final bytes', async () => {
    const response = await fetchRange('bytes=-3');
    expect(response.status).toBe(206);
    expect(response.body).toBe('hij');
    expect(response.headers['content-range']).toBe('bytes 7-9/10');
  });

  it('answers an unsatisfiable Range with 416', async () => {
    const response = await fetchRange('bytes=20-30');
    expect(response.status).toBe(416);
    expect(response.body).toBe('');
    expect(response.headers['content-range']).toBe('bytes */10');
  });

  it('answers a malformed Range header with the whole body', async () => {
    const response = await fetchRange('items=0-1');
    expect(response.status).toBe(200);
    expect(response.body).toBe('abcdefghij');
  });
});
