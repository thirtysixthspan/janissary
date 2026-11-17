# Web fetch 16 — the fetch cache

**Complexity: 6/10** — 29 test scenarios (expiry, LRU, and offset-0 versus offset-above-0 core cases), 18 requirements, ~65 added lines in 1 new module and 1 edited file (p=6.17)

Run order: 16 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "Cache", "When the cache is read", and "Cache ownership" decisions, the "Cache" bullet under "Fetch core", the cache half of step 4 of "Order of work", the "Cache" bullet under "Tests", `Map` insertion order in the "Node standard library" row, and "A cache bypass flag, or a cache that survives restart" under "Out of scope"). Depends on these earlier subplans:

- `product/plans/ready/web-fetch-13-fetch-parser.md`, for `WebFetchCommand`, whose `url` is kept exactly as typed, whose `format` is already lowercased, and whose `provider` is kept as typed;
- `product/plans/ready/web-fetch-14-fetch-rendering.md`, for `FetchedPage` and `renderFetched` in `src/web/fetch/render.ts`;
- `product/plans/ready/web-fetch-15-fetch-core.md`, for `runWebFetch`, `webFetch`, `WebFetchDeps` with its optional `now`, and the step order of the attempt loop in `src/web/fetch/fetch.ts`.

A caller reading a long page in slices fetches the same URL again with a larger `--offset`. The source plan keeps each successful page's full content in memory for 15 minutes, so those follow-up slices don't refetch. This plan adds the cache as a small module and puts it in front of the fetch core's attempt loop. Subplan 15 declared `deps.now` and left reading it, with the `Date.now` default, to this plan.

Paths below are the post-subplan-15 ones. At today's baseline none of `src/web/fetch/` exists: `src/web-search/` is renamed to `src/web/` by subplan 1, `render.ts` comes from subplan 14, and `fetch.ts` and `fetch.test.ts` from subplan 15. Grep for the quoted identifier rather than trusting a line number.

## Design decisions

- **Module and exports (source plan, Cache).** A new `src/web/fetch/cache.ts` exports:
  - `FETCH_CACHE_TTL_MS`, 15 minutes in milliseconds (900000), and `FETCH_CACHE_MAX_ENTRIES`, 50;
  - the type `FetchCache`, an object with `get(key: string, now: number): FetchedPage | undefined` and `set(key: string, page: FetchedPage, now: number): void`;
  - `createFetchCache(): FetchCache`, backed by a private `Map` whose insertion order is the LRU;
  - `fetchCacheKey(url: string, format: string, provider: string): string`.
  It imports only the type `FetchedPage` from `./render.js`, which already carries exactly the three stored fields: the final URL, the source provider id, and the full content. There's no separate entry type. Inside the map each page sits beside the `now` it was stored at.
