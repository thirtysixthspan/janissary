import { describe, expect, it } from 'vitest';
import {
  createFetchCache,
  FETCH_CACHE_MAX_CHARS,
  FETCH_CACHE_MAX_ENTRIES,
  FETCH_CACHE_MAX_ENTRY_CHARS,
  FETCH_CACHE_TTL_MS,
  fetchCacheKey,
} from './cache.js';
import type { FetchedPage } from './render.js';

const PAGE: FetchedPage = {
  url: 'https://example.com/final',
  source: 'tavily',
  content: 'hello',
};

const BIG_CONTENT = 'x'.repeat(FETCH_CACHE_MAX_ENTRY_CHARS);

function bigPage(source: string): FetchedPage {
  return { url: `https://example.com/${source}`, source, content: BIG_CONTENT };
}

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

  it('does not store a page whose content exceeds the per-entry ceiling', () => {
    const cache = createFetchCache();
    const oversized: FetchedPage = {
      ...PAGE,
      content: 'x'.repeat(FETCH_CACHE_MAX_ENTRY_CHARS + 1),
    };
    cache.set('oversized', oversized, 0);
    expect(cache.get('oversized', 1)).toBeUndefined();
  });

  it('leaves an existing entry in place when an oversized page is set', () => {
    const cache = createFetchCache();
    const oversized: FetchedPage = {
      ...PAGE,
      content: 'x'.repeat(FETCH_CACHE_MAX_ENTRY_CHARS + 1),
    };
    cache.set('keep', bigPage('keep'), 0);
    cache.set('oversized', oversized, 0);
    for (let index = 0; index < 3; index++) {
      cache.set(`fill-${String(index)}`, bigPage(`fill-${String(index)}`), 0);
    }
    expect(cache.get('keep', 1)).toBeDefined();
    expect(cache.get('oversized', 1)).toBeUndefined();
    for (let index = 0; index < 3; index++) {
      expect(cache.get(`fill-${String(index)}`, 1)).toBeDefined();
    }
  });

  it('evicts the least recently used page when the character budget is exceeded', () => {
    expect(FETCH_CACHE_MAX_CHARS).toBe(FETCH_CACHE_MAX_ENTRY_CHARS * 4);
    const cache = createFetchCache();
    const pages = ['0', '1', '2', '3', '4'].map((source) => bigPage(source));
    for (const [index, page] of pages.entries()) {
      cache.set(`key-${String(index)}`, page, 0);
    }
    expect(cache.get('key-0', 1)).toBeUndefined();
    for (let index = 1; index < pages.length; index++) {
      expect(cache.get(`key-${String(index)}`, 1)).toBe(pages[index]);
    }
  });

  it('keeps a recently read page when the character budget forces eviction', () => {
    const cache = createFetchCache();
    const pages = ['0', '1', '2', '3'].map((source) => bigPage(source));
    for (const [index, page] of pages.entries()) {
      cache.set(`key-${String(index)}`, page, 0);
    }
    expect(cache.get('key-0', 1)).toBe(pages[0]);
    const newest = bigPage('4');
    cache.set('key-4', newest, 0);
    expect(cache.get('key-0', 1)).toBe(pages[0]);
    expect(cache.get('key-1', 1)).toBeUndefined();
    for (let index = 2; index < pages.length; index++) {
      expect(cache.get(`key-${String(index)}`, 1)).toBe(pages[index]);
    }
    expect(cache.get('key-4', 1)).toBe(newest);
  });

  it('frees characters when a key is replaced by a smaller page', () => {
    const cache = createFetchCache();
    const small: FetchedPage = { ...PAGE, content: 'tiny' };
    cache.set('key', bigPage('key'), 0);
    cache.set('key', small, 0);
    for (let index = 0; index < 3; index++) {
      cache.set(`fill-${String(index)}`, bigPage(`fill-${String(index)}`), 0);
    }
    expect(cache.get('key', 1)).toBe(small);
    for (let index = 0; index < 3; index++) {
      expect(cache.get(`fill-${String(index)}`, 1)).toBeDefined();
    }
  });

  it('frees characters when an expired entry is read', () => {
    const cache = createFetchCache();
    const pages = ['0', '1', '2', '3'].map((source) => bigPage(source));
    for (const [index, page] of pages.entries()) {
      cache.set(`key-${String(index)}`, page, 0);
    }
    expect(cache.get('key-0', FETCH_CACHE_TTL_MS)).toBeUndefined();
    const newest = bigPage('4');
    cache.set('key-4', newest, 0);
    const stillLive = FETCH_CACHE_TTL_MS - 1;
    for (let index = 1; index < pages.length; index++) {
      expect(cache.get(`key-${String(index)}`, stillLive)).toBe(pages[index]);
    }
    expect(cache.get('key-4', stillLive)).toBe(newest);
  });
});
