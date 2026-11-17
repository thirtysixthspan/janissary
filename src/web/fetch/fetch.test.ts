import { describe, expect, it, vi } from 'vitest';
import type { ProjectTokens } from '../../project/tokens.js';
import type { WebFetchCommand } from './command.js';
import { ProviderRequestError, WEB_PROVIDER_API_VERSION } from '../providers/contract.js';
import type {
  WebFetchFormat,
  WebFetchRequest,
  WebFetchResult,
  WebSearchCapability,
  WebSearchProviderManifest,
  WebSearchProviderModule,
} from '../providers/contract.js';
import { webProviderCatalog } from '../providers/catalog.js';
import { createProviderRegistry } from '../providers/registry.js';
import type { ProviderRegistry } from '../providers/registry.js';
import { runWebFetch, webFetch, webFetchProviderNames } from './fetch.js';

const PAGE_URL = 'https://example.com/page';
const ANSWER_URL = 'https://example.com/';

const TOKENS: ProjectTokens = { tavily: 'tavily-key', tinyfish: 'tinyfish-key' };

type FetchFn = (
  request: WebFetchRequest,
  capability: WebSearchCapability,
) => Promise<WebFetchResult>;

type ProviderId = 'tavily' | 'tinyfish' | 'local';

const FORMATS: Record<ProviderId, readonly WebFetchFormat[]> = {
  tavily: ['markdown', 'text'],
  tinyfish: ['markdown', 'html'],
  local: ['markdown', 'text', 'html'],
};

type ProviderOptions = { tokenless?: boolean; formats?: readonly WebFetchFormat[] };

function page(url: string = ANSWER_URL, content = 'hello'): WebFetchResult {
  return { url, content };
}

function redirect(url: string): WebFetchResult {
  return { redirectedTo: url };
}

const answer: FetchFn = async () => page();

function requestError(reason: string): FetchFn {
  return async () => {
    throw new ProviderRequestError(reason);
  };
}

function pluginError(reason: string): FetchFn {
  return async () => {
    throw new Error(reason);
  };
}

function fakeFetchProvider(id: ProviderId, fetch: FetchFn = answer, options: ProviderOptions = {}) {
  const fetchSpy = vi.fn(fetch);
  const module: WebSearchProviderModule = { provider: { fetch: fetchSpy } };
  const token = options.tokenless || id === 'local' ? undefined : id;
  const manifest = {
    id,
    apiVersion: WEB_PROVIDER_API_VERSION,
    ...(token !== undefined && { token }),
    fetchFormats: options.formats ?? FORMATS[id],
    activate: vi.fn(async () => module),
  } satisfies WebSearchProviderManifest;
  return { manifest, fetch: fetchSpy };
}

function registryWith(...providers: { manifest: WebSearchProviderManifest }[]): ProviderRegistry {
  return createProviderRegistry(providers.map(({ manifest }) => manifest));
}

function command(overrides: Partial<WebFetchCommand> = {}): WebFetchCommand {
  return {
    url: PAGE_URL,
    format: 'markdown',
    timeoutSeconds: 30,
    maxChars: 10_000,
    offset: 0,
    provider: 'auto',
    ...overrides,
  };
}

function fakeFetch(): typeof fetch {
  return vi.fn<typeof fetch>(async () => Response.json({}));
}

function deps(signal?: AbortSignal, reportDisabled?: (name: string, reason: string) => void) {
  return { tokens: TOKENS, fetch: fakeFetch(), signal, reportDisabled };
}

