import { describe, expect, it, vi } from 'vitest';
import { PROVIDER_TIMEOUT_MS } from '../../models/providers/result.js';
import { ProviderRequestError, type WebSearchCapability } from './contract.js';
import { requestJson } from './http.js';

const SEARCH_URL = 'https://api.example.com/search';
const REQUEST = {
  method: 'POST',
  headers: { authorization: 'Bearer test-key' },
  body: '{"q":"node"}',
};

function capability(fetcher: typeof fetch, signal?: AbortSignal): WebSearchCapability {
  return signal
    ? { apiKey: 'test-key', fetch: fetcher, signal }
    : { apiKey: 'test-key', fetch: fetcher };
}

describe('requestJson', () => {
  it('resolves the parsed body and sends the given request with a signal', async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      requests.push({ url: String(input), init });
      return Response.json({ results: [{ url: 'https://example.com/' }] });
    });

    await expect(requestJson(capability(fetcher), SEARCH_URL, REQUEST, PROVIDER_TIMEOUT_MS)).resolves.toEqual({
      results: [{ url: 'https://example.com/' }],
    });
    expect(requests[0]?.url).toBe(SEARCH_URL);
    expect(requests[0]?.init).toMatchObject(REQUEST);
    expect(requests[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports the HTTP status line and never reads the body', async () => {
    const text = vi.fn(async () => 'ignored');
    const response = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text,
    } as unknown as Response;
    const fetcher: typeof fetch = async () => response;

    await expect(requestJson(capability(fetcher), SEARCH_URL, REQUEST, PROVIDER_TIMEOUT_MS)).rejects.toThrow(
      'HTTP 429 Too Many Requests',
    );
    await expect(requestJson(capability(fetcher), SEARCH_URL, REQUEST, PROVIDER_TIMEOUT_MS)).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
    expect(text).not.toHaveBeenCalled();
  });

  it('omits an empty status text', async () => {
    const fetcher: typeof fetch = async () => new Response(null, { status: 500 });

    await expect(requestJson(capability(fetcher), SEARCH_URL, REQUEST, PROVIDER_TIMEOUT_MS)).rejects.toThrow(
      'HTTP 500',
    );
  });

  it('classifies a timeout rejection', async () => {
    const fetcher: typeof fetch = async () => {
      throw new DOMException('deadline', 'TimeoutError');
    };

    await expect(requestJson(capability(fetcher), SEARCH_URL, REQUEST, PROVIDER_TIMEOUT_MS)).rejects.toThrow(
      'timed out after 30 s',
    );
  });

  it('reports the first line of a network rejection', async () => {
    const fetcher: typeof fetch = async () => {
      throw new TypeError('fetch failed\ncause: ECONNRESET');
    };

    await expect(requestJson(capability(fetcher), SEARCH_URL, REQUEST, PROVIDER_TIMEOUT_MS)).rejects.toThrow(
      'fetch failed',
    );
  });

  it('reports a non-JSON or empty body as invalid response', async () => {
    const notJson: typeof fetch = async () => new Response('not json');
    const empty: typeof fetch = async () => new Response('');

    await expect(requestJson(capability(notJson), SEARCH_URL, REQUEST, PROVIDER_TIMEOUT_MS)).rejects.toThrow(
      'invalid response',
    );
    await expect(requestJson(capability(empty), SEARCH_URL, REQUEST, PROVIDER_TIMEOUT_MS)).rejects.toThrow(
      'invalid response',
    );
  });

  it('classifies a body read timeout as a timeout rather than an invalid response', async () => {
    const response = {
      ok: true,
      text: async () => {
        throw new DOMException('deadline', 'TimeoutError');
      },
    } as unknown as Response;
    const fetcher: typeof fetch = async () => response;

    await expect(requestJson(capability(fetcher), SEARCH_URL, REQUEST, PROVIDER_TIMEOUT_MS)).rejects.toThrow(
      'timed out after 30 s',
    );
  });

  it('rethrows an abort from the capability signal unchanged', async () => {
    const controller = new AbortController();
    controller.abort();
    const reason = controller.signal.reason;
    const fetcher: typeof fetch = async () => {
      throw reason;
    };

    await expect(
      requestJson(capability(fetcher, controller.signal), SEARCH_URL, REQUEST, PROVIDER_TIMEOUT_MS),
    ).rejects.toBe(reason);
  });

  it('lets an abort win over a TimeoutError rejection', async () => {
    const controller = new AbortController();
    controller.abort();
    const timeout = new DOMException('deadline', 'TimeoutError');
    const fetcher: typeof fetch = async () => {
      throw timeout;
    };

    await expect(
      requestJson(capability(fetcher, controller.signal), SEARCH_URL, REQUEST, PROVIDER_TIMEOUT_MS),
    ).rejects.toBe(timeout);
  });

  it('aborts the signal fetch received when the capability signal aborts', async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      received = init?.signal ?? undefined;
      return Response.json({});
    };

    await requestJson(capability(fetcher, controller.signal), SEARCH_URL, REQUEST, PROVIDER_TIMEOUT_MS);
    expect(received?.aborted).toBe(false);
    controller.abort();
    expect(received?.aborted).toBe(true);
  });

  it('passes a timeout signal when the capability has no signal', async () => {
    let received: AbortSignal | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      received = init?.signal ?? undefined;
      return Response.json({});
    };

    await requestJson(capability(fetcher), SEARCH_URL, REQUEST, PROVIDER_TIMEOUT_MS);
    expect(received).toBeInstanceOf(AbortSignal);
  });

  it('reports the given timeout duration for a timeout rejection', async () => {
    const fetcher: typeof fetch = async () => {
      throw new DOMException('deadline', 'TimeoutError');
    };

    await expect(requestJson(capability(fetcher), SEARCH_URL, REQUEST, 45_000)).rejects.toThrow(
      'timed out after 45 s',
    );
  });

  it('reports the given timeout duration for a body read timeout', async () => {
    const response = {
      ok: true,
      text: async () => {
        throw new DOMException('deadline', 'TimeoutError');
      },
    } as unknown as Response;
    const fetcher: typeof fetch = async () => response;

    await expect(requestJson(capability(fetcher), SEARCH_URL, REQUEST, 45_000)).rejects.toThrow(
      'timed out after 45 s',
    );
  });

  it('rejects with the real timeout reason when a capability signal never aborts', async () => {
    const controller = new AbortController();
    const fetcher: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => {
          reject(signal.reason);
        });
      });

    const result = requestJson(capability(fetcher, controller.signal), SEARCH_URL, REQUEST, 10);
    await expect(result).rejects.toBeInstanceOf(ProviderRequestError);
    await expect(result).rejects.toThrow('timed out after 0.01 s');
  });

  it('rejects with the real timeout reason when there is no capability signal', async () => {
    const fetcher: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => {
          reject(signal.reason);
        });
      });

    const result = requestJson(capability(fetcher), SEARCH_URL, REQUEST, 10);
    await expect(result).rejects.toBeInstanceOf(ProviderRequestError);
    await expect(result).rejects.toThrow('timed out after 0.01 s');
  });
});
