# Web fetch 8 — Tavily fetch

**Complexity: 6/10** — ~60 added lines, 2 files edited plus the new fetch decoder, 13 requirements, 17 test scenarios (p=5.92)

Run order: 8 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "Tavily fetch" bullet under "Provider contract, registry, and catalog", the Tavily sentence of "Provider request details", the Tavily formats in "Provider contract", the Tavily half of "Provider-reported misses", and the Tavily sentence of "`--timeout`"). Depends on these earlier subplans:

- `product/plans/ready/web-fetch-1-rename-web-directory.md`, for the `src/web/providers/` layout;
- `product/plans/ready/web-fetch-2-provider-capability-declarations.md`, for `fetchFormats`, `WebFetchRequest`, `WebFetchPage`, the optional `fetch` on `WebSearchProvider`, `search: true` on `tavilyManifest`, and `tavily.ts`'s switch to `satisfies WebSearchProvider`;
- `product/plans/ready/web-fetch-7-attempt-timeout.md`, for the required `timeoutMs` fourth parameter of `requestJson` and its `timed out after <s> s` reason.

Subplans 3 to 6 don't touch any file this plan edits. They matter once Tavily declares formats: subplan 4's resolution then counts Tavily as fetch-capable, and subplan 6's `runFetchAttempt` is what calls its `fetch` and validates the page it returns.

Tavily already searches. This plan teaches it to fetch one page through its extract API, and declares the formats it serves. It is the first provider an `auto` fetch tries. TinyFish follows in subplan 9. Nothing user-facing calls fetch yet.

Paths below are the post-rename ones. Today the module is `src/web-search/providers/tavily.ts` (24 lines; `SEARCH_URL` at `:5`, the `requestJson` call at `:9`), the catalog is `src/web-search/providers/catalog.ts` (`tavilyManifest` at `:4`), and the search decoder is `src/web-search/providers/decode.ts` (`decodeResults` at `:4`). Grep for the quoted identifier rather than trusting a line number.

## Design decisions

- **Formats (source plan, Provider contract).** `tavilyManifest` in `src/web/providers/catalog.ts` declares `fetchFormats: ['markdown', 'text']`, beside subplan 2's `search: true` and its token. The manifest keeps `as const satisfies WebSearchProviderManifest`; subplan 2 typed the field `readonly`, so the tuple fits.
- **Request (source plan, Tavily fetch and Provider request details).** The fetch is `POST https://api.tavily.com/extract`, with the same `Authorization: Bearer <key>` and `Content-Type: application/json` headers as search. The JSON body holds exactly four fields:
  - `urls`: a one-element array holding `request.url` unchanged;
  - `format`: `request.format`, which resolution only ever passes as `markdown` or `text` for Tavily;
  - `extract_depth`: `'basic'`, matching search's default depth;
  - `timeout`: the smaller of `request.timeoutMs / 1000` and 60, sent as a JSON number, because Tavily's extract API accepts at most 60 seconds. Every `timeoutMs` the core passes is a whole number of seconds from 1 to 120 (subplans 7, 13, and 15), so the value is a whole number from 1 to 60 and needs no rounding.