describe('runWebFetch', () => {
  it('falls back through failures and prints only the first answer', async () => {
    const tavily = fakeFetchProvider('tavily', requestError('HTTP 500 Internal Server Error'));
    const tinyfish = fakeFetchProvider('tinyfish', requestError('could not fetch: bot_blocked'));
    const local = fakeFetchProvider('local', answer, { tokenless: true });

    const text = await runWebFetch(
      registryWith(tavily, tinyfish, local),
      command(),
      deps(),
    );

    expect(text).toBe(`Fetched ${ANSWER_URL} (local).\n\nhello`);
    expect(tavily.fetch).toHaveBeenCalledOnce();
    expect(tinyfish.fetch).toHaveBeenCalledOnce();
    expect(local.fetch).toHaveBeenCalledOnce();
  });

  it('prints one failure for an explicit provider without falling back', async () => {
    const tavily = fakeFetchProvider('tavily', requestError('HTTP 500 Internal Server Error'));
    const tinyfish = fakeFetchProvider('tinyfish');
    const local = fakeFetchProvider('local', answer, { tokenless: true });

    const text = await runWebFetch(
      registryWith(tavily, tinyfish, local),
      command({ provider: 'tavily' }),
      deps(),
    );

    expect(text).toBe('Web fetch failed (tavily): HTTP 500 Internal Server Error.');
    expect(tinyfish.manifest.activate).not.toHaveBeenCalled();
    expect(local.manifest.activate).not.toHaveBeenCalled();
  });

  it('prints every failure in attempt order when all attempts fail', async () => {
    const tavily = fakeFetchProvider('tavily', requestError('HTTP 500 Internal Server Error'));
    const tinyfish = fakeFetchProvider('tinyfish', requestError('could not fetch: bot_blocked'));
    const local = fakeFetchProvider('local', requestError('not found'), { tokenless: true });

    const text = await runWebFetch(registryWith(tavily, tinyfish, local), command(), deps());

    expect(text).toBe([
      'Web fetch: every attempt failed.',
      '- tavily: HTTP 500 Internal Server Error',
      '- tinyfish: could not fetch: bot_blocked',
      '- local: not found',
    ].join('\n'));
  });

  it('tries only an explicit provider even when the others are configured', async () => {
    const tavily = fakeFetchProvider('tavily');
    const tinyfish = fakeFetchProvider('tinyfish', requestError('could not fetch: bot_blocked'));
    const local = fakeFetchProvider('local', answer, { tokenless: true });

    const text = await runWebFetch(
      registryWith(tavily, tinyfish, local),
      command({ provider: 'tinyfish' }),
      deps(),
    );

    expect(text).toBe('Web fetch failed (tinyfish): could not fetch: bot_blocked.');
    expect(tavily.manifest.activate).not.toHaveBeenCalled();
    expect(local.manifest.activate).not.toHaveBeenCalled();
  });

  it('returns the unknown-provider line unchanged without activating or fetching', async () => {
    const tavily = fakeFetchProvider('tavily');
    const tinyfish = fakeFetchProvider('tinyfish');
    const local = fakeFetchProvider('local', answer, { tokenless: true });
    const fetchStub = fakeFetch();

    const text = await runWebFetch(
      registryWith(tavily, tinyfish, local),
      command({ provider: 'bing' }),
      { tokens: TOKENS, fetch: fetchStub },
    );

    expect(text).toBe('Web fetch: unknown provider "bing" (available: auto, tavily, tinyfish, local).');
    expect(tavily.manifest.activate).not.toHaveBeenCalled();
    expect(tinyfish.manifest.activate).not.toHaveBeenCalled();
    expect(local.manifest.activate).not.toHaveBeenCalled();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('prints a redirect from the first attempt without falling back', async () => {
    const tavily = fakeFetchProvider('tavily', async () => redirect('https://www.example.com/'));
    const tinyfish = fakeFetchProvider('tinyfish');

    const text = await runWebFetch(registryWith(tavily, tinyfish), command(), deps());

    expect(text).toBe('Web fetch: redirected to https://www.example.com/.');
    expect(tinyfish.manifest.activate).not.toHaveBeenCalled();
  });

  it('prints the empty-page answer without falling back', async () => {
    const tavily = fakeFetchProvider('tavily', async () => page(PAGE_URL, ''));
    const tinyfish = fakeFetchProvider('tinyfish');

    const text = await runWebFetch(registryWith(tavily, tinyfish), command(), deps());

    expect(text).toBe(`Fetched ${PAGE_URL} (tavily).\n\n(empty page)`);
    expect(tinyfish.manifest.activate).not.toHaveBeenCalled();
  });

  it('prints the past-the-end answer for an offset beyond a short page', async () => {
    const tavily = fakeFetchProvider('tavily', async () => page(PAGE_URL, 'hello'));
    const tinyfish = fakeFetchProvider('tinyfish');

    const text = await runWebFetch(registryWith(tavily, tinyfish), command({ offset: 10 }), deps());

    expect(text).toBe(
      `Fetched ${PAGE_URL} (tavily).\n\n(offset 10 is past the end; the page has 5 characters)`,
    );
    expect(tinyfish.manifest.activate).not.toHaveBeenCalled();
  });

  it('passes the full timeout and format to every attempt and skips providers that do not serve it', async () => {
    const tavily = fakeFetchProvider('tavily', requestError('HTTP 500'));
    const tinyfish = fakeFetchProvider('tinyfish', requestError('HTTP 500'));
    const local = fakeFetchProvider('local', requestError('HTTP 500'), { tokenless: true });

    await runWebFetch(
      registryWith(tavily, tinyfish, local),
      command({ timeoutSeconds: 45, format: 'text' }),
      deps(),
    );

    expect(tinyfish.manifest.activate).not.toHaveBeenCalled();
    expect(tavily.fetch.mock.calls[0]?.[0]).toStrictEqual({ url: PAGE_URL, format: 'text', timeoutMs: 45_000 });
    expect(local.fetch.mock.calls[0]?.[0]).toStrictEqual({ url: PAGE_URL, format: 'text', timeoutMs: 45_000 });
  });

  it('builds each capability from the provider token, the injected fetch, and the signal', async () => {
    const tavily = fakeFetchProvider('tavily', requestError('HTTP 500'));
    const local = fakeFetchProvider('local', answer, { tokenless: true });
    const fetchStub = fakeFetch();
    const controller = new AbortController();

    await runWebFetch(registryWith(tavily, local), command(), {
      tokens: TOKENS,
      fetch: fetchStub,
      signal: controller.signal,
    });

    const capability = tavily.fetch.mock.calls[0]?.[1];
    expect(capability?.apiKey).toBe('tavily-key');
    expect(capability?.fetch).toBe(fetchStub);
    expect(capability?.signal).toBe(controller.signal);
    expect(Object.keys(capability ?? {})).toEqual(['apiKey', 'fetch', 'signal']);
    expect(local.fetch.mock.calls[0]?.[1]?.apiKey).toBe('');
  });

  it('gives each attempt its own request when a provider mutates what it receives', async () => {
    const first = fakeFetchProvider('tavily', async (request) => {
      request.url = 'https://mutated.example/';
      request.timeoutMs = 1;
      throw new ProviderRequestError('HTTP 500');
    });
    const second = fakeFetchProvider('tinyfish');

    await runWebFetch(registryWith(first, second), command(), deps());

    expect(second.fetch.mock.calls[0]?.[0]).toStrictEqual({
      url: PAGE_URL,
      format: 'markdown',
      timeoutMs: 30_000,
    });
  });

  it('reports a plugin failure once and still falls back, with or without a reporter', async () => {
    const reportDisabled = vi.fn();
    const first = fakeFetchProvider('tavily', pluginError('boom.'));
    const second = fakeFetchProvider('tinyfish');

    const text = await runWebFetch(registryWith(first, second), command(), deps(undefined, reportDisabled));

    expect(text).toBe(`Fetched ${ANSWER_URL} (tinyfish).\n\nhello`);
    expect(reportDisabled).toHaveBeenCalledOnce();
    expect(reportDisabled).toHaveBeenCalledWith('tavily', 'provider failed: boom');

    const silentFirst = fakeFetchProvider('tavily', pluginError('boom.'));
    const silentSecond = fakeFetchProvider('tinyfish');
    await expect(runWebFetch(registryWith(silentFirst, silentSecond), command(), deps()))
      .resolves.toBe(`Fetched ${ANSWER_URL} (tinyfish).\n\nhello`);
  });

  it('rejects with the abort before returning a resolution line', async () => {
    const controller = new AbortController();
    const abortError = new Error('cancelled before resolving');
    controller.abort(abortError);
    const tavily = fakeFetchProvider('tavily');
    const fetchStub = fakeFetch();

    await expect(runWebFetch(registryWith(tavily), command({ provider: 'bing' }), {
      tokens: TOKENS,
      fetch: fetchStub,
      signal: controller.signal,
    })).rejects.toBe(abortError);
    expect(tavily.manifest.activate).not.toHaveBeenCalled();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('rejects before starting any attempt when the signal is already aborted', async () => {
    const controller = new AbortController();
    const abortError = new Error('cancelled before the attempt');
    controller.abort(abortError);
    const tavily = fakeFetchProvider('tavily');

    await expect(runWebFetch(registryWith(tavily), command(), {
      tokens: TOKENS,
      fetch: fakeFetch(),
      signal: controller.signal,
    })).rejects.toBe(abortError);
    expect(tavily.manifest.activate).not.toHaveBeenCalled();
  });

  it('starts no second attempt when the signal aborts as the first failure is reported', async () => {
    const controller = new AbortController();
    const abortError = new Error('cancelled between attempts');
    const first = fakeFetchProvider('tavily', pluginError('boom.'));
    const second = fakeFetchProvider('tinyfish');
    const reportDisabled = vi.fn(() => {
      controller.abort(abortError);
    });

    await expect(runWebFetch(registryWith(first, second), command(), deps(controller.signal, reportDisabled)))
      .rejects.toBe(abortError);
    expect(reportDisabled).toHaveBeenCalledWith('tavily', 'provider failed: boom');
    expect(second.manifest.activate).not.toHaveBeenCalled();
  });

  it('rejects when a page resolves after the signal aborted', async () => {
    const controller = new AbortController();
    const abortError = new Error('cancelled during the fetch');
    const tavily = fakeFetchProvider('tavily', async () => {
      controller.abort(abortError);
      return page();
    });

    await expect(runWebFetch(registryWith(tavily), command(), {
      tokens: TOKENS,
      fetch: fakeFetch(),
      signal: controller.signal,
    })).rejects.toBe(abortError);
  });

  it('rejects when a redirect resolves after the signal aborted', async () => {
    const controller = new AbortController();
    const abortError = new Error('cancelled during the fetch');
    const tavily = fakeFetchProvider('tavily', async () => {
      controller.abort(abortError);
      return redirect('https://www.example.com/');
    });

    await expect(runWebFetch(registryWith(tavily), command(), {
      tokens: TOKENS,
      fetch: fakeFetch(),
      signal: controller.signal,
    })).rejects.toBe(abortError);
  });

  it('rejects with the thrown error when a provider aborts and then throws', async () => {
    const controller = new AbortController();
    const abortError = new Error('cancelled during the fetch');
    const thrown = new Error('late failure');
    const first = fakeFetchProvider('tavily', async () => {
      controller.abort(abortError);
      throw thrown;
    });
    const second = fakeFetchProvider('tinyfish');

    await expect(runWebFetch(registryWith(first, second), command(), {
      tokens: TOKENS,
      fetch: fakeFetch(),
      signal: controller.signal,
    })).rejects.toBe(thrown);
    expect(second.manifest.activate).not.toHaveBeenCalled();
  });

  it('rejects when the only attempt fails as the signal aborts', async () => {
    const controller = new AbortController();
    const abortError = new Error('cancelled on the final failure');
    const only = fakeFetchProvider('tavily', pluginError('boom.'));
    const reportDisabled = vi.fn(() => {
      controller.abort(abortError);
    });

    await expect(runWebFetch(registryWith(only), command(), deps(controller.signal, reportDisabled)))
      .rejects.toBe(abortError);
    expect(reportDisabled).toHaveBeenCalledWith('tavily', 'provider failed: boom');
  });
});

describe('the module registry', () => {
  it('exposes the bundled fetch provider names in catalog order without activating a provider', () => {
    const activations = webProviderCatalog.map((manifest) => vi.spyOn(manifest, 'activate'));
    try {
      expect(webFetchProviderNames()).toEqual(['tavily', 'tinyfish', 'local']);
      for (const activation of activations) expect(activation).not.toHaveBeenCalled();
    } finally {
      for (const activation of activations) activation.mockRestore();
    }
  });

  it('runs webFetch against the bundled registry without sending a request', async () => {
    const activations = webProviderCatalog.map((manifest) => vi.spyOn(manifest, 'activate'));
    const fetchStub = fakeFetch();
    try {
      await expect(webFetch(command({ provider: 'tavily' }), { tokens: {}, fetch: fetchStub }))
        .resolves.toBe('Web fetch: provider "tavily" is not configured.');
      for (const activation of activations) expect(activation).not.toHaveBeenCalled();
      expect(fetchStub).not.toHaveBeenCalled();
    } finally {
      for (const activation of activations) activation.mockRestore();
    }
  });
});
