import { describe, expect, it } from 'vitest';
import type { WebSearchCapability, WebSearchRequest } from './contract.js';
import { provider } from './tinyfish.js';

const REQUEST: WebSearchRequest = { query: 'node.js', numResults: 5, depth: 'basic' };

type Call = { url: URL; init: RequestInit | undefined };

function capability(fetcher: typeof fetch, signal?: AbortSignal): WebSearchCapability {
  return signal
    ? { apiKey: 'test-key', fetch: fetcher, signal }
    : { apiKey: 'test-key', fetch: fetcher };
}

function recordingFetcher(calls: Call[]): typeof fetch {
  return async (input, init) => {
    calls.push({ url: new URL(String(input)), init });
    return Response.json({ results: [] });
  };
}

describe('the TinyFish provider', () => {
  it('sends only the query as a GET to the documented URL', async () => {
    const calls: Call[] = [];
    const fetcher = recordingFetcher(calls);

    await provider.search({ ...REQUEST, query: 'node.js permission model' }, capability(fetcher));

    expect(calls[0]?.url.origin).toBe('https://api.search.tinyfish.ai');
    expect(calls[0]?.url.pathname).toBe('/');
    expect([...(calls[0]?.url.searchParams ?? [])]).toEqual([
      ['query', 'node.js permission model'],
    ]);
    expect(calls[0]?.init?.method).toBe('GET');
    expect(calls[0]?.init?.body).toBeUndefined();
    expect(new Headers(calls[0]?.init?.headers).get('x-api-key')).toBe('test-key');
  });

  it('ignores depth', async () => {
    const calls: Call[] = [];
    const fetcher = recordingFetcher(calls);

    await provider.search({ ...REQUEST, depth: 'basic' }, capability(fetcher));
    await provider.search({ ...REQUEST, depth: 'advanced' }, capability(fetcher));

    expect(calls[0]?.url.href).toBe(calls[1]?.url.href);
    expect(calls[0]?.init?.method).toBe(calls[1]?.init?.method);
    expect(calls[0]?.init?.body).toBe(calls[1]?.init?.body);
    expect([...new Headers(calls[0]?.init?.headers)]).toEqual([
      ...new Headers(calls[1]?.init?.headers),
    ]);
  });

  it('keeps returned order even when position disagrees', async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({
        results: [
          { position: 3, title: 'Third', url: 'https://third.example/', snippet: 'three' },
          { position: 1, title: 'First', url: 'https://first.example/', snippet: 'one' },
        ],
      });

    await expect(provider.search(REQUEST, capability(fetcher))).resolves.toEqual([
      { title: 'Third', url: 'https://third.example/', snippet: 'three' },
      { title: 'First', url: 'https://first.example/', snippet: 'one' },
    ]);
  });

  it('refuses a body without a results array', async () => {
    const fetcher: typeof fetch = async () => Response.json({ results: null });

    await expect(provider.search(REQUEST, capability(fetcher))).rejects.toThrow(
      'invalid response',
    );
  });

  it('reports a 400 status line', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(null, { status: 400, statusText: 'Bad Request' });

    await expect(provider.search(REQUEST, capability(fetcher))).rejects.toThrow(
      'HTTP 400 Bad Request',
    );
  });

  it('reports a timeout', async () => {
    const fetcher: typeof fetch = async () => {
      throw new DOMException('deadline', 'TimeoutError');
    };

    await expect(provider.search(REQUEST, capability(fetcher))).rejects.toThrow(
      'timed out after 30 s',
    );
  });

  it('rethrows a prompt abort unchanged', async () => {
    const controller = new AbortController();
    controller.abort();
    const reason = controller.signal.reason;
    const fetcher: typeof fetch = async () => {
      throw reason;
    };

    await expect(provider.search(REQUEST, capability(fetcher, controller.signal))).rejects.toBe(
      reason,
    );
  });
});
