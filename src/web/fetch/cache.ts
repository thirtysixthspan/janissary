// This cache holds at most FETCH_CACHE_MAX_ENTRIES pages per process, each up to one page of text,
// and lives only in memory: it is lost on restart and is never shared across processes. If pages
// ever need to survive a restart or be shared, the upgrade path is a bounded on-disk store under
// the state directory. No cache class or library is needed for the in-memory case.

import type { FetchedPage } from './render.js';

export const FETCH_CACHE_TTL_MS = 900_000;

export const FETCH_CACHE_MAX_ENTRIES = 50;

export type FetchCache = {
  get: (key: string, now: number) => FetchedPage | undefined;
  set: (key: string, page: FetchedPage, now: number) => void;
};

type Entry = { page: FetchedPage; storedAt: number };

export function createFetchCache(): FetchCache {
  const entries = new Map<string, Entry>();
  return {
    get(key, now) {
      const entry = entries.get(key);
      if (entry === undefined) return;
      const age = now - entry.storedAt;
      if (age < 0 || age >= FETCH_CACHE_TTL_MS) {
        entries.delete(key);
        return;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry.page;
    },
    set(key, page, now) {
      entries.delete(key);
      entries.set(key, { page, storedAt: now });
      while (entries.size > FETCH_CACHE_MAX_ENTRIES) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}

export function fetchCacheKey(url: string, format: string, provider: string): string {
  return `${url}\n${format.toLowerCase()}\n${provider.toLowerCase()}`;
}
