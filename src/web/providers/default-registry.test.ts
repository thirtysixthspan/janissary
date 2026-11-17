import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebFetchCommand } from '../fetch/command.js';
import { webFetch } from '../fetch/fetch.js';
import type { WebSearchCommand } from '../search/command.js';
import { webSearch } from '../search/search.js';
import { tavilyManifest, tinyfishManifest } from './catalog.js';
import type { WebSearchProviderModule } from './contract.js';

function fetchCommand(provider: string): WebFetchCommand {
  return {
    url: 'https://example.com/page',
    format: 'markdown',
    timeoutSeconds: 30,
    maxChars: 10_000,
    offset: 0,
    provider,
  };
}

function searchCommand(provider: string): WebSearchCommand {
  return {
    query: 'node.js permission model',
    numResults: 5,
    maxChars: 10_000,
    depth: 'basic',
    provider,
  };
}

function transport(): typeof fetch {
  return vi.fn<typeof fetch>(async () => Response.json({}));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the shared provider registry', () => {
  it('refuses a later search after a fetch disables a provider', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('boom.');
    });
    const module: WebSearchProviderModule = { provider: { fetch: fetchSpy } };
    const activate = vi.spyOn(tavilyManifest, 'activate').mockResolvedValue(module as never);
    const searchTransport = transport();

    await expect(webFetch(fetchCommand('tavily'), {
      tokens: { tavily: 'tavily-key' },
      fetch: transport(),
    })).resolves.toBe('Web fetch failed (tavily): provider failed: boom.');

    await expect(webSearch(searchCommand('tavily'), {
      tokens: { tavily: 'tavily-key' },
      fetch: searchTransport,
    })).resolves.toBe('Web search failed (tavily): provider failed: boom.');
    expect(activate).toHaveBeenCalledOnce();
    expect(searchTransport).not.toHaveBeenCalled();
  });

  it('refuses a later fetch after a search disables a provider', async () => {
    const searchSpy = vi.fn(async () => {
      throw new Error('bang.');
    });
    const module: WebSearchProviderModule = { provider: { search: searchSpy } };
    const activate = vi.spyOn(tinyfishManifest, 'activate').mockResolvedValue(module as never);

    await expect(webSearch(searchCommand('tinyfish'), {
      tokens: { tinyfish: 'tinyfish-key' },
      fetch: transport(),
    })).resolves.toBe('Web search failed (tinyfish): provider failed: bang.');

    await expect(webFetch(fetchCommand('tinyfish'), {
      tokens: { tinyfish: 'tinyfish-key' },
      fetch: transport(),
    })).resolves.toBe('Web fetch failed (tinyfish): provider failed: bang.');
    expect(activate).toHaveBeenCalledOnce();
  });
});
