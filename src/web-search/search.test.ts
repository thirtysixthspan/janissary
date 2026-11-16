import { describe, expect, it, vi } from 'vitest';
import type { ProjectTokens } from '../project/tokens.js';
import type { WebSearchCommand } from './command.js';
import { ProviderRequestError, WEB_SEARCH_PROVIDER_API_VERSION } from './contract.js';
import type {
  WebSearchCapability,
  WebSearchProviderManifest,
  WebSearchProviderModule,
  WebSearchRequest,
  WebSearchResult,
} from './contract.js';
import { webSearchProviderCatalog } from './providers/catalog.js';
import { createProviderRegistry } from './registry.js';
import type { ProviderRegistry } from './registry.js';
import { runWebSearch, webSearch, webSearchProviderNames } from './search.js';

const QUERY = 'node.js permission model';

const TOKENS: ProjectTokens = { tavily: 'tavily-key', tinyfish: 'tinyfish-key' };

type Search = (
  request: WebSearchRequest,
  capability: WebSearchCapability,
) => Promise<WebSearchResult[]>;

function command(overrides: Partial<WebSearchCommand> = {}): WebSearchCommand {
  return {
    query: QUERY,
    numResults: 5,
    maxChars: 10_000,
    depth: 'basic',
    provider: 'auto',
    ...overrides,
  };
}

function result(title: string, url: string, snippet = ''): WebSearchResult {
  return { title, url, snippet };
}

function fakeFetch(): typeof fetch {
  return vi.fn<typeof fetch>(async () => Response.json({}));
}

function fakeProvider(id: 'tavily' | 'tinyfish', search: Search = async () => []) {
  const searchSpy = vi.fn(search);
  const module: WebSearchProviderModule = { provider: { search: searchSpy } };
  const manifest = {
    id,
    apiVersion: WEB_SEARCH_PROVIDER_API_VERSION,
    token: id,
    activate: vi.fn(async () => module),
  } satisfies WebSearchProviderManifest;
  return { manifest, search: searchSpy };
}

function registryWith(...providers: ReturnType<typeof fakeProvider>[]): ProviderRegistry {
  return createProviderRegistry(providers.map(({ manifest }) => manifest));
}

const fallbackCases: Array<[string, () => Error]> = [
  ['a rejected key', () => new ProviderRequestError('HTTP 401 Unauthorized')],
  ['a rate limit', () => new ProviderRequestError('HTTP 429 Too Many Requests')],
  ['a timeout', () => new ProviderRequestError('timed out after 30 s')],
  ['an undecodable response', () => new ProviderRequestError('invalid response')],
  ['a plugin failure', () => new Error('boom.')],
];

