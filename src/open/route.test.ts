import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, type ReadStream } from 'node:fs';
import type * as NodeFs from 'node:fs';
import type * as NodeFsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fakeRequest, fakeResponse, type RecordedResponse } from '../http-test-fixture.js';
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

afterEach(() => { opened.length = 0; });

const waitFor = async (predicate: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

// The route is driven directly rather than over a socket: what it decides is the status line, the
// headers, and the byte window, and a loopback round trip would only add a way for the answer to go
// missing without saying anything about that decision. The response is still a real `Writable`, so
// the `pipeline` teardown cases below are the real thing rather than a stand-in for it.
//
// A ranged answer is piped, so the route returns as soon as the pipe is set up and the body arrives
// after it — the wait is for the response to reach a terminal state, not for a fixed delay.
async function fetchRange(range?: string, filePath = file): Promise<RecordedResponse> {
  const fake = fakeResponse();
  await serveOpenFile(fakeRequest({ headers: range ? { range } : {} }), fake.res, filePath, {
    'content-type': 'video/mp4',
  });
  await waitFor(() => fake.recorded.ended || fake.recorded.destroyed);
  return fake.recorded;
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

  // A client that walks away mid-body is the destination erroring, which is exactly what `pipeline`
  // turns into a teardown of the file stream it was feeding — so the response is abandoned rather
  // than the socket closed, and the stream has to go with it.
  it('releases the file stream when the client abandons a ranged response', async () => {
    const large = path.join(dir, 'large.mp4');
    writeFileSync(large, Buffer.alloc(16 * 1024 * 1024));
    const fake = fakeResponse();

    const serving = serveOpenFile(
      fakeRequest({ headers: { range: 'bytes=0-' } }), fake.res, large, { 'content-type': 'video/mp4' },
    );
    await vi.waitFor(() => { expect(opened).toHaveLength(1); });
    fake.abandon();
    await serving;

    expect(fake.recorded.status).toBe(206);
    await waitFor(() => opened[0].destroyed);
  });

  // The read error the route contains: a file removed between its `stat` and its open. It has to end
  // that one response and nothing else, and the next request has to be served as it always is.
  it('ends only that response when the file disappears after stat, and keeps serving', async () => {
    const vanished = path.join(dir, 'vanished.mp4');
    const fake = fakeResponse();

    await serveOpenFile(
      fakeRequest({ headers: { range: 'bytes=0-3' } }), fake.res, vanished, { 'content-type': 'video/mp4' },
    );
    await waitFor(() => fake.recorded.destroyed);

    // `stat` was mocked to answer a size for this path, so the route chose the ranged path and then
    // failed to open it — which is the window this case exists for.
    expect(fake.recorded.status).toBe(206);
    expect(opened[0].destroyed).toBe(true);

    // And the route is untouched by it: the same path still answers through the non-ranged path.
    const next = await fetchRange('bytes=0-3', vanished);
    expect(next.status).toBe(206);
  });
});
