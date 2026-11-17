import { describe, expect, it } from 'vitest';
import {
  createFetchCache,
  FETCH_CACHE_MAX_ENTRIES,
  FETCH_CACHE_TTL_MS,
  fetchCacheKey,
} from './cache.js';
import type { FetchedPage } from './render.js';

const PAGE: FetchedPage = {
  url: 'https://example.com/final',
  source: 'tavily',
  content: 'hello',
};

describe('fetchCacheKey', () => {
  it('keeps the URL as given and lowercases the format and provider', () => {
    const key = fetchCacheKey('https://Example.com/A', 'Markdown', 'TAVILY');
    expect(key).toBe('https://Example.com/A\nmarkdown\ntavily');
    expect(fetchCacheKey('https://Example.com/A', 'text', 'TAVILY')).not.toBe(key);
    expect(fetchCacheKey('https://Example.com/A', 'Markdown', 'tinyfish')).not.toBe(key);
    expect(fetchCacheKey('https://example.com/A', 'Markdown', 'TAVILY')).not.toBe(key);
  });
});

describe('createFetchCache', () => {
  it('returns the stored page on a live hit', () => {
    const cache = createFetchCache();
    cache.set('key', PAGE, 0);
    expect(cache.get('key', 1000)).toBe(PAGE);
    expect(cache.get('key', 1000)).toStrictEqual({
      url: 'https://example.com/final',
      source: 'tavily',
      content: 'hello',
    });
  });

  it('is live just under the TTL and expired at exactly the TTL', () => {
    const cache = createFetchCache();
    cache.set('key', PAGE, 1000);
    expect(cache.get('key', 1000 + FETCH_CACHE_TTL_MS - 1)).toBe(PAGE);
    expect(cache.get('key', 1000 + FETCH_CACHE_TTL_MS)).toBeUndefined();
  });

  it('deletes an entry when an expired read misses it', () => {
    const cache = createFetchCache();
    cache.set('key', PAGE, 1000);
    expect(cache.get('key', 1000 + FETCH_CACHE_TTL_MS)).toBeUndefined();
    expect(cache.get('key', 1000)).toBeUndefined();
  });

  it('misses when the clock is earlier than the store time', () => {
    const cache = createFetchCache();
    cache.set('key', PAGE, 1000);
    expect(cache.get('key', 999)).toBeUndefined();
  });

  it('does not extend the expiry when a hit refreshes recency', () => {
    const cache = createFetchCache();
    cache.set('key', PAGE, 0);
    expect(cache.get('key', 10 * 60_000)).toBe(PAGE);
    expect(cache.get('key', 15 * 60_000)).toBeUndefined();
  });

  it('hits every entry when exactly the maximum are stored', () => {
    const cache = createFetchCache();
    for (let index = 0; index < FETCH_CACHE_MAX_ENTRIES; index++) {
      cache.set(`key-${String(index)}`, PAGE, 0);
    }
    for (let index = 0; index < FETCH_CACHE_MAX_ENTRIES; index++) {
      expect(cache.get(`key-${String(index)}`, 1)).toBe(PAGE);
    }
  });

  it('keeps a hit recent when a 51st entry evicts the least recently used', () => {
    const cache = createFetchCache();
    for (let index = 0; index < FETCH_CACHE_MAX_ENTRIES; index++) {
      cache.set(`key-${String(index)}`, PAGE, 0);
    }
    expect(cache.get('key-0', 1)).toBe(PAGE);
    cache.set('key-50', PAGE, 0);
    expect(cache.get('key-0', 1)).toBe(PAGE);
    expect(cache.get('key-1', 1)).toBeUndefined();
    expect(cache.get('key-50', 1)).toBe(PAGE);
  });

  it('replaces a re-set page, moves it to the end, and evicts nothing on re-set', () => {
    const replacement: FetchedPage = { ...PAGE, content: 'replaced' };
    const cache = createFetchCache();
    for (let index = 0; index < FETCH_CACHE_MAX_ENTRIES; index++) {
      cache.set(`key-${String(index)}`, PAGE, 0);
    }
    cache.set('key-0', replacement, 0);
    for (let index = 0; index < FETCH_CACHE_MAX_ENTRIES; index++) {
      expect(cache.get(`key-${String(index)}`, 1)).toBe(index === 0 ? replacement : PAGE);
    }

    const evicting = createFetchCache();
    for (let index = 0; index < FETCH_CACHE_MAX_ENTRIES; index++) {
      evicting.set(`key-${String(index)}`, PAGE, 0);
    }
    evicting.set('key-0', replacement, 0);
    evicting.set('key-50', PAGE, 0);
    expect(evicting.get('key-0', 1)).toBe(replacement);
    expect(evicting.get('key-1', 1)).toBeUndefined();
  });
});
