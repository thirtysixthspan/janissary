# Web fetch 9 — TinyFish fetch

**Complexity: 6/10** — ~40 added lines across 3 files, 12 requirements, 17 test scenarios (p=5.89)

Run order: 9 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "TinyFish fetch" bullet under "Provider contract, registry, and catalog", the TinyFish sentences of "Provider request details", the TinyFish formats in "Provider contract", and the TinyFish half of "Provider-reported misses"). Depends on these earlier subplans:

- `product/plans/ready/web-fetch-1-rename-web-directory.md`, for the `src/web/providers/` layout;
- `product/plans/ready/web-fetch-2-provider-capability-declarations.md`, for `fetchFormats`, `WebFetchRequest`, `WebFetchPage`, the optional `fetch` on `WebSearchProvider`, `search: true` on `tinyfishManifest`, and `tinyfish.ts`'s switch to `satisfies WebSearchProvider`;
- `product/plans/ready/web-fetch-7-attempt-timeout.md`, for the required `timeoutMs` fourth parameter of `requestJson`, its `timed out after <s> s` reason, and `search` passing `PROVIDER_TIMEOUT_MS`;
- `product/plans/ready/web-fetch-8-tavily-fetch.md`, for `src/web/providers/decode-fetch.ts` with its exported `decodeTavilyPage` and `couldNotFetch` and its private `firstRecord`, and for Tavily's `fetchFormats` that the real-catalog test already asserts.

Subplans 4 and 6 don't touch any file this plan edits. They matter once TinyFish declares formats: subplan 4's resolution then counts TinyFish as fetch-capable for `markdown` and `html`, and subplan 6's `runFetchAttempt` is what calls its `fetch` and validates the page it returns.

TinyFish already searches. This plan teaches it to fetch one page through its fetch API and declares the formats it serves. It is the second hosted provider an `auto` fetch tries, after Tavily and before `local`. Nothing user-facing calls fetch yet.

Paths below are the post-rename ones. Today the module is `src/web-search/providers/tinyfish.ts` (17 lines; `SEARCH_URL` at `:5`, the `requestJson` call at `:11`), the catalog is `src/web-search/providers/catalog.ts` (`tinyfishManifest` at `:11`), and the provider tests are `src/web-search/providers/tinyfish.test.ts`. `decode-fetch.ts` doesn't exist until subplan 8. Grep for the quoted identifier rather than trusting a line number.

## Design decisions

- **Formats (source plan, Provider contract).** `tinyfishManifest` in `src/web/providers/catalog.ts` declares `fetchFormats: ['markdown', 'html']`, beside subplan 2's `search: true` and its token. The manifest keeps `as const satisfies WebSearchProviderManifest`; subplan 2 typed the field `readonly`, so the tuple fits.
- **Request (source plan, TinyFish fetch and Provider request details).** The fetch is `POST https://api.fetch.tinyfish.ai`, held in a new module constant `FETCH_URL` beside `SEARCH_URL`. It sends two headers, `X-API-Key: <capability.apiKey>` and `Content-Type: application/json`. The JSON body, built with `JSON.stringify`, holds exactly four fields:
  - `urls`: a one-element array holding `request.url` unchanged;
  - `format`: `request.format`, which resolution only ever passes as `markdown` or `html` for TinyFish (subplans 4 and 5);
  - `ttl`: `0`, so TinyFish's server-side cache never serves a stale page (it accepts any cached copy when `ttl` is omitted);
  - `per_url_timeout_ms`: the smaller of `request.timeoutMs` and 110000, sent as a JSON number. The 110000 cap is a named module constant, not a bare literal. Every `timeoutMs` the core passes is a whole number of seconds from 1 to 120 times 1000 (subplans 7, 13, and 15), so the value needs no rounding.
