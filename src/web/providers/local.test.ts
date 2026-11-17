import { describe, expect, it, vi } from 'vitest';
import type { BrowserProfile } from '../../user-agent.js';
import { ProviderRequestError, type WebFetchRequest, type WebSearchCapability } from './contract.js';
import { LOCAL_MAX_BODY_BYTES } from './local-body.js';
import { createLocalProvider, provider } from './local.js';

const REQUEST: WebFetchRequest = {
  url: 'https://example.com/page',
  format: 'markdown',
  timeoutMs: 30_000,
};

const PROFILE: BrowserProfile = {
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  platform: 'macOS',
  locale: 'en-GB',
  timezoneId: 'Europe/London',
  viewport: { width: 1440, height: 900 },
};

const HTML = { 'content-type': 'text/html' };

const http = (value: string) => `http:${value}`;

type Recorded = { url: string; init: RequestInit | undefined };

function capability(fetcher: typeof fetch, signal?: AbortSignal): WebSearchCapability {
  return signal ? { apiKey: '', fetch: fetcher, signal } : { apiKey: '', fetch: fetcher };
}

function local(fetcher: typeof fetch, profile: () => BrowserProfile = () => PROFILE) {
  return createLocalProvider({ profile });
}

function harness(respond: (call: number) => Response | Promise<Response>) {
  const calls: Recorded[] = [];
  const profile = vi.fn<() => BrowserProfile>(() => PROFILE);
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    calls.push({ url: String(input), init });
    return respond(calls.length - 1);
  });
  return { local: local(fetcher, profile), fetcher, profile, calls };
}

