import { describe, expect, it, vi, type Mock } from 'vitest';
import type { ProjectTokenName, ProjectTokens } from '../../project/tokens.js';
import { ProviderRequestError, WEB_PROVIDER_API_VERSION } from './contract.js';
import type {
  WebFetchFormat,
  WebSearchCapability,
  WebSearchProviderManifest,
  WebSearchProviderModule,
  WebSearchRequest,
  WebSearchResult,
} from './contract.js';
import { webSearchProviderCatalog } from './catalog.js';
import { createProviderRegistry } from './registry.js';
import type { AttemptOutcome } from './registry.js';
import type { AttemptResolution } from './search-resolution.js';

const REQUEST: WebSearchRequest = { query: 'node.js', numResults: 5, depth: 'basic' };

const TOKENS: ProjectTokens = { tavily: 'tavily-key', tinyfish: 'tinyfish-key' };

function capability(signal?: AbortSignal): WebSearchCapability {
  const fetchStub: typeof fetch = async () => Response.json({});
  return signal
    ? { apiKey: 'test-key', fetch: fetchStub, signal }
    : { apiKey: 'test-key', fetch: fetchStub };
}

function moduleFor(search: WebSearchProviderModule['provider']['search']): WebSearchProviderModule {
  return { provider: { search } };
}

type FakeManifestOptions = {
  apiVersion?: number;
  token?: ProjectTokenName;
  module?: WebSearchProviderModule;
  activate?: () => Promise<WebSearchProviderModule>;
  search?: boolean;
  fetchFormats?: readonly WebFetchFormat[];
};

type FakeManifest = WebSearchProviderManifest & {
  activate: Mock<() => Promise<WebSearchProviderModule>>;
};

function fakeManifest(id: 'tavily' | 'tinyfish', options: FakeManifestOptions = {}): FakeManifest {
  const module = options.module ?? moduleFor(async () => []);
  const activate = options.activate ?? (async () => module);
  return {
    id,
    apiVersion: options.apiVersion ?? WEB_PROVIDER_API_VERSION,
    token: options.token ?? id,
    ...(options.search !== undefined && { search: options.search }),
    ...(options.fetchFormats !== undefined && { fetchFormats: options.fetchFormats }),
    activate: vi.fn(activate),
  };
}

function ids(resolution: AttemptResolution): string[] {
  if (resolution.kind !== 'attempts') throw new Error('expected attempts');
  return resolution.manifests.map((manifest) => manifest.id);
}

function line(resolution: AttemptResolution): string {
  if (resolution.kind !== 'line') throw new Error('expected a line');
  return resolution.line;
}

function abortedError(outcome: AttemptOutcome): unknown {
  if (outcome.kind !== 'aborted') throw new Error('expected an abort');
  return outcome.error;
}