- **Expiry (source plan, Cache).** An entry is live while `now - storedAt` is at least 0 and below `FETCH_CACHE_TTL_MS`. So it expires at exactly 15 minutes after it was stored. A negative age means the wall clock stepped backwards, and it counts as expired, as `refresh` treats it at `src/state/listings.ts:20` (`if (age >= 0 && age < LISTING_TTL_MS) return entry;`). That keeps a clock change from pinning an old page in place.
- **Reads.** `get` returns `undefined` for a missing key. For an expired entry it deletes the entry and returns `undefined`. For a live hit it deletes the key and re-inserts the same stored entry at the end of the map, then returns its page. So a hit counts as a use. It doesn't extend the expiry: `storedAt` is unchanged, and a page read every minute still expires 15 minutes after it was stored.
- **Writes.** `set` deletes any existing entry for the key and inserts the new page at the end with `storedAt` set to `now`. Then, while the map holds more than `FETCH_CACHE_MAX_ENTRIES` entries, it deletes the first key. So adding a 51st entry evicts the least recently used, and re-setting a key that's already there evicts nothing. Expired entries are not swept on write. They hold a slot until a read deletes them or eviction reaches them, and the 50-entry bound still holds.
- **No timers (source plan, Cache ownership).** The cache has no clock and no timers, and expiry is checked on read, so there's nothing to dispose. The caller passes the time on each call, which lets the module-level cache honour each call's injected `deps.now`.
- **Key (source plan, Cache).** `fetchCacheKey` joins three parts with `\n`: the requested URL exactly as given, the format lowercased, and the provider lowercased. The core passes `request.url`, `request.format`, and `request.provider`, never the final URL. `--timeout`, `--offset`, and `--max-chars` are not part of the key. A newline can't occur in a format or a provider name, so two different triples never produce the same key, even if a URL that reached the far side through the remote operation held a newline. An `auto` fetch is stored under `auto` only, not also under the provider that answered it, so `--provider auto` and `--provider tavily` keep separate entries.
- **The clock.** At the start of `runWebFetch`, pick the clock function: `deps.now` when given, otherwise `Date.now`, with `??` as `src/acp-records/manager.ts:26` does (`this.now = options.now ?? Date.now;`). The repo's lint config doesn't enable `@typescript-eslint/unbound-method`, and `Date.now` doesn't use `this`. Call the clock separately for the read and for the write. So an entry's 15 minutes count from when it was stored, not from when the fetch started.
- **When the core reads and writes (source plan, When the cache is read).** `runWebFetch` in `src/web/fetch/fetch.ts` gains a required cache parameter in second position: `runWebFetch(registry, cache, request, deps)`, where `cache` is a `FetchCache`. Compute the key once per call. The cache changes subplan 15's step order in two places and nothing else:
  - Between step 1 (the first `deps.signal?.throwIfAborted()`) and step 2 (resolution), read the cache, but only when `request.offset` is above 0. A live entry returns `renderFetched(page, request.offset, request.maxChars)` at once. No resolution runs, no provider activates, and nothing is sent. A miss carries on to step 2 unchanged. Put the read in a private helper in `fetch.ts` that returns the page or `undefined`, so `runWebFetch` gains a single `if` and stays well under `sonarjs/cognitive-complexity`'s 15.
  - In step 4, on a `fetched` outcome, keep subplan 15's `deps.signal?.throwIfAborted()` first. Then build the `FetchedPage` (`{ url: outcome.url, source: manifest.id, content: outcome.content }`), store it with `cache.set(key, page, now())`, and render that same page. So an aborted call stores nothing.
  - An `--offset 0` fetch, the default, never reads the cache. It always fetches anew, and on success it replaces the entry.
  - Only a `fetched` outcome stores. Failure lines, the redirected-to answer, and every resolution refusal store nothing, and they leave any existing entry for the key untouched. So a later `--offset` above 0 can still slice a page stored before an `--offset 0` refetch failed or redirected. Empty content is stored like any other page, and a hit on it prints `(empty page)`.
  - Because the read comes before resolution, a live entry is served even when its provider has since been disabled, or when the calling host's tokens lack that provider's key. A remote host's serving process keeps one cache for every workspace it serves, so workspaces there share entries.
  - A hit prints exactly what a fresh fetch would print for that slice, since both go through `renderFetched` with the stored final URL and source. There's no cache marker.
  - There is no bypass flag.
- **Module-level instance (source plan, Cache ownership).** `fetch.ts` creates one cache at module scope with `createFetchCache()`. It isn't exported. The registry stays in `src/web/providers/default-registry.ts`, which holds nothing else (subplan 15). Each process therefore has its own cache: the local server, and a remote host's serving process. The cache lives in memory only and is lost on restart. `webFetch(request, deps)` keeps its signature and returns `runWebFetch(webProviderRegistry, <the module cache>, request, deps)`. Its callers in subplans 18, 21, 24, and 25 don't change, pass no `now`, and so use `Date.now`. Tests call `runWebFetch` with their own `createFetchCache()`.
- **Scale note (source plan, Cache).** The ceiling is deliberate: 50 entries per process, each up to one page's text. Record it in a comment at the top of `cache.ts`, together with the upgrade path. If pages ever need to survive restarts or be shared across processes, that path is a bounded on-disk store under the state directory. No cache class or library is added.
- **Size and lint.** `cache.ts` lands near 40 counted lines and `fetch.ts` grows by about 10, both far under the 200-line `max-lines` limit. Relative imports carry `.js`: `fetch.ts` imports `createFetchCache` and `fetchCacheKey`, and the type `FetchCache`, from `./cache.js`. Neither module imports the other in a cycle, since `cache.ts` imports only from `render.ts`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Fetch core | `runWebFetch`, `webFetch`, `WebFetchDeps` in `src/web/fetch/fetch.ts` (subplan 15) | Gains the cache read, the write, and the module cache |
| Page type and rendering | `FetchedPage`, `renderFetched` in `src/web/fetch/render.ts` (subplan 14) | The stored value, and how a hit renders |
| Injected clock with `Date.now` default | `options.now ?? Date.now` in `src/acp-records/manager.ts:26` | Precedent for reading `deps.now` |
| TTL check | `refresh` in `src/state/listings.ts:17` | Precedent for treating a negative age as stale |
| Fetch core tests | `src/web/fetch/fetch.test.ts` (`fakeFetchProvider`, `registryWith`, `command`, from subplan 15) | Helpers for the core's cache cases |
| `Map` insertion order | Node standard library | The LRU |

## Proposed changes