function watchedStream() {
  const cancel = vi.fn(async () => {});
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull() {
        pulls += 1;
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  return { stream, cancel, pulls: () => pulls };
}

describe('createLocalProvider', () => {
  it('upgrades a public http URL and reports the upgraded URL', async () => {
    const { local: subject, fetcher, calls } = harness(() => new Response('<p>hi</p>', { headers: HTML }));

    await expect(
      subject.fetch({ ...REQUEST, url: http('//example.com/a') }, capability(fetcher)),
    ).resolves.toEqual({ url: 'https://example.com/a', content: '<p>hi</p>' });
    expect(calls[0]?.url).toBe('https://example.com/a');
  });

  it('keeps http for a localhost URL', async () => {
    const { local: subject, fetcher, calls } = harness(() =>
      new Response('ok', { headers: { 'content-type': 'text/plain' } }),
    );

    await expect(
      subject.fetch({ ...REQUEST, url: 'http://localhost:8080/' }, capability(fetcher)),
    ).resolves.toEqual({ url: 'http://localhost:8080/', content: 'ok' });
    expect(calls[0]?.url).toBe('http://localhost:8080/');
  });

  it('returns a raw body in markdown format and normalizes a bare https host', async () => {
    const { local: subject, fetcher } = harness(() => new Response('<h1>raw</h1>', { headers: HTML }));

    await expect(
      subject.fetch({ ...REQUEST, url: 'https://example.com' }, capability(fetcher)),
    ).resolves.toEqual({ url: 'https://example.com/', content: '<h1>raw</h1>' });
  });

  it('sends one GET request with manual redirects, a signal, no body, and the browser headers', async () => {
    const { local: subject, fetcher, profile, calls } = harness(() => new Response('body', { headers: HTML }));

    await subject.fetch(REQUEST, capability(fetcher));

    expect(calls).toHaveLength(1);
    const init = calls[0]?.init;
    expect(init?.method).toBe('GET');
    expect(init?.redirect).toBe('manual');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init).not.toHaveProperty('body');
    expect(init).not.toHaveProperty('credentials');
    const headers = new Headers(init?.headers);
    expect(headers.get('user-agent')).toBe(PROFILE.userAgent);
    expect(headers.get('sec-ch-ua-platform')).toBe('"macOS"');
    expect(headers.get('accept-language')).toBe('en-GB,en;q=0.9');
    expect(headers.get('accept')).toBe('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    expect(profile).toHaveBeenCalledTimes(1);
  });

  it('calls the profile once per fetch request', async () => {
    const { local: subject, fetcher, profile, calls } = harness(() => new Response('body', { headers: HTML }));

    await subject.fetch(REQUEST, capability(fetcher));
    await subject.fetch(REQUEST, capability(fetcher));

    expect(calls).toHaveLength(2);
    expect(profile).toHaveBeenCalledTimes(2);
  });

  it('pins the exported provider to the default Chrome major version', async () => {
    const requests: Recorded[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response('body', { headers: HTML });
    };

    await provider.fetch(REQUEST, capability(fetcher));

    expect(new Headers(requests[0]?.init?.headers).get('user-agent')).toContain('Chrome/149.0.0.0');
  });

  it('returns an application/json body as received', async () => {
    const { local: subject, fetcher } = harness(() =>
      new Response('{"a":1}', { headers: { 'content-type': 'application/json' } }),
    );

    await expect(subject.fetch(REQUEST, capability(fetcher))).resolves.toEqual({
      url: REQUEST.url,
      content: '{"a":1}',
    });
  });

  it('returns an empty accepted body as empty content', async () => {
    const { local: subject, fetcher } = harness(() =>
      new Response('', { headers: { 'content-type': 'text/plain' } }),
    );

    await expect(subject.fetch(REQUEST, capability(fetcher))).resolves.toEqual({ url: REQUEST.url, content: '' });
  });

  it('decodes the declared charset', async () => {
    const { local: subject, fetcher } = harness(() =>
      new Response(new Uint8Array([0xe9]), { headers: { 'content-type': 'text/plain; charset=ISO-8859-1' } }),
    );

    await expect(subject.fetch(REQUEST, capability(fetcher))).resolves.toEqual({ url: REQUEST.url, content: 'é' });
  });

  it('fails on a non-2xx status and cancels the body', async () => {
    const { stream, cancel } = watchedStream();
    const { local: subject, fetcher } = harness(() =>
      new Response(stream, { status: 404, statusText: 'Not Found' }),
    );

    const result = subject.fetch(REQUEST, capability(fetcher));
    await expect(result).rejects.toThrow('HTTP 404 Not Found');
    await expect(result).rejects.toBeInstanceOf(ProviderRequestError);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('omits an empty status text', async () => {
    const { local: subject, fetcher } = harness(() => new Response(null, { status: 500 }));

    const result = subject.fetch(REQUEST, capability(fetcher));
    await expect(result).rejects.toThrow('HTTP 500');
    await expect(result).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it('fails on a 3xx without following the Location', async () => {
    const { local: subject, fetcher, calls } = harness(() =>
      new Response(null, {
        status: 302,
        statusText: 'Found',
        headers: { location: 'https://elsewhere.example/' },
      }),
    );

    const result = subject.fetch(REQUEST, capability(fetcher));
    await expect(result).rejects.toThrow('HTTP 302 Found');
    await expect(result).rejects.toBeInstanceOf(ProviderRequestError);
    expect(calls).toHaveLength(1);
  });

  it('refuses an unsupported content type, cancels the body, and pulls nothing', async () => {
    const { stream, cancel, pulls } = watchedStream();
    const { local: subject, fetcher } = harness(() =>
      new Response(stream, { headers: { 'content-type': 'application/pdf' } }),
    );

    const result = subject.fetch(REQUEST, capability(fetcher));
    await expect(result).rejects.toThrow('unsupported content type application/pdf');
    await expect(result).rejects.toBeInstanceOf(ProviderRequestError);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(pulls()).toBe(0);
  });

  it('refuses a declared length above the cap', async () => {
    const { local: subject, fetcher } = harness(() =>
      new Response('x', {
        headers: { 'content-type': 'text/plain', 'content-length': String(LOCAL_MAX_BODY_BYTES + 1) },
      }),
    );

    const result = subject.fetch(REQUEST, capability(fetcher));
    await expect(result).rejects.toThrow('response larger than 50 MB');
    await expect(result).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it('reports a timeout from the fetch rejection', async () => {
    const fetcher: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const received = init?.signal;
        received?.addEventListener('abort', () => reject(received.reason));
      });

    const result = local(fetcher).fetch({ ...REQUEST, timeoutMs: 10 }, capability(fetcher));
    await expect(result).rejects.toBeInstanceOf(ProviderRequestError);
    await expect(result).rejects.toThrow('timed out after 0.01 s');
  });

  it('reports a timeout from the body read with the same signal', async () => {
    const fetcher: typeof fetch = (_input, init) => {
      const received = init?.signal;
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            if (!received) return;
            if (received.aborted) {
              controller.error(received.reason);
              return;
            }
            received.addEventListener('abort', () => controller.error(received.reason), { once: true });
          },
        },
        { highWaterMark: 0 },
      );
      return Promise.resolve(new Response(stream, { headers: { 'content-type': 'text/plain' } }));
    };

    const result = local(fetcher).fetch({ ...REQUEST, timeoutMs: 10 }, capability(fetcher));
    await expect(result).rejects.toBeInstanceOf(ProviderRequestError);
    await expect(result).rejects.toThrow('timed out after 0.01 s');
  });

  it('reports the first line of a network rejection', async () => {
    const fetcher: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };

    const result = local(fetcher).fetch(REQUEST, capability(fetcher));
    await expect(result).rejects.toThrow('fetch failed');
    await expect(result).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it('rethrows an abort from the capability signal unchanged', async () => {
    const controller = new AbortController();
    controller.abort();
    const reason = controller.signal.reason;
    const fetcher: typeof fetch = async () => {
      throw reason;
    };

    await expect(
      local(fetcher).fetch(REQUEST, capability(fetcher, controller.signal)),
    ).rejects.toBe(reason);
  });

  it('rethrows an abort during the body read unchanged', async () => {
    const controller = new AbortController();
    controller.abort();
    const reason = controller.signal.reason;
    const fetcher: typeof fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull() {
            throw reason;
          },
        }),
        { headers: { 'content-type': 'text/plain' } },
      );

    await expect(
      local(fetcher).fetch(REQUEST, capability(fetcher, controller.signal)),
    ).rejects.toBe(reason);
  });
});
