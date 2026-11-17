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
import { localManifest, webProviderCatalog } from '../providers/catalog.js';
import { createProviderRegistry } from '../providers/registry.js';
import type { ProviderRegistry } from '../providers/registry.js';
import { runWebFetch, webFetch, webFetchProviderNames } from './fetch.js';
import { createFetchCache } from './cache.js';

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
      createFetchCache(),
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
      createFetchCache(),
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

    const text = await runWebFetch(registryWith(tavily, tinyfish, local), createFetchCache(), command(), deps());

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
      createFetchCache(),
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
      createFetchCache(),
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

    const text = await runWebFetch(registryWith(tavily, tinyfish), createFetchCache(), command(), deps());

    expect(text).toBe('Web fetch: redirected to https://www.example.com/.');
    expect(tinyfish.manifest.activate).not.toHaveBeenCalled();
  });

  it('prints the empty-page answer without falling back', async () => {
    const tavily = fakeFetchProvider('tavily', async () => page(PAGE_URL, ''));
    const tinyfish = fakeFetchProvider('tinyfish');

    const text = await runWebFetch(registryWith(tavily, tinyfish), createFetchCache(), command(), deps());

    expect(text).toBe(`Fetched ${PAGE_URL} (tavily).\n\n(empty page)`);
    expect(tinyfish.manifest.activate).not.toHaveBeenCalled();
  });

  it('prints the past-the-end answer for an offset beyond a short page', async () => {
    const tavily = fakeFetchProvider('tavily', async () => page(PAGE_URL, 'hello'));
    const tinyfish = fakeFetchProvider('tinyfish');

    const text = await runWebFetch(registryWith(tavily, tinyfish), createFetchCache(), command({ offset: 10 }), deps());

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
      createFetchCache(),
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

    await runWebFetch(registryWith(tavily, local), createFetchCache(), command(), {
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

    await runWebFetch(registryWith(first, second), createFetchCache(), command(), deps());

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

    const text = await runWebFetch(registryWith(first, second), createFetchCache(), command(), deps(undefined, reportDisabled));

    expect(text).toBe(`Fetched ${ANSWER_URL} (tinyfish).\n\nhello`);
    expect(reportDisabled).toHaveBeenCalledOnce();
    expect(reportDisabled).toHaveBeenCalledWith('tavily', 'provider failed: boom');

    const silentFirst = fakeFetchProvider('tavily', pluginError('boom.'));
    const silentSecond = fakeFetchProvider('tinyfish');
    await expect(runWebFetch(registryWith(silentFirst, silentSecond), createFetchCache(), command(), deps()))
      .resolves.toBe(`Fetched ${ANSWER_URL} (tinyfish).\n\nhello`);
  });

  it('rejects with the abort before returning a resolution line', async () => {
    const controller = new AbortController();
    const abortError = new Error('cancelled before resolving');
    controller.abort(abortError);
    const tavily = fakeFetchProvider('tavily');
    const fetchStub = fakeFetch();

    await expect(runWebFetch(registryWith(tavily), createFetchCache(), command({ provider: 'bing' }), {
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

    await expect(runWebFetch(registryWith(tavily), createFetchCache(), command(), {
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

    await expect(runWebFetch(registryWith(first, second), createFetchCache(), command(), deps(controller.signal, reportDisabled)))
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

    await expect(runWebFetch(registryWith(tavily), createFetchCache(), command(), {
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

    await expect(runWebFetch(registryWith(tavily), createFetchCache(), command(), {
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

    await expect(runWebFetch(registryWith(first, second), createFetchCache(), command(), {
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

    await expect(runWebFetch(registryWith(only), createFetchCache(), command(), deps(controller.signal, reportDisabled)))
      .rejects.toBe(abortError);
    expect(reportDisabled).toHaveBeenCalledWith('tavily', 'provider failed: boom');
  });
});

const SLICE_CONTENT = 'abcdefghijklmnopqrstuvwxyzabcd';
const SLICE_HEADER = `Fetched ${ANSWER_URL} (local).\n\n`;

function cacheCase(fetch: FetchFn) {
  const clock = { value: 0 };
  const cache = createFetchCache();
  const local = fakeFetchProvider('local', fetch, { tokenless: true });
  const registry = registryWith(local);
  const localDeps = { tokens: TOKENS, fetch: fakeFetch(), now: () => clock.value };
  return { clock, cache, local, registry, localDeps };
}

describe('runWebFetch cache', () => {
  it('refetches on offset 0 and replaces the stored page', async () => {
    let call = 0;
    const { cache, local, registry, localDeps } = cacheCase(async () => {
      call += 1;
      return page(ANSWER_URL, (call === 1 ? 'a' : 'b').repeat(30));
    });
    const second = 'b'.repeat(30);

    const first = await runWebFetch(registry, cache, command(), localDeps);
    const replaced = await runWebFetch(registry, cache, command(), localDeps);
    const sliced = await runWebFetch(registry, cache, command({ offset: 5 }), localDeps);

    expect(first).toBe(SLICE_HEADER + 'a'.repeat(30));
    expect(replaced).toBe(SLICE_HEADER + second);
    expect(sliced).toBe(SLICE_HEADER + second.slice(5));
    expect(local.fetch).toHaveBeenCalledTimes(2);
  });

  it('serves a live entry from a later offset without fetching or activating', async () => {
    const { cache, local, registry, localDeps } = cacheCase(async () => page(ANSWER_URL, SLICE_CONTENT));
    await runWebFetch(registry, cache, command(), localDeps);

    const hit = await runWebFetch(registry, cache, command({ offset: 5 }), localDeps);

    expect(hit).toBe(SLICE_HEADER + SLICE_CONTENT.slice(5));
    expect(local.fetch).toHaveBeenCalledOnce();
    expect(local.manifest.activate).toHaveBeenCalledOnce();

    const fresh = cacheCase(async () => page(ANSWER_URL, SLICE_CONTENT));
    const freshHit = await runWebFetch(fresh.registry, fresh.cache, command({ offset: 5 }), fresh.localDeps);
    expect(freshHit).toBe(hit);
    expect(fresh.local.fetch).toHaveBeenCalledOnce();
  });

  it('stores a page first fetched at a positive offset', async () => {
    const { cache, local, registry, localDeps } = cacheCase(async () => page(ANSWER_URL, SLICE_CONTENT));
    const first = await runWebFetch(registry, cache, command({ offset: 5 }), localDeps);
    const second = await runWebFetch(registry, cache, command({ offset: 6 }), localDeps);

    expect(first).toBe(SLICE_HEADER + SLICE_CONTENT.slice(5));
    expect(second).toBe(SLICE_HEADER + SLICE_CONTENT.slice(6));
    expect(local.fetch).toHaveBeenCalledOnce();
  });

  it('refetches when the entry reaches the TTL', async () => {
    const { clock, cache, local, registry, localDeps } = cacheCase(async () => page(ANSWER_URL, SLICE_CONTENT));
    await runWebFetch(registry, cache, command(), localDeps);
    clock.value = 15 * 60_000;

    const text = await runWebFetch(registry, cache, command({ offset: 5 }), localDeps);

    expect(text).toBe(SLICE_HEADER + SLICE_CONTENT.slice(5));
    expect(local.fetch).toHaveBeenCalledTimes(2);
  });

  it('counts the TTL from when the page was stored', async () => {
    const { clock, cache, local, registry, localDeps } = cacheCase(async () => {
      clock.value += 10 * 60_000;
      return page(ANSWER_URL, SLICE_CONTENT);
    });
    await runWebFetch(registry, cache, command(), localDeps);
    clock.value = 20 * 60_000;

    const text = await runWebFetch(registry, cache, command({ offset: 5 }), localDeps);

    expect(text).toBe(SLICE_HEADER + SLICE_CONTENT.slice(5));
    expect(local.fetch).toHaveBeenCalledOnce();
  });

  it('serves an empty stored page as the empty-page answer', async () => {
    const { cache, local, registry, localDeps } = cacheCase(async () => page(ANSWER_URL, ''));
    await runWebFetch(registry, cache, command(), localDeps);

    const text = await runWebFetch(registry, cache, command({ offset: 3 }), localDeps);

    expect(text).toBe(SLICE_HEADER + '(empty page)');
    expect(local.fetch).toHaveBeenCalledOnce();
  });

  it('stores nothing when an offset 0 fetch fails', async () => {
    const { cache, local, registry, localDeps } = cacheCase(requestError('HTTP 500'));
    await runWebFetch(registry, cache, command(), localDeps);

    const text = await runWebFetch(registry, cache, command({ offset: 5 }), localDeps);

    expect(text).toBe('Web fetch failed (local): HTTP 500.');
    expect(local.fetch).toHaveBeenCalledTimes(2);
  });

  it('stores nothing when an offset 0 fetch redirects', async () => {
    const { cache, local, registry, localDeps } = cacheCase(async () => redirect('https://www.example.com/'));
    await runWebFetch(registry, cache, command(), localDeps);

    const text = await runWebFetch(registry, cache, command({ offset: 5 }), localDeps);

    expect(text).toBe('Web fetch: redirected to https://www.example.com/.');
    expect(local.fetch).toHaveBeenCalledTimes(2);
  });

  it('stores nothing when the explicit provider is not configured', async () => {
    const clock = { value: 0 };
    const cache = createFetchCache();
    const tavily = fakeFetchProvider('tavily', async () => page(ANSWER_URL, SLICE_CONTENT));
    const registry = registryWith(tavily);
    const withoutToken = { tokens: {}, fetch: fakeFetch(), now: () => clock.value };
    const withToken = { tokens: TOKENS, fetch: fakeFetch(), now: () => clock.value };

    const refused = await runWebFetch(registry, cache, command({ provider: 'tavily' }), withoutToken);
    expect(refused).toBe('Web fetch: provider "tavily" is not configured.');
    expect(tavily.fetch).not.toHaveBeenCalled();

    const text = await runWebFetch(registry, cache, command({ provider: 'tavily', offset: 5 }), withToken);
    expect(text).toBe(`Fetched ${ANSWER_URL} (tavily).\n\n${SLICE_CONTENT.slice(5)}`);
    expect(tavily.fetch).toHaveBeenCalledOnce();
  });

  it('keeps an earlier entry when a later offset 0 fetch fails', async () => {
    const cache = createFetchCache();
    let call = 0;
    const local = fakeFetchProvider('local', async () => {
      if (call++ === 0) return page(ANSWER_URL, SLICE_CONTENT);
      throw new ProviderRequestError('HTTP 500');
    }, { tokenless: true });
    const registry = registryWith(local);
    const localDeps = { tokens: TOKENS, fetch: fakeFetch(), now: () => 0 };

    await runWebFetch(registry, cache, command(), localDeps);
    await runWebFetch(registry, cache, command(), localDeps);
    const text = await runWebFetch(registry, cache, command({ offset: 5 }), localDeps);

    expect(text).toBe(SLICE_HEADER + SLICE_CONTENT.slice(5));
    expect(local.fetch).toHaveBeenCalledTimes(2);
  });

  it('keys on url, format, and provider but ignores max-chars and timeout', async () => {
    const { cache, local, registry, localDeps } = cacheCase(async () => page(ANSWER_URL, SLICE_CONTENT));
    await runWebFetch(registry, cache, command(), localDeps);

    const sameKey = await runWebFetch(
      registry,
      cache,
      command({ maxChars: 500, timeoutSeconds: 45, offset: 5 }),
      localDeps,
    );
    const upperAuto = await runWebFetch(registry, cache, command({ provider: 'AUTO', offset: 5 }), localDeps);
    expect(sameKey).toBe(SLICE_HEADER + SLICE_CONTENT.slice(5));
    expect(upperAuto).toBe(sameKey);
    expect(local.fetch).toHaveBeenCalledOnce();

    await runWebFetch(registry, cache, command({ format: 'text', offset: 5 }), localDeps);
    expect(local.fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps auto and tavily entries separate', async () => {
    const cache = createFetchCache();
    const local = fakeFetchProvider('local', async () => page(ANSWER_URL, SLICE_CONTENT), { tokenless: true });
    const tavily = fakeFetchProvider('tavily', async () => page(ANSWER_URL, SLICE_CONTENT));
    const registry = registryWith(local, tavily);
    const localDeps = { tokens: TOKENS, fetch: fakeFetch(), now: () => 0 };

    await runWebFetch(registry, cache, command(), localDeps);
    const tavilyFetch = await runWebFetch(registry, cache, command({ provider: 'tavily', offset: 5 }), localDeps);
    expect(tavilyFetch).toBe(`Fetched ${ANSWER_URL} (tavily).\n\n${SLICE_CONTENT.slice(5)}`);
    expect(tavily.fetch).toHaveBeenCalledOnce();

    const upperTavily = await runWebFetch(registry, cache, command({ provider: 'TAVILY', offset: 5 }), localDeps);
    expect(upperTavily).toBe(tavilyFetch);
    expect(tavily.fetch).toHaveBeenCalledOnce();
  });

  it('serves a cached page even after its provider was disabled', async () => {
    let fail = false;
    const fetch: FetchFn = async () => {
      if (fail) throw new Error('plugin broke');
      return page(ANSWER_URL, SLICE_CONTENT);
    };
    const { cache, local, registry, localDeps } = cacheCase(fetch);
    await runWebFetch(registry, cache, command({ provider: 'local' }), localDeps);
    fail = true;

    const failed = await runWebFetch(registry, cache, command({ provider: 'local' }), localDeps);
    expect(failed).toBe('Web fetch failed (local): provider failed: plugin broke.');

    const hit = await runWebFetch(registry, cache, command({ provider: 'local', offset: 5 }), localDeps);
    expect(hit).toBe(SLICE_HEADER + SLICE_CONTENT.slice(5));
    expect(local.fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects an aborted call before reading a live entry', async () => {
    const { cache, local, registry, localDeps } = cacheCase(async () => page(ANSWER_URL, SLICE_CONTENT));
    await runWebFetch(registry, cache, command(), localDeps);
    const controller = new AbortController();
    const abortError = new Error('cancelled before the slice');
    controller.abort(abortError);

    await expect(runWebFetch(registry, cache, command({ offset: 5 }), {
      tokens: TOKENS,
      fetch: fakeFetch(),
      signal: controller.signal,
      now: () => 0,
    })).rejects.toBe(abortError);
    expect(local.fetch).toHaveBeenCalledOnce();
  });

  it('stores nothing when a provider aborts during the fetch', async () => {
    const cache = createFetchCache();
    const controller = new AbortController();
    const abortError = new Error('cancelled during the fetch');
    const local = fakeFetchProvider('local', async () => {
      controller.abort(abortError);
      return page(ANSWER_URL, SLICE_CONTENT);
    }, { tokenless: true });
    const registry = registryWith(local);

    await expect(runWebFetch(registry, cache, command(), {
      tokens: TOKENS,
      fetch: fakeFetch(),
      signal: controller.signal,
      now: () => 0,
    })).rejects.toBe(abortError);

    await runWebFetch(registry, cache, command({ offset: 5 }), {
      tokens: TOKENS,
      fetch: fakeFetch(),
      now: () => 0,
    });
    expect(local.fetch).toHaveBeenCalledTimes(2);
  });

  it('uses Date.now when no clock is injected', async () => {
    const cache = createFetchCache();
    const local = fakeFetchProvider('local', async () => page(ANSWER_URL, SLICE_CONTENT), { tokenless: true });
    const registry = registryWith(local);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(0);
    try {
      await runWebFetch(registry, cache, command(), { tokens: TOKENS, fetch: fakeFetch() });
      nowSpy.mockReturnValue(15 * 60_000);
      await runWebFetch(registry, cache, command({ offset: 5 }), { tokens: TOKENS, fetch: fakeFetch() });
      expect(local.fetch).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
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

  it('keeps one module cache across webFetch calls', async () => {
    const fetchSpy = vi.fn<FetchFn>(async () => page(ANSWER_URL, SLICE_CONTENT));
    const module: WebSearchProviderModule = { provider: { fetch: fetchSpy } };
    const activation = vi.spyOn(localManifest, 'activate').mockResolvedValue(module);
    try {
      const first = await webFetch(command({ provider: 'local' }), { tokens: {}, fetch: fakeFetch() });
      const second = await webFetch(command({ provider: 'local', offset: 5 }), { tokens: {}, fetch: fakeFetch() });
      expect(first).toBe(SLICE_HEADER + SLICE_CONTENT);
      expect(second).toBe(SLICE_HEADER + SLICE_CONTENT.slice(5));
      expect(fetchSpy).toHaveBeenCalledOnce();
    } finally {
      activation.mockRestore();
    }
  });
});
