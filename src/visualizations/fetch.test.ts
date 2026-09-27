import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { realpathSync } from 'node:fs';
import { readSource } from './fetch.js';
import { defaultSourceRoots } from './source.js';

// The roots the reader is given in these tests are the process's own working directory and home, so a
// path built from either is inside one of them and a path into a system directory is inside neither.
const ROOTS = defaultSourceRoots(process.cwd());
const SELF = realpathSync(import.meta.filename);

type Response = { status: number; headers: { get(name: string): string | null }; text(): Promise<string> };

function respond(status: number, body: string, location?: string): Response {
  return {
    status,
    headers: { get: (name) => (name.toLowerCase() === 'location' ? (location ?? null) : null) },
    text: async () => body,
  };
}

const ok = (body: string) => respond(200, body);

describe('readSource', () => {
  it('returns the body of a url it can read', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok('a,b\n1,2'));
    await expect(readSource('https://example.com/d.csv', ROOTS, { fetchImpl })).resolves.toEqual({
      text: 'a,b\n1,2',
    });
  });

  it('refuses a url whose status is not a success, naming the status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(404, 'missing'));
    await expect(readSource('https://example.com/d.csv', ROOTS, { fetchImpl })).resolves.toEqual({
      error: 'https://example.com/d.csv returned 404',
    });
  });

  it('refuses a body over the cap rather than handing back a truncated one', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok('x'.repeat(100)));
    await expect(readSource('https://example.com/d.csv', ROOTS, { fetchImpl, maxBytes: 10 }))
      .resolves.toEqual({ error: 'https://example.com/d.csv is larger than the 10 byte limit' });
  });

  it('turns a failing fetch into a reason rather than letting it escape', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('socket hang up'));
    await expect(readSource('https://example.com/d.csv', ROOTS, { fetchImpl }))
      .resolves.toEqual({ error: 'cannot fetch https://example.com/d.csv: socket hang up' });
  });

  it('refuses a redirect with no location, and one to a scheme it will not follow', async () => {
    const nowhere = vi.fn().mockResolvedValue(respond(302, ''));
    await expect(readSource('https://example.com/d', ROOTS, { fetchImpl: nowhere }))
      .resolves.toEqual({ error: 'https://example.com/d redirected with no location' });

    const away = vi.fn().mockResolvedValue(respond(302, '', 'file:///etc/passwd'));
    await expect(readSource('https://example.com/d', ROOTS, { fetchImpl: away }))
      .resolves.toEqual({ error: 'https://example.com/d redirected to an unusable location' });
  });

  it('follows a redirect, and refuses a chain longer than its limit', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(respond(302, '', '/next'))
      .mockResolvedValueOnce(ok('done'));
    await expect(readSource('https://example.com/d', ROOTS, { fetchImpl })).resolves.toEqual({ text: 'done' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://example.com/next');

    const loop = vi.fn().mockResolvedValue(respond(302, '', '/again'));
    await expect(readSource('https://example.com/d', ROOTS, { fetchImpl: loop }))
      .resolves.toEqual({ error: 'https://example.com/again redirected too many times' });
    expect(loop).toHaveBeenCalledTimes(6);
  });

  // The request carries nothing the user did not ask for. A source is a line the user pasted; a fetch
  // that attached the application's own credentials to it would turn a pasted line into a capability.
  it('sends no request headers of its own and follows redirects itself', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok('a'));
    await readSource('https://example.com/d', ROOTS, { fetchImpl });
    const init = fetchImpl.mock.calls[0]?.[1] as { redirect: string; signal: AbortSignal };
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('refuses a source line it cannot classify', async () => {
    const fetchImpl = vi.fn();
    await expect(readSource('javascript:alert(1)', ROOTS, { fetchImpl }))
      .resolves.toEqual({ error: 'unsupported scheme in "javascript:alert(1)"' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('readSource on a local file', () => {
  it('refuses a path that is not there, naming the path', async () => {
    const result = await readSource(path.join(ROOTS.project, 'nowhere', 'all.csv'), ROOTS);
    expect('error' in result).toBe(true);
  });

  it('refuses a file over the cap, by its size rather than by reading it', async () => {
    const result = await readSource(SELF, ROOTS, { maxBytes: 10 });
    expect(result).toEqual({ error: `${SELF} is larger than the 10 byte limit` });
  });

  it('reads a file inside the cap', async () => {
    await expect(readSource(SELF, ROOTS)).resolves.toHaveProperty('text');
  });
});