- `src/web/fetch/cache.ts` (new): the two constants, `FetchCache`, `createFetchCache`, `fetchCacheKey`, and the scale-note comment.
- `src/web/fetch/fetch.ts`: the clock default, the cache parameter, the private read helper, the read before resolution, the write on `fetched`, and the module cache passed by `webFetch`.

Both land in one change, with their tests, so typecheck stays green.

## Tests

`src/web/fetch/cache.test.ts` (new) drives the cache with plain numbers for `now`:

- key composition: `fetchCacheKey('https://Example.com/A', 'Markdown', 'TAVILY')` keeps the URL as given and lowercases the other two, and differs from the key with `text` or `tinyfish`;
- a live hit returns the stored page, with its `url`, `source`, and `content`;
- an entry is still live at `FETCH_CACHE_TTL_MS - 1` after it was stored, and missed at exactly `FETCH_CACHE_TTL_MS`;
- an expired read deletes the entry: after the miss at `FETCH_CACHE_TTL_MS`, a read at the store time also misses;
- a read at a `now` earlier than the store time misses;
- a hit doesn't extend the expiry: a hit at 10 minutes, then a miss at 15;
- with 50 entries stored, all 50 hit;
- a hit refreshes recency, so after storing 50 entries, reading the first, and storing a 51st, the first still hits and the second misses;
- re-setting an existing key replaces its page and moves it to the end, so the next 51st distinct insert evicts a different entry, and the re-set itself evicts nothing.

`src/web/fetch/fetch.test.ts` passes a fresh `createFetchCache()` as the new second argument of every existing `runWebFetch` call. Those cases all start empty, so their expected outputs don't change. The cache cases inject `now: () => clock` with a mutable `clock`, use one `local`-style tokenless provider stub whose `fetch` spy returns a 30-character page unless a case says otherwise, and assert exact output strings:

- `--offset 0` fetches twice when called twice with one cache, and the second page replaces the first, so a following `--offset 5` prints a slice of the second page;
- `--offset 5` after an `--offset 0` fetch prints with no further `fetch` or `activate` call, and its output equals what a fresh `--offset 5` fetch prints with an empty cache;
- `--offset 5` on an empty cache fetches and stores, so a second `--offset 5` makes no further `fetch` call;
- `--offset 5` at exactly 15 minutes after the store fetches again;
- the 15 minutes count from the store: a `fetch` stub that advances `clock` by 10 minutes before answering, then an `--offset 5` at 20 minutes after the call started, hits;
- an empty page from `--offset 0`, then `--offset 3` printing `(empty page)` with no further `fetch` call;
- an `--offset 0` failure, an `--offset 0` redirect, and an `--offset 0` refusal each leave nothing stored, so the next `--offset 5` runs an attempt. The refusal uses a token-named stub: `--provider tavily` with `tokens: {}` prints the not-configured line, then `--offset 5` with the token calls its `fetch`;
- an `--offset 0` fetch that fails after an earlier success leaves the earlier entry, so `--offset 5` slices it with no attempt;
- a different `--max-chars` or `--timeout` hits the same entry; a different `--format`, or `--provider tavily` after an `auto` fetch, misses; `--provider AUTO` after `auto` hits;
- a hit served after its provider was disabled: a registry where the stored page came from one provider, which a later `--offset 0` call disables with a plugin failure, still prints the `--offset 5` slice;
- a signal aborted before the call rejects even when a live entry exists;
- a provider that aborts the signal and then answers with a page rejects, and a later `--offset 5` with a fresh signal runs an attempt, so nothing was stored;
- with no `now` in deps, `vi.spyOn(Date, 'now')` drives expiry, as `src/file-glob/glob.test.ts:295` spies on it;
- in the `describe('the module registry')` block: `webFetch` keeps a module cache. Spy `localManifest.activate` (exported from `src/web/providers/catalog.ts` by subplan 12) to resolve to a stub provider, call `webFetch` with `--provider local` at `--offset 0` and then at `--offset 5`, and confirm the stub's `fetch` ran once and the second output is the slice.

## Documentation

No spec, help, or developer doc changes here. Subplan 21 writes `product/specs/web-fetch.md` and the `help/web.md` fetch sections, both of which cover the cache and when it is read.

## Out of scope

- A bypass flag or a persistent cache (source plan, Out of scope).
- Sharing entries across processes, or between the local server and a remote host.
- Any caller change: `webFetch` keeps its signature, and the remote operation (subplan 18), the tab adapter (subplan 21), and the agent paths (subplans 24 and 25) call it as they would without the cache.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/web/fetch` so the cache and core suites run even where `--changed` would skip one. Confirm `git grep -n "runWebFetch(" -- src` shows every call passing a cache second. Nothing calls `webFetch` from a tab yet, so there is no manual check until subplan 21.