- **The core still waits the full timeout (source plan, `--timeout`).** `fetch` passes `request.timeoutMs`, not the capped value, as `requestJson`'s fourth argument. So a 120-second request is sent `timeout: 60` while the helper waits up to 120 seconds, and a timeout reads `timed out after 120 s`.
- **One request builder, not two.** Search and fetch would otherwise carry the same `requestJson` call with the same method and headers, a clone `npm run duplication` reports (`.jscpd.json`: 5 lines and 50 tokens). Move the call into a private module function in `tavily.ts`, `postJson(capability, url, payload, timeoutMs)`. It calls `requestJson` with `method: 'POST'`, the two headers above, and `JSON.stringify(payload)` as the body. `search` calls it with `SEARCH_URL`, its unchanged four-field payload, and `PROVIDER_TIMEOUT_MS` (subplan 7's import). `fetch` calls it with a new `EXTRACT_URL` constant, the four-field payload above, and `request.timeoutMs`. The 60-second cap is a named module constant, not a bare literal. Search's request stays byte-identical, which its existing tests pin.
- **Response (source plan, Tavily fetch and Provider-reported misses).** A new exported `decodeTavilyPage(body, requestedUrl)` returns a `WebFetchPage` or throws. It reads the parsed body in this order:
  1. If `results[0]` is a record whose `raw_content` is a string, that string is the content. An empty string is content too: it's the empty-page answer (subplan 14 prints `(empty page)`), so it never falls back. The final URL is `results[0].url` when that's a non-empty string, and `requestedUrl` otherwise.
  2. Otherwise, if `failed_results[0]` is a record whose `error` is a string, throw `ProviderRequestError` with `could not fetch: <first line of that error>`, built by the helper below.
  3. Otherwise, throw `ProviderRequestError('invalid response')`. That covers a body that isn't an object, a missing or empty `results` with no usable failure, and a `results[0]` whose `raw_content` isn't a string (`null`, a number, or absent) when `failed_results` has nothing usable.
  Every miss throws `ProviderRequestError`, so subplan 6's runner records `failed` and `auto` falls back. Nothing in this decoder disables the provider.
- **Reading the first element.** `requestJson` returns `unknown`. Check `body` with `isRecord` and `body.results` with `Array.isArray`, then pass `body.results[0]` straight into `isRecord` without assigning it first. An element of a narrowed `any[]` is `any`, so assigning it to a local fails `@typescript-eslint/no-unsafe-assignment`. A small private helper, `firstRecord(value: unknown)`, does this once for both `results` and `failed_results` and returns the record or `undefined`. Fields are then read through the narrowed record, as `decodeResults` in `src/web/providers/decode.ts` does.
- **The miss reason has one definition.** `decode-fetch.ts` also exports `couldNotFetch(error: string)`, which returns a `ProviderRequestError` whose reason is `could not fetch: ` followed by `firstLine` of the error text. `firstLine` is the provider layer's existing first-line helper in `src/models/providers/result.ts`, which `http.ts` already uses for network errors. Don't write a new first-line function. `firstLine` cuts at the first `\n` or `\r\n`, trims, and drops trailing `.`, `!`, and `?`, so the printed `Web fetch failed (tavily): could not fetch: <error>.` never ends in two periods. An empty or blank error string gives `could not fetch: provider request failed`, `firstLine`'s own fallback. Subplan 9 reuses `couldNotFetch` for TinyFish's `errors[0].error`.
- **Decoder home.** `decodeTavilyPage`, `couldNotFetch`, and `firstRecord` live in a new `src/web/providers/decode-fetch.ts`, which keeps `tavily.ts` a thin request builder. It imports `isRecord` from `../../value-guards.js`, `firstLine` from `../../models/providers/result.js`, `ProviderRequestError` from `./contract.js`, and `WebFetchPage` type-only from `./contract.js`. Subplan 9 adds its TinyFish decoder to the same file.
- **Failures the decoder never sees.** An HTTP error status, a timeout, a network error, an undecodable body, and an abort are all raised by `requestJson` before the decoder runs (subplan 7). `fetch` adds no `try`/`catch`, so an abort reaches the runner untouched and disables nothing.
- **Redirects.** Tavily follows redirects itself, so `fetch` never returns subplan 2's `{ redirectedTo }`.
- **File sizes.** `tavily.ts` grows from 24 lines to about 45, and `decode-fetch.ts` is about 35. Both stay far under the 200-line limit.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| JSON request helper | `requestJson` in `src/web/providers/http.ts` (per-attempt `timeoutMs` from subplan 7) | Sends the request; raises HTTP, timeout, network, invalid-JSON, and abort failures |
| Tavily module | `provider` and `SEARCH_URL` in `src/web/providers/tavily.ts` | Gains `fetch` beside `search`, both through `postJson` |
| Search timeout | `PROVIDER_TIMEOUT_MS` in `src/models/providers/result.ts` (passed by `search` since subplan 7) | Unchanged search timeout |
| First-line helper | `firstLine` in `src/models/providers/result.ts` | The `could not fetch:` reason |
| Decoder pattern | `decodeResults` in `src/web/providers/decode.ts` | Model for reading fields through `isRecord` |
| Record guard | `isRecord` in `src/value-guards.ts` | Field access |
| Fetch types | `WebFetchRequest`, `WebFetchPage` in `src/web/providers/contract.ts` (subplan 2) | Request and result |
| Expected-failure type | `ProviderRequestError` in `src/web/providers/contract.ts` | Every miss |

## Proposed changes

These land together.

- `src/web/providers/decode-fetch.ts` (new): `decodeTavilyPage`, `couldNotFetch`, and the private `firstRecord`.
- `src/web/providers/tavily.ts`: `EXTRACT_URL` and the 60-second cap constant; the private `postJson`; `search` rewritten to call it with its payload unchanged; the new `fetch` method, which calls `postJson` and returns `decodeTavilyPage(body, request.url)`. Import `decodeTavilyPage` from `./decode-fetch.js`.
- `src/web/providers/catalog.ts`: Tavily's `fetchFormats`.

## Tests

- `src/web/providers/tavily.test.ts` gains a `describe` block for `fetch`, with a stubbed `fetch` and a `WebFetchRequest` constant of `{ url: 'https://example.com/page', format: 'markdown', timeoutMs: 30_000 }`. Because subplan 2 declares the provider with `satisfies`, `provider.fetch(…)` is called directly, with no optional call:
  - the request goes to `https://api.tavily.com/extract` as `POST` with `Authorization: Bearer test-key` and `Content-Type: application/json`, and its body equals exactly `{ urls: ['https://example.com/page'], format: 'markdown', extract_depth: 'basic', timeout: 30 }`;
  - `--format text` sends `format: 'text'`;
  - a 120-second request sends `timeout: 60`, and a 45-second request sends `timeout: 45`;
  - a `TimeoutError` thrown by the stub for a 120-second request reports `timed out after 120 s`, which proves `requestJson` received the full timeout rather than the cap;
  - `results[0].raw_content` and `results[0].url` come back as `{ url, content }`;
  - the final URL falls back to the requested one when `results[0].url` is missing, and when it's an empty string;
  - an empty-string `raw_content` comes back as empty content, not a miss;
  - `failed_results[0].error` of `Failed to fetch url.\nstack line` gives `could not fetch: Failed to fetch url`;
  - an empty `failed_results[0].error` gives `could not fetch: provider request failed`;
  - `invalid response` for `{ results: [], failed_results: [] }`, for a body that is a JSON array, and for a `results[0]` whose `raw_content` is `null`;
  - an HTTP 401 reports `HTTP 401 Unauthorized`;
  - a prompt abort is rethrown unchanged, as the search abort test (today `tavily.test.ts:125`) checks.
  Every existing search case passes unedited, which pins search's request after the `postJson` extraction.
- `src/web/providers/registry.test.ts`, in the `describe('the real web search provider catalog', …)` block: subplan 2's assertion that neither bundled provider declares `fetchFormats` changes. Tavily now declares `['markdown', 'text']`, and TinyFish still declares none until subplan 9.

## Documentation

None here. No user-visible behavior changes, so no spec moves. Subplan 12 documents the fetch half of the provider contract in `documentation/developer-documentation/web-search-providers.md`, which describes no per-provider request details.

## Out of scope

- TinyFish fetch (subplan 9) and the `local` provider (subplans 10 through 12).
- Following redirects or converting content; Tavily handles both itself.
- Any caller of `fetch`: the fallback loop and rendering (subplans 14 and 15) and every user-facing route (subplan 21 onward).
- Tavily's `advanced` extract depth, images, or any other extract option.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/web` so the registry and fixture suites run even where `--changed` would skip them. There is no manual fetch check yet, because nothing calls a provider's `fetch` from a tab until subplan 21. In a shell tab with a Tavily token, `web search vitest` and `web search vitest --provider tavily` print what they printed before.
