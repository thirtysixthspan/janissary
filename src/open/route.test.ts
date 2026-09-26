import { describe, it, expect, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import http from 'node:http';
import { mkdtempSync, writeFileSync, type ReadStream } from 'node:fs';
import type * as NodeFs from 'node:fs';
import type * as NodeFsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseByteRange, serveOpenFile } from './route.js';

// Every file stream the route opens is recorded so a test can check it was released.
const opened = vi.hoisted(() => [] as ReadStream[]);
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return {
    ...actual,
    createReadStream: (...args: Parameters<typeof actual.createReadStream>) => {
      const stream = actual.createReadStream(...args);
      opened.push(stream);
      return stream;
    },
  };
});

// A path whose `stat` still reports a size although the file is gone: the window between the route's
// `stat` and its open, held open deterministically.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    stat: (target: string) => (target.endsWith('vanished.mp4') ? Promise.resolve({ size: 10 }) : actual.stat(target)),
  };
});

const dir = mkdtempSync(path.join(tmpdir(), 'janus-open-route-'));
const file = path.join(dir, 'clip.mp4');
writeFileSync(file, 'abcdefghij');

let server: Server | null = null;
afterEach(() => { server?.close(); server = null; opened.length = 0; });

const waitFor = async (predicate: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

type Fetched = { status: number; headers: http.IncomingMessage['headers']; body: string };

// Serve one file through the route under test on a fresh server, answering with its port.
async function listen(filePath: string): Promise<number> {
  server = createServer((request, res) => {
    void serveOpenFile(request, res, filePath, { 'content-type': 'video/mp4' });
  });
  return new Promise<number>((resolve) => {
    server!.listen(0, '127.0.0.1', () => {
      const address = server!.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
}

// Issue a single request against the fixture file, on a fresh server unless a port is given.
async function fetchRange(range?: string, filePath = file, port?: number): Promise<Fetched> {
  const target = port ?? await listen(filePath);
  return new Promise<Fetched>((resolve, reject) => {
    const request = http.get(
      { host: '127.0.0.1', port: target, path: '/open/1', headers: range ? { range } : {} },
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

  it('answers 404 when the registered file no longer exists', async () => {
    const response = await fetchRange(undefined, path.join(dir, 'missing.mp4'));
    expect(response.status).toBe(404);
    expect(response.body).toBe('');
  });

  it('releases the file stream when the client abandons a ranged response', async () => {
    const large = path.join(dir, 'large.mp4');
    writeFileSync(large, Buffer.alloc(16 * 1024 * 1024));
    const port = await listen(large);
    await new Promise<void>((resolve, reject) => {
      const request = http.get(
        { host: '127.0.0.1', port, path: '/open/1', headers: { range: 'bytes=0-' } },
        (response) => { response.once('data', () => { request.destroy(); resolve(); }); },
      );
      request.on('error', (error: NodeJS.ErrnoException) => { if (error.code !== 'ECONNRESET') reject(error); });
    });
    expect(opened).toHaveLength(1);
    await waitFor(() => opened[0].destroyed);
  });

  it('ends only that response when the file disappears after stat, and keeps serving', async () => {
    const vanished = path.join(dir, 'vanished.mp4');
    const port = await listen(vanished);
    const outcome = await new Promise<string>((resolve) => {
      const request = http.get(
        { host: '127.0.0.1', port, path: '/open/1', headers: { range: 'bytes=0-3' } },
        (response) => {
          response.resume();
          response.on('aborted', () => { resolve('aborted'); });
          response.on('end', () => { resolve('ended'); });
        },
      );
      request.on('error', () => { resolve('aborted'); });
    });
    expect(outcome).toBe('aborted');
    const next = await fetchRange(undefined, vanished, port);
    expect(next.status).toBe(500);
  });
});
