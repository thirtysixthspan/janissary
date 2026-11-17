import { describe, expect, it } from 'vitest';
import { ProviderRequestError, WEB_PROVIDER_API_VERSION } from './contract.js';
import type {
  WebSearchCapability,
  WebSearchProvider,
  WebSearchProviderManifest,
  WebSearchProviderModule,
  WebSearchRequest,
  WebSearchResult,
} from './contract.js';

const provider: WebSearchProvider = {
  async search(
    request: WebSearchRequest,
    capability: WebSearchCapability,
  ): Promise<WebSearchResult[]> {
    const url = new URL('https://example.test/search');
    url.searchParams.set('q', request.query);
    url.searchParams.set('n', String(request.numResults));
    url.searchParams.set('depth', request.depth);
    const response = await capability.fetch(url, {
      headers: { authorization: `Bearer ${capability.apiKey}` },
    });
    return (await response.json()) as WebSearchResult[];
  },
};

const providerModule: WebSearchProviderModule = { provider };

const manifest: WebSearchProviderManifest = {
  id: 'fixture',
  apiVersion: WEB_PROVIDER_API_VERSION,
  token: 'github',
  activate: async () => providerModule,
};

describe('WEB_PROVIDER_API_VERSION', () => {
  it('is 1', () => {
    expect(WEB_PROVIDER_API_VERSION).toBe(1);
  });
});

describe('ProviderRequestError', () => {
  it('keeps its reason as the message and names itself', () => {
    const error = new ProviderRequestError('HTTP 429 Too Many Requests');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('HTTP 429 Too Many Requests');
    expect(error.name).toBe('ProviderRequestError');
  });
});

describe('the provider contract', () => {
  it('activates a manifest and returns results through an injected fetch', async () => {
    const requested: string[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requested.push(url.href);
      expect(url.searchParams.get('q')).toBe('node.js');
      expect(url.searchParams.get('n')).toBe('3');
      expect(url.searchParams.get('depth')).toBe('advanced');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-key');
      return Response.json([
        { title: 'Node.js', url: 'https://nodejs.org/', snippet: 'A JavaScript runtime.' },
      ]);
    };

    const activated = await manifest.activate();
    const results = await activated.provider.search?.(
      { query: 'node.js', numResults: 3, depth: 'advanced' },
      { apiKey: 'test-key', fetch: fakeFetch },
    );

    expect(manifest.apiVersion).toBe(WEB_PROVIDER_API_VERSION);
    expect(manifest.token).toBe('github');
    expect(requested).toHaveLength(1);
    expect(results).toEqual([
      { title: 'Node.js', url: 'https://nodejs.org/', snippet: 'A JavaScript runtime.' },
    ]);
  });
});