describe('createProviderRegistry', () => {
  it('lists provider names in catalog order', () => {
    const registry = createProviderRegistry([fakeManifest('tinyfish'), fakeManifest('tavily')]);
    expect(registry.searchProviderNames()).toEqual(['tinyfish', 'tavily']);
  });

  it('lists only fetch-capable provider names in catalog order', () => {
    const tavily = fakeManifest('tavily', { fetchFormats: ['markdown', 'text'] });
    const tinyfish = fakeManifest('tinyfish', { fetchFormats: ['markdown', 'html'] });
    const registry = createProviderRegistry([tinyfish, tavily]);

    expect(registry.fetchProviderNames()).toEqual(['tinyfish', 'tavily']);
  });

  it('leaves out manifests with no fetch formats or an empty list', () => {
    const tavily = fakeManifest('tavily', { fetchFormats: ['markdown'] });

    expect(createProviderRegistry([fakeManifest('tinyfish'), tavily]).fetchProviderNames())
      .toEqual(['tavily']);
    expect(createProviderRegistry([
      fakeManifest('tinyfish', { fetchFormats: [] }),
      tavily,
    ]).fetchProviderNames()).toEqual(['tavily']);
  });

  it('skips a provider disabled by a search attempt in fetch resolution', async () => {
    const tavily = fakeManifest('tavily', {
      fetchFormats: ['markdown'],
      module: moduleFor(async () => {
        throw new Error('boom.');
      }),
    });
    const tinyfish = fakeManifest('tinyfish', { fetchFormats: ['markdown'] });
    const registry = createProviderRegistry([tavily, tinyfish]);

    await registry.runAttempt(tavily, REQUEST, capability());

    expect(ids(registry.resolveFetchAttempts('auto', 'markdown', TOKENS))).toEqual(['tinyfish']);
  });

  it('reads the registry disabled map when a disabled provider is the only fetch provider', async () => {
    const tavily = fakeManifest('tavily', {
      fetchFormats: ['markdown'],
      module: moduleFor(async () => {
        throw new Error('boom.');
      }),
    });
    const registry = createProviderRegistry([tavily]);

    await registry.runAttempt(tavily, REQUEST, capability());

    expect(line(registry.resolveFetchAttempts('auto', 'markdown', TOKENS)))
      .toBe('Web fetch failed (tavily): provider failed: boom.');
  });

  it('never activates a provider until an attempt runs', async () => {
    const tavily = fakeManifest('tavily');
    const registry = createProviderRegistry([tavily]);

    expect(registry.searchProviderNames()).toEqual(['tavily']);
    expect(ids(registry.resolveAttempts('auto', TOKENS))).toEqual(['tavily']);
    expect(tavily.activate).not.toHaveBeenCalled();

    await registry.runAttempt(tavily, REQUEST, capability());
    expect(tavily.activate).toHaveBeenCalledOnce();
  });

  it('omits a search-incapable manifest from names and auto resolution', () => {
    const searchless = fakeManifest('tinyfish', { search: false });
    const registry = createProviderRegistry([fakeManifest('tavily'), searchless]);

    expect(registry.searchProviderNames()).toEqual(['tavily']);
    expect(ids(registry.resolveAttempts('auto', TOKENS))).toEqual(['tavily']);
  });

  it('refuses a manifest written for another API version without activating it', async () => {
    const future = fakeManifest('tavily', { apiVersion: 2 });
    const registry = createProviderRegistry([future]);

    await expect(registry.runAttempt(future, REQUEST, capability()))
      .resolves.toEqual({ kind: 'plugin-failed', reason: 'requires provider API 2' });
    expect(future.activate).not.toHaveBeenCalled();
  });

  it('classifies an import failure as a plugin failure with the error first line', async () => {
    const broken = fakeManifest('tavily', {
      activate: async () => {
        throw new Error('Cannot find module.\nat /tmp/tavily.js');
      },
    });
    const registry = createProviderRegistry([broken]);

    await expect(registry.runAttempt(broken, REQUEST, capability()))
      .resolves.toEqual({ kind: 'plugin-failed', reason: 'provider failed: Cannot find module' });
  });

  it('classifies a ProviderRequestError from activate as a plugin failure', async () => {
    const reportDisabled = vi.fn();
    const broken = fakeManifest('tavily', {
      activate: async () => {
        throw new ProviderRequestError('import failed');
      },
    });
    const registry = createProviderRegistry([broken, fakeManifest('tinyfish')]);

    await expect(registry.runAttempt(broken, REQUEST, capability(), reportDisabled))
      .resolves.toEqual({ kind: 'plugin-failed', reason: 'provider failed: import failed' });
    expect(reportDisabled).toHaveBeenCalledOnce();
    expect(reportDisabled).toHaveBeenCalledWith('tavily', 'provider failed: import failed');
    expect(ids(registry.resolveAttempts('auto', TOKENS))).toEqual(['tinyfish']);
  });

  it('classifies a thrown search error as a plugin failure with the error first line', async () => {
    const asyncManifest = fakeManifest('tavily', {
      module: moduleFor(async () => {
        throw new Error('search exploded.');
      }),
    });
    const syncManifest = fakeManifest('tinyfish', {
      module: moduleFor(() => {
        throw new Error('sync exploded!');
      }),
    });
    const registry = createProviderRegistry([asyncManifest, syncManifest]);

    await expect(registry.runAttempt(asyncManifest, REQUEST, capability()))
      .resolves.toEqual({ kind: 'plugin-failed', reason: 'provider failed: search exploded' });
    await expect(registry.runAttempt(syncManifest, REQUEST, capability()))
      .resolves.toEqual({ kind: 'plugin-failed', reason: 'provider failed: sync exploded' });
  });

  it('disables and reports a module without a search function', async () => {
    const reportDisabled = vi.fn();
    const manifest = fakeManifest('tavily', {
      module: { provider: { search: undefined as never } },
    });
    const registry = createProviderRegistry([manifest, fakeManifest('tinyfish')]);

    await expect(registry.runAttempt(manifest, REQUEST, capability(), reportDisabled))
      .resolves.toEqual({ kind: 'plugin-failed', reason: 'provider failed: module has no provider' });
    expect(reportDisabled).toHaveBeenCalledOnce();
    expect(reportDisabled).toHaveBeenCalledWith('tavily', 'provider failed: module has no provider');
    expect(ids(registry.resolveAttempts('auto', TOKENS))).toEqual(['tinyfish']);
  });

  it('disables and reports a search that does not resolve to an array', async () => {
    const reportDisabled = vi.fn();
    const manifest = fakeManifest('tavily', {
      module: moduleFor(async () => 'not an array' as unknown as WebSearchResult[]),
    });
    const registry = createProviderRegistry([manifest, fakeManifest('tinyfish')]);

    await expect(registry.runAttempt(manifest, REQUEST, capability(), reportDisabled))
      .resolves.toEqual({
        kind: 'plugin-failed',
        reason: 'provider failed: search did not return an array',
      });
    expect(reportDisabled).toHaveBeenCalledOnce();
    expect(reportDisabled)
      .toHaveBeenCalledWith('tavily', 'provider failed: search did not return an array');
    expect(ids(registry.resolveAttempts('auto', TOKENS))).toEqual(['tinyfish']);
  });

  it('disables a provider after a plugin failure and reports it once', async () => {
    const reportDisabled = vi.fn();
    let failure = 'first failure.';
    const manifest = fakeManifest('tavily', {
      module: moduleFor(async () => {
        throw new Error(failure);
      }),
    });
    const registry = createProviderRegistry([manifest, fakeManifest('tinyfish')]);

    await registry.runAttempt(manifest, REQUEST, capability(), reportDisabled);
    failure = 'second failure.';
    const second = await registry.runAttempt(manifest, REQUEST, capability(), reportDisabled);

    expect(reportDisabled).toHaveBeenCalledOnce();
    expect(reportDisabled).toHaveBeenCalledWith('tavily', 'provider failed: first failure');
    expect(second).toEqual({ kind: 'plugin-failed', reason: 'provider failed: second failure' });
    expect(ids(registry.resolveAttempts('auto', TOKENS))).toEqual(['tinyfish']);
    expect(line(registry.resolveAttempts('tavily', TOKENS)))
      .toBe('Web search failed (tavily): provider failed: first failure.');
  });

  it('disables a provider even when no reporter is supplied', async () => {
    const manifest = fakeManifest('tavily', {
      module: moduleFor(async () => {
        throw new Error('boom.');
      }),
    });
    const registry = createProviderRegistry([manifest]);

    await registry.runAttempt(manifest, REQUEST, capability());

    expect(line(registry.resolveAttempts('tavily', TOKENS)))
      .toBe('Web search failed (tavily): provider failed: boom.');
    expect(line(registry.resolveAttempts('auto', TOKENS)))
      .toBe('Web search failed (tavily): provider failed: boom.');
  });

  it('prints the stored line for a disabled provider without a token', async () => {
    const manifest = fakeManifest('tavily', {
      module: moduleFor(async () => {
        throw new Error('tavily boom.');
      }),
    });
    const registry = createProviderRegistry([manifest, fakeManifest('tinyfish')]);

    await registry.runAttempt(manifest, REQUEST, capability());

    expect(line(registry.resolveAttempts('tavily', {})))
      .toBe('Web search failed (tavily): provider failed: tavily boom.');
  });

  it('reports every configured provider failure for auto when all are disabled', async () => {
    const tavily = fakeManifest('tavily', {
      module: moduleFor(async () => {
        throw new Error('tavily boom.');
      }),
    });
    const tinyfish = fakeManifest('tinyfish', {
      module: moduleFor(async () => {
        throw new Error('tinyfish boom.');
      }),
    });
    const registry = createProviderRegistry([tavily, tinyfish]);

    await registry.runAttempt(tavily, REQUEST, capability());
    await registry.runAttempt(tinyfish, REQUEST, capability());

    expect(line(registry.resolveAttempts('auto', TOKENS))).toBe([
      'Web search: every provider failed.',
      '- tavily: provider failed: tavily boom',
      '- tinyfish: provider failed: tinyfish boom',
    ].join('\n'));
  });

  it('reports one disabled provider as a single failure line for auto', async () => {
    const tinyfish = fakeManifest('tinyfish', {
      module: moduleFor(async () => {
        throw new Error('tinyfish boom.');
      }),
    });
    const registry = createProviderRegistry([fakeManifest('tavily'), tinyfish]);

    await registry.runAttempt(tinyfish, REQUEST, capability());

    expect(line(registry.resolveAttempts('auto', { tinyfish: 'key' })))
      .toBe('Web search failed (tinyfish): provider failed: tinyfish boom.');
  });

  it('reports a ProviderRequestError as an expected failure without disabling', async () => {
    const manifest = fakeManifest('tavily', {
      module: moduleFor(async () => {
        throw new ProviderRequestError('HTTP 429 Too Many Requests');
      }),
    });
    const registry = createProviderRegistry([manifest]);

    await expect(registry.runAttempt(manifest, REQUEST, capability()))
      .resolves.toEqual({ kind: 'failed', reason: 'HTTP 429 Too Many Requests' });
    expect(ids(registry.resolveAttempts('tavily', TOKENS))).toEqual(['tavily']);
  });

  it('treats a ProviderRequestError rejection during an abort as an abort', async () => {
    const controller = new AbortController();
    controller.abort();
    const error = new ProviderRequestError('HTTP 429 Too Many Requests');
    const reportDisabled = vi.fn();
    const manifest = fakeManifest('tavily', {
      module: moduleFor(async () => {
        throw error;
      }),
    });
    const registry = createProviderRegistry([manifest]);

    const outcome = await registry.runAttempt(
      manifest, REQUEST, capability(controller.signal), reportDisabled,
    );

    expect(outcome.kind).toBe('aborted');
    expect(abortedError(outcome)).toBe(error);
    expect(reportDisabled).not.toHaveBeenCalled();
    expect(ids(registry.resolveAttempts('tavily', TOKENS))).toEqual(['tavily']);
  });

  it('treats a plain rejection during an abort as an abort', async () => {
    const controller = new AbortController();
    controller.abort();
    const error = new Error('cancelled.');
    const reportDisabled = vi.fn();
    const manifest = fakeManifest('tavily', {
      module: moduleFor(async () => {
        throw error;
      }),
    });
    const registry = createProviderRegistry([manifest]);

    const outcome = await registry.runAttempt(
      manifest, REQUEST, capability(controller.signal), reportDisabled,
    );

    expect(outcome.kind).toBe('aborted');
    expect(abortedError(outcome)).toBe(error);
    expect(reportDisabled).not.toHaveBeenCalled();
    expect(ids(registry.resolveAttempts('tavily', TOKENS))).toEqual(['tavily']);
  });

  it('treats a ProviderRequestError from activate during an abort as an abort', async () => {
    const controller = new AbortController();
    controller.abort();
    const error = new ProviderRequestError('import failed');
    const reportDisabled = vi.fn();
    const manifest = fakeManifest('tavily', {
      activate: async () => {
        throw error;
      },
    });
    const registry = createProviderRegistry([manifest]);

    const outcome = await registry.runAttempt(
      manifest, REQUEST, capability(controller.signal), reportDisabled,
    );

    expect(outcome.kind).toBe('aborted');
    expect(abortedError(outcome)).toBe(error);
    expect(reportDisabled).not.toHaveBeenCalled();
    expect(ids(registry.resolveAttempts('tavily', TOKENS))).toEqual(['tavily']);
  });

  it('treats a module without a search function during an abort as an abort', async () => {
    const controller = new AbortController();
    const error = new Error('cancelled before the module resolved');
    controller.abort(error);
    const reportDisabled = vi.fn();
    const manifest = fakeManifest('tavily', {
      module: { provider: { search: undefined as never } },
    });
    const registry = createProviderRegistry([manifest]);

    const outcome = await registry.runAttempt(
      manifest, REQUEST, capability(controller.signal), reportDisabled,
    );

    expect(outcome.kind).toBe('aborted');
    expect(abortedError(outcome)).toBe(error);
    expect(reportDisabled).not.toHaveBeenCalled();
    expect(ids(registry.resolveAttempts('tavily', TOKENS))).toEqual(['tavily']);
  });

  it('treats a non-array search result during an abort as an abort', async () => {
    const controller = new AbortController();
    const error = new Error('cancelled during the search');
    controller.abort(error);
    const reportDisabled = vi.fn();
    const manifest = fakeManifest('tavily', {
      module: moduleFor(async () => 'not an array' as unknown as WebSearchResult[]),
    });
    const registry = createProviderRegistry([manifest]);

    const outcome = await registry.runAttempt(
      manifest, REQUEST, capability(controller.signal), reportDisabled,
    );

    expect(outcome.kind).toBe('aborted');
    expect(abortedError(outcome)).toBe(error);
    expect(reportDisabled).not.toHaveBeenCalled();
    expect(ids(registry.resolveAttempts('tavily', TOKENS))).toEqual(['tavily']);
  });

  it('returns results unchanged, including an empty array', async () => {
    const results: WebSearchResult[] = [
      { title: 'Node.js', url: 'https://nodejs.org/', snippet: 'A JavaScript runtime.' },
      { title: 'Docs', url: 'https://nodejs.org/docs/', snippet: 'The documentation.' },
    ];
    const populated = fakeManifest('tavily', { module: moduleFor(async () => results) });
    const empty = fakeManifest('tavily', { module: moduleFor(async () => []) });

    await expect(createProviderRegistry([populated]).runAttempt(populated, REQUEST, capability()))
      .resolves.toEqual({ kind: 'results', results });
    await expect(createProviderRegistry([empty]).runAttempt(empty, REQUEST, capability()))
      .resolves.toEqual({ kind: 'results', results: [] });
  });

  it('keeps answering provider names and resolution when every provider is broken', async () => {
    const brokenActivate = async (): Promise<WebSearchProviderModule> => {
      throw new Error('broken.');
    };
    const tavily = fakeManifest('tavily', { activate: brokenActivate });
    const tinyfish = fakeManifest('tinyfish', { activate: brokenActivate });
    const registry = createProviderRegistry([tavily, tinyfish]);

    await registry.runAttempt(tavily, REQUEST, capability());
    await registry.runAttempt(tinyfish, REQUEST, capability());

    expect(registry.searchProviderNames()).toEqual(['tavily', 'tinyfish']);
    expect(line(registry.resolveAttempts('auto', TOKENS))).toBe([
      'Web search: every provider failed.',
      '- tavily: provider failed: broken',
      '- tinyfish: provider failed: broken',
    ].join('\n'));
  });
});

describe('the real web search provider catalog', () => {
  it('lists the bundled providers with compatible versions and tokens', () => {
    const providerIds = webSearchProviderCatalog.map((manifest) => manifest.id);

    expect(providerIds).toEqual(['tavily', 'tinyfish']);
    expect(new Set(providerIds).size).toBe(providerIds.length);
    for (const id of providerIds) {
      expect(id).toBe(id.toLowerCase());
      expect(id).not.toBe('auto');
    }
    for (const manifest of webSearchProviderCatalog) {
      expect(manifest.apiVersion).toBe(WEB_PROVIDER_API_VERSION);
    }
    expect(webSearchProviderCatalog.map((manifest) => manifest.token))
      .toEqual(['tavily', 'tinyfish']);
  });

  it('declares search on both bundled manifests and no fetch formats yet', () => {
    expect(webSearchProviderCatalog.map((manifest) => manifest.search)).toEqual([true, true]);
    for (const manifest of webSearchProviderCatalog) {
      expect('fetchFormats' in manifest).toBe(false);
    }
  });
});
