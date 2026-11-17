// This cache holds at most FETCH_CACHE_MAX_ENTRIES pages per process and at most
// FETCH_CACHE_MAX_CHARS characters of page content in total, and lives only in memory: it is lost
// on restart and is never shared across processes. A page whose content alone exceeds
// FETCH_CACHE_MAX_ENTRY_CHARS is never cached. If pages ever need to survive a restart or be
// shared, the upgrade path is a bounded on-disk store under the state directory. No cache class or
// library is needed for the in-memory case.

import type { FetchedPage } from './render.js';

export const FETCH_CACHE_TTL_MS = 900_000;

export const FETCH_CACHE_MAX_ENTRIES = 50;

export const FETCH_CACHE_MAX_CHARS = 20_000_000;

export const FETCH_CACHE_MAX_ENTRY_CHARS = FETCH_CACHE_MAX_CHARS / 4;

export type FetchCache = {
  get: (key: string, now: number) => FetchedPage | undefined;
  set: (key: string, page: FetchedPage, now: number) => void;
};

type Entry = { page: FetchedPage; storedAt: number };

export function createFetchCache(): FetchCache {
  const entries = new Map<string, Entry>();
  let totalChars = 0;
  return {
    get(key, now) {
      const entry = entries.get(key);
      if (entry === undefined) return;
      const age = now - entry.storedAt;
      if (age < 0 || age >= FETCH_CACHE_TTL_MS) {
        entries.delete(key);
        totalChars -= entry.page.content.length;
        return;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry.page;
    },
    set(key, page, now) {
      const existing = entries.get(key);
      if (existing !== undefined) {
        entries.delete(key);
        totalChars -= existing.page.content.length;
      }
      if (page.content.length > FETCH_CACHE_MAX_ENTRY_CHARS) return;
      entries.set(key, { page, storedAt: now });
      totalChars += page.content.length;
      while (entries.size > FETCH_CACHE_MAX_ENTRIES || totalChars > FETCH_CACHE_MAX_CHARS) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        const evicted = entries.get(oldest);
        if (evicted !== undefined) totalChars -= evicted.page.content.length;
        entries.delete(oldest);
      }
    },
  };
}

export function fetchCacheKey(url: string, format: string, provider: string): string {
  return `${url}\n${format.toLowerCase()}\n${provider.toLowerCase()}`;
}
