import { describe, expect, it } from 'vitest';
import type { WebFetchRequest, WebSearchCapability, WebSearchRequest } from './contract.js';
import { provider } from './tinyfish.js';

const REQUEST: WebSearchRequest = { query: 'node.js', numResults: 5, depth: 'basic' };
const FETCH_REQUEST: WebFetchRequest = {
  url: 'https://example.com/page',
  format: 'markdown',
  timeoutMs: 30_000,
};

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

function recordingPageFetcher(calls: Call[]): typeof fetch {
  return async (input, init) => {
    calls.push({ url: new URL(String(input)), init });
    return Response.json({
      results: [{ text: 'page body', final_url: 'https://example.com/final' }],
    });
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

describe('the TinyFish provider fetch', () => {
  it('sends the documented request', async () => {
    const calls: Call[] = [];
    const fetcher = recordingPageFetcher(calls);

    await provider.fetch(FETCH_REQUEST, capability(fetcher));

    expect(calls[0]?.url.origin).toBe('https://api.fetch.tinyfish.ai');
    expect(calls[0]?.url.pathname).toBe('/');
    expect(calls[0]?.init?.method).toBe('POST');
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('x-api-key')).toBe('test-key');
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      urls: ['https://example.com/page'],
      format: 'markdown',
      ttl: 0,
      per_url_timeout_ms: 30_000,
    });
  });

  it('sends the html format through', async () => {
    let body: unknown;
    const fetcher: typeof fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ results: [{ text: 'body' }] });
    };

    await provider.fetch({ ...FETCH_REQUEST, format: 'html' }, capability(fetcher));

    expect(body).toMatchObject({ format: 'html' });
  });

  it('caps the sent per-url timeout at 110000 ms', async () => {
    const timeouts: number[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { per_url_timeout_ms: number };
      timeouts.push(body.per_url_timeout_ms);
      return Response.json({ results: [{ text: 'body' }] });
    };

    await provider.fetch({ ...FETCH_REQUEST, timeoutMs: 120_000 }, capability(fetcher));
    await provider.fetch({ ...FETCH_REQUEST, timeoutMs: 45_000 }, capability(fetcher));

    expect(timeouts).toEqual([110_000, 45_000]);
  });

  it('reports a timeout against the full core timeout', async () => {
    const fetcher: typeof fetch = async () => {
      throw new DOMException('deadline', 'TimeoutError');
    };

    await expect(provider.fetch({ ...FETCH_REQUEST, timeoutMs: 120_000 }, capability(fetcher)))
      .rejects.toThrow('timed out after 120 s');
  });

  it('returns the content and final url', async () => {
    const fetcher: typeof fetch = async () => Response.json({
      results: [{ text: 'page body', final_url: 'https://example.com/final' }],
    });

    await expect(provider.fetch(FETCH_REQUEST, capability(fetcher))).resolves.toEqual({
      url: 'https://example.com/final',
      content: 'page body',
    });
  });

  it('falls back to the requested url when the final url is missing or empty', async () => {
    const missing = async () => Response.json({ results: [{ text: 'body' }] });
    const empty = async () => Response.json({ results: [{ text: 'body', final_url: '' }] });

    await expect(provider.fetch(FETCH_REQUEST, capability(missing))).resolves.toEqual({
      url: 'https://example.com/page',
      content: 'body',
    });
    await expect(provider.fetch(FETCH_REQUEST, capability(empty))).resolves.toEqual({
      url: 'https://example.com/page',
      content: 'body',
    });
  });

  it('returns empty content as an answer', async () => {
    const fetcher: typeof fetch = async () => Response.json({
      results: [{ text: '' }],
    });

    await expect(provider.fetch(FETCH_REQUEST, capability(fetcher))).resolves.toEqual({
      url: 'https://example.com/page',
      content: '',
    });
  });

  it('reports an error entry using its first line', async () => {
    const fetcher: typeof fetch = async () => Response.json({
      errors: [{ error: 'bot_blocked' }],
    });

    await expect(provider.fetch(FETCH_REQUEST, capability(fetcher))).rejects.toThrow(
      'could not fetch: bot_blocked',
    );
  });

  it('reports the error ahead of a non-string result text', async () => {
    const fetcher: typeof fetch = async () => Response.json({
      results: [{ text: null }],
      errors: [{ error: 'bot_blocked' }],
    });

    await expect(provider.fetch(FETCH_REQUEST, capability(fetcher))).rejects.toThrow(
      'could not fetch: bot_blocked',
    );
  });

  it('refuses bodies without a usable page', async () => {
    const bodies = [
      {},
      { results: [], errors: [] },
      [],
      { results: [{ text: { value: 'not a string' } }] },
    ];
    for (const body of bodies) {
      const fetcher: typeof fetch = async () => Response.json(body);
      await expect(provider.fetch(FETCH_REQUEST, capability(fetcher))).rejects.toThrow(
        'invalid response',
      );
    }
  });

  it('reports a 401 status line', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(null, { status: 401, statusText: 'Unauthorized' });

    await expect(provider.fetch(FETCH_REQUEST, capability(fetcher))).rejects.toThrow(
      'HTTP 401 Unauthorized',
    );
  });

  it('rethrows a prompt abort unchanged', async () => {
    const controller = new AbortController();
    controller.abort();
    const reason = controller.signal.reason;
    const fetcher: typeof fetch = async () => {
      throw reason;
    };

    await expect(provider.fetch(FETCH_REQUEST, capability(fetcher, controller.signal))).rejects
      .toBe(reason);
  });
});
