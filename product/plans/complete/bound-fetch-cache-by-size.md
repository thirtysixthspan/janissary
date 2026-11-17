# Bound the web fetch cache by total content size

**Complexity: 3/10** — ~35 added lines in 1 production file, 6 requirements, 6 scenarios (p=4.74)

`web fetch` keeps a successful page's full content in memory for 15 minutes, keyed by URL, format, and provider, under a ceiling of 50 entries. Because the `local` provider accepts bodies up to 50 MiB, those 50 pages can hold roughly 2.5 GB of UTF-8 text, up to 5 GB as UTF-16 strings, on the server heap. This fix gives the cache a process-wide character budget and refuses to store a page that is too large on its own, so a run of large fetches cannot exhaust memory.

## Goal

Bound the cache's total stored content regardless of individual page sizes, while preserving the existing LRU, TTL, key, and `--offset` behavior.

## Approach

Track the summed `content.length` of cached entries in the `createFetchCache` closure beside the `Map`. Export a total budget and a smaller per-entry ceiling. On `set`, remove any existing entry for the key first, skip storing a page whose content alone exceeds the per-entry ceiling, then insert and evict least-recently-used entries from the front of the `Map` until both the entry count and the character total are within limits. Subtract from the running total whenever an entry is removed, including on TTL expiry during `get` and on key replacement. `fetch.ts` needs no behavioral change: an oversized page is simply not stored, so a later `--offset` read fetches it again.

## Implementation steps

1. In `src/web/fetch/cache.ts`, add exported `FETCH_CACHE_MAX_CHARS` (20,000,000 UTF-16 units) and `FETCH_CACHE_MAX_ENTRY_CHARS` (`FETCH_CACHE_MAX_CHARS / 4`), and rewrite the top-of-file comment to state the total and per-entry bounds and that an oversized page is never cached.
2. Add a `totalChars` counter to `createFetchCache`. In `get`, subtract an expired entry's `content.length` when deleting it. In `set`, remove any existing entry for the key and subtract its length, return without storing when the incoming `content.length` exceeds `FETCH_CACHE_MAX_ENTRY_CHARS`, then insert, add its length, and extend the eviction `while` condition to `entries.size > FETCH_CACHE_MAX_ENTRIES || totalChars > FETCH_CACHE_MAX_CHARS`, subtracting each evicted entry's length.
3. Leave `src/web/fetch/fetch.ts` unchanged.

## Tests

Extend `src/web/fetch/cache.test.ts`, keeping every existing case unchanged, with these cases:

- a page whose content exceeds `FETCH_CACHE_MAX_ENTRY_CHARS` is not stored;
- storing an oversized page leaves an existing entry in place and does not consume the character budget;
- inserting pages whose combined content exceeds `FETCH_CACHE_MAX_CHARS` evicts the least recently used entry;
- a recently read page survives character-budget eviction while an older one is dropped;
- replacing a key with a smaller page frees its characters so later inserts are not evicted early;
- reading an expired entry frees its characters so a later insert is not evicted early.

The `runWebFetch` cache cases in `src/web/fetch/fetch.test.ts` must keep passing unchanged.

## Documentation

Update the Cache section of `product/specs/web-fetch.md`, the Fetch cache paragraph of `help/web.md`, and the Cache design decision in `product/plans/complete/web-fetch.md` to state the character budget, the per-entry ceiling, that an oversized page is never cached, and that a later `--offset` read refetches it.

## Out of scope

- Changing `fetch.ts`, the parser, renderer, providers, or command grammar.
- A cache bypass flag, a persistent or on-disk cache, or a different TTL or entry count.
- New documentation pages; only the existing cache prose is updated.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and confirm lint, typecheck, and server tests pass.