- **The core still waits the full timeout (source plan, `--timeout`).** `fetch` passes `request.timeoutMs`, not the capped value, as `requestJson`'s fourth argument. So a 120-second request is sent `per_url_timeout_ms: 110000` while the helper waits up to 120 seconds, and a timeout reads `timed out after 120 s`.
- **Search stays as it is.** `search` keeps its `GET` to `SEARCH_URL` with only the `X-API-Key` header and `PROVIDER_TIMEOUT_MS` (subplan 7). Unlike Tavily's two `POST` calls, which subplan 8 folds into `postJson`, TinyFish's search and fetch differ in method, URL shape, headers, and body, so they share no request builder. `fetch` calls `requestJson` directly. The existing search tests pass unedited, which pins that search's request didn't change.
- **Response (source plan, TinyFish fetch and Provider-reported misses).** A new exported `decodeTinyFishPage(body, requestedUrl)` in `src/web/providers/decode-fetch.ts` returns a `WebFetchPage` or throws. It reads the parsed body in the same order as subplan 8's `decodeTavilyPage`:
  1. If `results[0]` is a record whose `text` is a string, that string is the content. An empty string is content too: it's the empty-page answer (subplan 14 prints `(empty page)`), so it never falls back. The final URL is `results[0].final_url` when that's a non-empty string, and `requestedUrl` otherwise.
  2. Otherwise, if `errors[0]` is a record whose `error` is a string (a code such as `bot_blocked`), throw `couldNotFetch(error)` from subplan 8. That gives `could not fetch: bot_blocked`, and `could not fetch: provider request failed` for an empty or blank error.
  3. Otherwise, throw `ProviderRequestError('invalid response')`. That covers a body that isn't a record (a JSON array included), a missing or empty `results` with no usable error, and a `results[0]` whose `text` isn't a string (`null`, absent, or the object TinyFish returns for its `json` format) when `errors` has nothing usable.
  A `results[0]` with a non-string `text` beside a usable `errors[0]` therefore reports the error, exactly as Tavily's decoder does. The source plan's "a TinyFish `text` that is not a string is `invalid response`" holds whenever TinyFish reports no error. Every miss throws `ProviderRequestError`, so subplan 6's runner records `failed` and `auto` falls back. Nothing in this decoder disables the provider.
- **Reuse inside `decode-fetch.ts`.** `decodeTinyFishPage` reads `results` and `errors` through subplan 8's private `firstRecord`, never by assigning a `body.results[0]` element to a local (an element of a narrowed `any[]` is `any`, which fails `@typescript-eslint/no-unsafe-assignment`). The final-URL rule ("a non-empty string, else the requested URL") is the same for both providers, so give it one definition: a private `finalUrl(value: unknown, requestedUrl: string)` helper in `decode-fetch.ts`, used by both decoders. If subplan 8 wrote the rule inline in `decodeTavilyPage`, switch that decoder to the helper; its behavior doesn't change, and its existing `tavily.test.ts` fallback cases pin it. No new imports are needed in `decode-fetch.ts`.
- **Wiring in `tinyfish.ts`.** The new `fetch` method sits beside `search` in the `satisfies WebSearchProvider` object and returns `decodeTinyFishPage(body, request.url)`. Import `decodeTinyFishPage` from `./decode-fetch.js`. `fetch` adds no `try`/`catch`: an HTTP error status, a timeout, a network error, an undecodable body, and an abort are all raised by `requestJson` before the decoder runs (subplan 7), so an abort reaches the runner untouched and disables nothing.
- **Private hosts (source plan, Provider request details).** TinyFish refuses private, loopback, and metadata hosts itself and reports them as an `errors[]` entry, which step 2 turns into `could not fetch: <code>`. An `auto` fetch then falls back to `local`. No host check is added here.
- **Redirects.** TinyFish follows redirects itself and reports the final URL, so `fetch` never returns subplan 2's `{ redirectedTo }`.
- **One change.** The catalog entry, the module, and the decoder land together. Declaring `fetchFormats` without the `fetch` method would make resolution choose TinyFish and the runner disable it with `provider failed: module has no fetch`.
- **File sizes.** `tinyfish.ts` grows from 17 lines to about 35, and `decode-fetch.ts` from about 35 to about 55. Both stay far under the 200-line limit.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| JSON request helper | `requestJson` in `src/web/providers/http.ts` (per-attempt `timeoutMs` from subplan 7) | Sends the request; raises HTTP, timeout, network, invalid-JSON, and abort failures |
| Fetch decoders | `src/web/providers/decode-fetch.ts` (subplan 8): `decodeTavilyPage`, `couldNotFetch`, private `firstRecord` | Gains `decodeTinyFishPage` and the shared `finalUrl` helper |
| Miss reason | `couldNotFetch` in `decode-fetch.ts`, built on `firstLine` in `src/models/providers/result.ts` | The `could not fetch:` reason; don't write a new first-line function |
| TinyFish module | `provider` and `SEARCH_URL` in `src/web/providers/tinyfish.ts` | Gains `fetch` beside `search` |
| Fetch types | `WebFetchRequest`, `WebFetchPage` in `src/web/providers/contract.ts` (subplan 2) | Request and result |
| Expected-failure type | `ProviderRequestError` in `src/web/providers/contract.ts` | Every miss |
| Test precedent | the `fetch` block in `src/web/providers/tavily.test.ts` (subplan 8) | Shape of the TinyFish `fetch` block |

