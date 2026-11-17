import { describe, expect, it } from 'vitest';
import type { WebSearchCapability, WebSearchRequest } from './contract.js';
import { provider } from './tavily.js';

const REQUEST: WebSearchRequest = { query: 'node.js', numResults: 5, depth: 'basic' };

function capability(fetcher: typeof fetch, signal?: AbortSignal): WebSearchCapability {
  return signal
    ? { apiKey: 'test-key', fetch: fetcher, signal }
    : { apiKey: 'test-key', fetch: fetcher };
}

describe('the Tavily provider', () => {
  it('sends the documented request', async () => {
    let receivedUrl: URL | undefined;
    let receivedInit: RequestInit | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      receivedUrl = new URL(String(input));
      receivedInit = init;
      return Response.json({ results: [] });
    };

    await provider.search(REQUEST, capability(fetcher));

    expect(receivedUrl?.href).toBe('https://api.tavily.com/search');
    expect(receivedInit?.method).toBe('POST');
    const headers = new Headers(receivedInit?.headers);
    expect(headers.get('authorization')).toBe('Bearer test-key');
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(receivedInit?.body))).toEqual({
      query: 'node.js',
      max_results: 5,
      search_depth: 'basic',
      topic: 'general',
    });
  });

  it('maps advanced depth onto search_depth', async () => {
    const bodies: unknown[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ results: [] });
    };

    await provider.search({ ...REQUEST, depth: 'advanced' }, capability(fetcher));

    expect(bodies[0]).toEqual({
      query: 'node.js',
      max_results: 5,
      search_depth: 'advanced',
      topic: 'general',
    });
  });

  it('decodes content as the snippet in returned order', async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({
        results: [
          { title: 'B', url: 'https://b.example/', content: 'second', score: 0.1 },
          { title: 'A', url: 'https://a.example/', content: 'first', score: 0.9 },
        ],
      });

    await expect(provider.search(REQUEST, capability(fetcher))).resolves.toEqual([
      { title: 'B', url: 'https://b.example/', snippet: 'second' },
      { title: 'A', url: 'https://a.example/', snippet: 'first' },
    ]);
  });

  it('refuses a body without a results array', async () => {
    const fetcher: typeof fetch = async () => Response.json({ answer: 'no results' });

    await expect(provider.search(REQUEST, capability(fetcher))).rejects.toThrow(
      'invalid response',
    );
  });

  it('skips an entry without a string url', async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({
        results: [
          { title: 'missing' },
          { title: 'number', url: 3 },
          { title: 'kept', url: 'https://kept.example/', content: 'kept snippet' },
        ],
      });

    await expect(provider.search(REQUEST, capability(fetcher))).resolves.toEqual([
      { title: 'kept', url: 'https://kept.example/', snippet: 'kept snippet' },
    ]);
  });

  it('sends a site-restricted query unchanged', async () => {
    const bodies: unknown[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ results: [] });
    };
    const query = 'site:nodejs.org permission model';

    await provider.search({ ...REQUEST, query }, capability(fetcher));

    expect(bodies[0]).toMatchObject({ query });
  });

  it('reports a 401 status line', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(null, { status: 401, statusText: 'Unauthorized' });

    await expect(provider.search(REQUEST, capability(fetcher))).rejects.toThrow(
      'HTTP 401 Unauthorized',
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