describe('runWebSearch', () => {
  it('auto picks the first configured provider with only the request and its own capability', async () => {
    const tavily = fakeProvider('tavily');
    const tinyfish = fakeProvider('tinyfish', async () => [
      result('TinyFish result', 'https://tiny.example/one'),
    ]);
    const fetchStub = fakeFetch();
    const controller = new AbortController();

    const text = await runWebSearch(
      registryWith(tavily, tinyfish),
      command({ numResults: 3, depth: 'advanced' }),
      {
        tokens: { tinyfish: 'tinyfish-key' },
        fetch: fetchStub,
        signal: controller.signal,
      },
    );

    expect(text).toBe('- [TinyFish result](https://tiny.example/one)');
    expect(tavily.manifest.activate).not.toHaveBeenCalled();
    expect(tinyfish.manifest.activate).toHaveBeenCalledOnce();
    expect(tinyfish.search).toHaveBeenCalledOnce();
    const call = tinyfish.search.mock.calls[0];
    expect(call?.[0]).toStrictEqual({ query: QUERY, numResults: 3, depth: 'advanced' });
    expect(call?.[1]?.apiKey).toBe('tinyfish-key');
    expect(call?.[1]?.fetch).toBe(fetchStub);
    expect(call?.[1]?.signal).toBe(controller.signal);
    expect(Object.keys(call?.[1] ?? {})).toEqual(['apiKey', 'fetch', 'signal']);
  });

  it.each(fallbackCases)('auto falls back after %s and prints only the winner', async (_case, makeError) => {
    const first = fakeProvider('tavily', async () => {
      throw makeError();
    });
    const second = fakeProvider('tinyfish', async () => [
      result('Fallback', 'https://fallback.example/'),
    ]);

    const text = await runWebSearch(registryWith(first, second), command(), {
      tokens: TOKENS,
      fetch: fakeFetch(),
    });

    expect(text).toBe('- [Fallback](https://fallback.example/)');
    expect(first.search).toHaveBeenCalledOnce();
    expect(second.search).toHaveBeenCalledOnce();
  });

  it('does not fall back when the first provider returns zero results', async () => {
    const first = fakeProvider('tavily', async () => []);
    const second = fakeProvider('tinyfish', async () => [
      result('Unused', 'https://unused.example/'),
    ]);

    const text = await runWebSearch(registryWith(first, second), command(), {
      tokens: TOKENS,
      fetch: fakeFetch(),
    });

    expect(text).toBe(`No results for "${QUERY}".`);
    expect(second.manifest.activate).not.toHaveBeenCalled();
  });

  it('prints no results when every result is dropped for its URL', async () => {
    const first = fakeProvider('tavily', async () => [
      result('FTP', 'ftp://example.com/file'),
      result('Script', 'javascript:alert(1)'),
    ]);
    const second = fakeProvider('tinyfish', async () => [
      result('Unused', 'https://unused.example/'),
    ]);

    const text = await runWebSearch(registryWith(first, second), command(), {
      tokens: TOKENS,
      fetch: fakeFetch(),
    });

    expect(text).toBe(`No results for "${QUERY}".`);
    expect(second.manifest.activate).not.toHaveBeenCalled();
  });

  it('uses only an explicit provider even when both are configured', async () => {
    const tavily = fakeProvider('tavily', async () => [
      result('Tavily', 'https://tavily.example/'),
    ]);
    const tinyfish = fakeProvider('tinyfish', async () => [
      result('TinyFish', 'https://tiny.example/'),
    ]);

    const text = await runWebSearch(registryWith(tavily, tinyfish), command({ provider: 'tinyfish' }), {
      tokens: TOKENS,
      fetch: fakeFetch(),
    });

    expect(text).toBe('- [TinyFish](https://tiny.example/)');
    expect(tavily.manifest.activate).not.toHaveBeenCalled();
  });

  it('prints one failure for an explicit provider without falling back', async () => {
    const tavily = fakeProvider('tavily');
    const tinyfish = fakeProvider('tinyfish', async () => {
      throw new ProviderRequestError('HTTP 429 Too Many Requests');
    });

    const text = await runWebSearch(registryWith(tavily, tinyfish), command({ provider: 'tinyfish' }), {
      tokens: TOKENS,
      fetch: fakeFetch(),
    });

    expect(text).toBe('Web search failed (tinyfish): HTTP 429 Too Many Requests.');
    expect(tavily.manifest.activate).not.toHaveBeenCalled();
  });

  it('prints every failure in attempt order when all providers fail', async () => {
    const tavily = fakeProvider('tavily', async () => {
      throw new ProviderRequestError('HTTP 401 Unauthorized');
    });
    const tinyfish = fakeProvider('tinyfish', async () => {
      throw new ProviderRequestError('invalid response');
    });

    const text = await runWebSearch(registryWith(tavily, tinyfish), command(), {
      tokens: TOKENS,
      fetch: fakeFetch(),
    });

    expect(text).toBe([
      'Web search: every provider failed.',
      '- tavily: HTTP 401 Unauthorized',
      '- tinyfish: invalid response',
    ].join('\n'));
  });

  it('returns the no-provider line unchanged without activating or fetching', async () => {
    const tavily = fakeProvider('tavily');
    const tinyfish = fakeProvider('tinyfish');
    const fetchStub = fakeFetch();

    const text = await runWebSearch(registryWith(tavily, tinyfish), command(), {
      tokens: {},
      fetch: fetchStub,
    });

    expect(text).toBe('Web search: no provider configured.');
    expect(tavily.manifest.activate).not.toHaveBeenCalled();
    expect(tinyfish.manifest.activate).not.toHaveBeenCalled();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('returns the not-configured and unknown-provider lines unchanged', async () => {
    const tavily = fakeProvider('tavily');
    const tinyfish = fakeProvider('tinyfish');
    const registry = registryWith(tavily, tinyfish);
    const fetchStub = fakeFetch();
    const deps = { tokens: { tavily: 'tavily-key' }, fetch: fetchStub };

    await expect(runWebSearch(registry, command({ provider: 'tinyfish' }), deps))
      .resolves.toBe('Web search: provider "tinyfish" is not configured.');
    await expect(runWebSearch(registry, command({ provider: 'Bing' }), { ...deps, tokens: TOKENS }))
      .resolves.toBe('Web search: unknown provider "Bing" (available: auto, tavily, tinyfish).');
    expect(tavily.manifest.activate).not.toHaveBeenCalled();
    expect(tinyfish.manifest.activate).not.toHaveBeenCalled();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('returns the disabled-provider line unchanged without activating or fetching', async () => {
    const failing = fakeProvider('tavily', async () => {
      throw new Error('boom.');
    });
    const registry = registryWith(failing, fakeProvider('tinyfish'));
    await registry.runAttempt(
      failing.manifest,
      { query: QUERY, numResults: 5, depth: 'basic' },
      { apiKey: 'tavily-key', fetch: fakeFetch() },
    );
    failing.manifest.activate.mockClear();
    failing.search.mockClear();
    const fetchStub = fakeFetch();

    const text = await runWebSearch(registry, command({ provider: 'tavily' }), {
      tokens: TOKENS,
      fetch: fetchStub,
    });

    expect(text).toBe('Web search failed (tavily): provider failed: boom.');
    expect(failing.manifest.activate).not.toHaveBeenCalled();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('dedupes before cutting to numResults', async () => {
    const first = fakeProvider('tavily', async () => [
      result('One', 'https://e.com/1'),
      result('One again', 'https://e.com/1/'),
      result('Two', 'https://e.com/2'),
      result('Three', 'https://e.com/3'),
    ]);

    const text = await runWebSearch(registryWith(first), command({ numResults: 2 }), {
      tokens: { tavily: 'tavily-key' },
      fetch: fakeFetch(),
    });

    expect(text).toBe(['- [One](https://e.com/1)', '- [Two](https://e.com/2)'].join('\n'));
  });

  it('passes the cut count to the truncation note rather than the raw provider count', async () => {
    const first = fakeProvider('tavily', async () => [
      result('One', 'https://e.com/1', 'a'.repeat(200)),
      result('Two', 'https://e.com/2', 'b'.repeat(200)),
      result('Three', 'https://e.com/3', 'c'.repeat(200)),
      result('Four', 'https://e.com/4', 'd'.repeat(200)),
    ]);

    const text = await runWebSearch(
      registryWith(first),
      command({ numResults: 2, maxChars: 250 }),
      { tokens: { tavily: 'tavily-key' }, fetch: fakeFetch() },
    );

    expect(text).toContain('(showing 1 of 2 results; raise --max-chars for more)');
    expect(text).not.toContain('of 4');
  });

  it('sends an over-400-character query unchanged and falls back after HTTP 400', async () => {
    const query = 'q'.repeat(401);
    const first = fakeProvider('tavily', async () => {
      throw new ProviderRequestError('HTTP 400 Bad Request');
    });
    const second = fakeProvider('tinyfish', async () => [
      result('Fallback', 'https://fallback.example/'),
    ]);

    const text = await runWebSearch(registryWith(first, second), command({ query }), {
      tokens: TOKENS,
      fetch: fakeFetch(),
    });

    expect(first.search.mock.calls[0]?.[0].query).toBe(query);
    expect(text).toBe('- [Fallback](https://fallback.example/)');
  });

  it('rejects with the abort and starts no later attempt when the first request aborts', async () => {
    const controller = new AbortController();
    const abortError = new Error('cancelled during the first attempt');
    const first = fakeProvider('tavily', async () => {
      controller.abort(abortError);
      throw abortError;
    });
    const second = fakeProvider('tinyfish', async () => [
      result('Unused', 'https://unused.example/'),
    ]);

    await expect(runWebSearch(registryWith(first, second), command(), {
      tokens: TOKENS,
      fetch: fakeFetch(),
      signal: controller.signal,
    })).rejects.toBe(abortError);
    expect(second.manifest.activate).not.toHaveBeenCalled();
  });

  it('starts no second attempt when the signal aborts as the first failure resolves', async () => {
    const controller = new AbortController();
    const abortError = new Error('cancelled between attempts');
    const first = fakeProvider('tavily', async () => {
      throw new Error('boom.');
    });
    const second = fakeProvider('tinyfish', async () => [
      result('Unused', 'https://unused.example/'),
    ]);
    const reportDisabled = vi.fn(() => {
      controller.abort(abortError);
    });

    await expect(runWebSearch(registryWith(first, second), command(), {
      tokens: TOKENS,
      fetch: fakeFetch(),
      signal: controller.signal,
      reportDisabled,
    })).rejects.toBe(abortError);
    expect(reportDisabled).toHaveBeenCalledWith('tavily', 'provider failed: boom');
    expect(second.manifest.activate).not.toHaveBeenCalled();
  });

  it('rejects when a search resolves after the signal aborted', async () => {
    const controller = new AbortController();
    const abortError = new Error('cancelled during the search');
    const first = fakeProvider('tavily', async () => {
      controller.abort(abortError);
      return [result('Late', 'https://late.example/')];
    });

    await expect(runWebSearch(registryWith(first), command(), {
      tokens: { tavily: 'tavily-key' },
      fetch: fakeFetch(),
      signal: controller.signal,
    })).rejects.toBe(abortError);
  });

  it('reports a plugin failure once and still falls back without a reporter', async () => {
    const reportDisabled = vi.fn();
    const first = fakeProvider('tavily', async () => {
      throw new Error('boom.');
    });
    const second = fakeProvider('tinyfish', async () => [
      result('Fallback', 'https://fallback.example/'),
    ]);

    const text = await runWebSearch(registryWith(first, second), command(), {
      tokens: TOKENS,
      fetch: fakeFetch(),
      reportDisabled,
    });
    expect(text).toBe('- [Fallback](https://fallback.example/)');
    expect(reportDisabled).toHaveBeenCalledOnce();
    expect(reportDisabled).toHaveBeenCalledWith('tavily', 'provider failed: boom');

    const silentFirst = fakeProvider('tavily', async () => {
      throw new Error('boom.');
    });
    const silentSecond = fakeProvider('tinyfish', async () => [
      result('Silent fallback', 'https://silent.example/'),
    ]);
    await expect(runWebSearch(registryWith(silentFirst, silentSecond), command(), {
      tokens: TOKENS,
      fetch: fakeFetch(),
    })).resolves.toBe('- [Silent fallback](https://silent.example/)');
  });
});

describe('the module registry', () => {
  it('exposes the bundled provider names in catalog order without activating a provider', () => {
    const activations = webSearchProviderCatalog.map((manifest) =>
      vi.spyOn(manifest, 'activate'),
    );
    try {
      expect(webSearchProviderNames()).toEqual(['tavily', 'tinyfish']);
    } finally {
      for (const activation of activations) activation.mockRestore();
    }
    for (const activation of activations) expect(activation).not.toHaveBeenCalled();
  });

  it('runs webSearch against the bundled registry without sending a request', async () => {
    const fetchStub = fakeFetch();

    await expect(webSearch(command(), { tokens: {}, fetch: fetchStub }))
      .resolves.toBe('Web search: no provider configured.');
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