## Proposed changes

These land together.

- `src/web/providers/decode-fetch.ts`: the exported `decodeTinyFishPage`; the private `finalUrl` helper, used by both decoders.
- `src/web/providers/tinyfish.ts`: `FETCH_URL` and the 110000 cap constant; the new `fetch` method; the `decodeTinyFishPage` import. `search` is unchanged.
- `src/web/providers/catalog.ts`: TinyFish's `fetchFormats`.

## Tests

- `src/web/providers/tinyfish.test.ts` gains a `describe` block for `fetch`, with a stubbed `fetch` and a `WebFetchRequest` constant of `{ url: 'https://example.com/page', format: 'markdown', timeoutMs: 30_000 }`. The existing `recordingFetcher` answers `{ results: [] }`, which a fetch decodes as `invalid response`, so add a fetch recorder beside it that records the call the same way and answers a one-page body. Because subplan 2 declares the provider with `satisfies`, `provider.fetch(…)` is called directly, with no optional call:
  - the request goes to origin `https://api.fetch.tinyfish.ai` with path `/` as `POST` with `X-API-Key: test-key` and `Content-Type: application/json`, and its body equals exactly `{ urls: ['https://example.com/page'], format: 'markdown', ttl: 0, per_url_timeout_ms: 30000 }`;
  - `--format html` sends `format: 'html'`;
  - a 120-second request sends `per_url_timeout_ms: 110000`;
  - a `TimeoutError` thrown by the stub for a 120-second request reports `timed out after 120 s`, which proves `requestJson` received the full timeout rather than the cap;
  - `results[0].text` and `results[0].final_url` come back as `{ url, content }`;
  - the final URL falls back to the requested one when `final_url` is missing, and when it's an empty string;
  - an empty-string `text` comes back as empty content, not a miss;
  - `errors[0].error` of `bot_blocked` gives `could not fetch: bot_blocked`;
  - a `results[0]` whose `text` is `null` beside `errors[0].error` of `bot_blocked` gives `could not fetch: bot_blocked`, which pins the order;
  - `invalid response` for `{}`, for `{ results: [], errors: [] }`, for a body that is a JSON array, and for a `results[0]` whose `text` is an object with no `errors`;
  - an HTTP 401 reports `HTTP 401 Unauthorized`;
  - a prompt abort is rethrown unchanged, as the search abort test (today `tinyfish.test.ts:96`) checks.
  Every existing search case passes unedited, including "reports a timeout" with `timed out after 30 s`.
- `src/web/providers/registry.test.ts`, in the `describe('the real web search provider catalog', …)` block:
  - subplan 8's assertion that TinyFish declares no `fetchFormats` changes. TinyFish now declares `['markdown', 'html']`, and Tavily still declares `['markdown', 'text']`;
  - a registry built with `createProviderRegistry` over the real catalog lists `['tavily', 'tinyfish']` from `fetchProviderNames()`;
  - with both tokens present, its `resolveFetchAttempts('auto', 'html', …)` returns the TinyFish manifest alone, because Tavily doesn't serve `html`.
- Every `tavily.test.ts` case passes unedited, which pins `decodeTavilyPage` after the `finalUrl` extraction.

## Documentation

None here. No user-visible behavior changes, so no spec moves. `documentation/developer-documentation/web-search-providers.md` describes no per-provider request details, and subplan 12 documents the fetch half of the provider contract there.

## Out of scope

- The `local` provider (subplans 10 through 12).
- Following redirects or converting content, which TinyFish handles itself.
- TinyFish's `json` format, CSS selectors, conditional requests, highlights, and any other fetch option.
- Any caller of `fetch`: the fallback loop and rendering (subplans 14 and 15) and every user-facing route (subplan 21 onward).

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/web` so the registry and fixture suites run even where `--changed` would skip them. There is no manual fetch check yet, because nothing calls a provider's `fetch` from a tab until subplan 21. In a shell tab with a TinyFish token, `web search vitest` and `web search vitest --provider tinyfish` print what they printed before.
