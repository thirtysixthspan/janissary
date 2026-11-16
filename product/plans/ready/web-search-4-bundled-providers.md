# Web search 4: the shared provider request step and the bundled Tavily and TinyFish providers

**Complexity: 6/10** — ~120 added lines, 15 requirements, 24 test scenarios across four new modules, no existing files edited (p=5.81)

The fourth slice of the `web search` feature (source plan: `./product/plans/complete/web-search.md`). It adds the two bundled provider modules and the request and decoding steps they share. Each provider implements the `WebSearchProvider` contract from `./product/plans/ready/web-search-2-result-rendering.md`: it receives the normalized request and a narrow capability (`apiKey`, `fetch`, optional `signal`), sends exactly one HTTP request, and returns a flat `{ title, url, snippet }` list in the provider's own order, or throws a `ProviderRequestError` carrying the failure reason. The modules are not yet listed in a catalog or reachable from any command; the registry (`./product/plans/ready/web-search-5-provider-registry.md`) imports them lazily.

## Dependencies

- `./product/plans/ready/web-search-2-result-rendering.md` — `WebSearchProvider`, `WebSearchProviderModule`, `WebSearchRequest`, `WebSearchResult`, `WebSearchCapability`, `ProviderRequestError`, all from `src/web-search/contract.ts`. That slice (and slice 1, which creates `src/web-search/command.ts` with `WebSearchDepth`, which the contract imports as a type) must land first.
- No dependency on slice 3: providers receive their key through the capability and never name a token row.

## Design decisions

Carried verbatim from the source plan where they apply.

- **Shared request step.** `providers/http.ts` joins the capability's `signal` with `AbortSignal.timeout(PROVIDER_TIMEOUT_MS)` (`src/models/providers/result.ts`), calls `capability.fetch`, turns a non-2xx response into a `ProviderRequestError` of `HTTP <status> <status text>`, a timeout (`isTimeout`) into `timed out after 30 s`, any other rejection into its `firstLine`, and a body that is not JSON into `invalid response`. An abort from the prompt's signal is rethrown as an abort, not a failure, so cancellation never falls back.
- **Failure reasons (user decision).** A reason is `HTTP <status> <status text>` (just `HTTP <status>` when the text is empty), `timed out after <n> s`, `invalid response`, or the first line of the network error.
- **Timeout (user decision).** Each provider attempt may take 30 seconds, reusing `PROVIDER_TIMEOUT_MS` from `src/models/providers/result.ts`; its failure reason is `timed out after 30 s`.
- **Joining the signals (decision).** When the capability has a `signal`, the request signal is `AbortSignal.any([capability.signal, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)])`, as `fetchAnthropicModels` does at `src/models/providers/anthropic.ts` (`AbortSignal.any([refreshSignal, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)])`). When `signal` is undefined (a typed search), the timeout signal is used alone. The joined signal is passed as `init.signal` to `capability.fetch`, so the caller's `init` never carries its own signal.
- **Telling an abort from a timeout.** The joined signal fires for both. The step decides by asking whether the capability's own `signal` is aborted: if so, the rejection is rethrown unchanged (it is normally `signal.reason`), not wrapped; otherwise a timeout is classified with `isTimeout` as above. This check runs first, before `isTimeout`, so a timeout that races a cancel is still an abort. Later slices rely on this: the registry (slice 5) classifies an attempt as an abort by the capability's `signal.aborted`, never by the error's shape.
- **Reading the body (decision).** On a 2xx response the step reads `response.text()` and then parses it with `JSON.parse`, rather than calling `response.json()`, so the two failures stay apart: a rejection from `text()` (the body stream cut by the timeout, an abort, or the network) goes through the same abort/timeout/`firstLine` classification as a `fetch` rejection, and only a `JSON.parse` throw (an empty body included) is `invalid response`. A non-2xx response's body is not read: the reason is the status line only.
- **Status line (decision).** The reason is `HTTP ${status} ${statusText}` with the trailing space trimmed when `statusText` is empty. Note the prefix: `anthropic.ts` builds `${status} ${statusText}` without `HTTP`, so model the check on it but not the wording.
- **Error lines (decision).** Use `firstLine` and `isTimeout` from `src/models/providers/result.ts`, not `errorFirstLine` from `src/error-text.ts`: they are the provider-fetcher pair the timeout reuse already names, and `firstLine` falls back to `provider request failed` for an empty message. The timeout reason is the literal `timed out after 30 s`, as `commandFailure` in `result.ts` writes it.
- **Tavily.** `POST https://api.tavily.com/search` with `Authorization: Bearer <apiKey>` and body `query`, `max_results` (= `numResults`), `search_depth` (= `depth`), `topic: "general"`. Decodes `results[]` into `{ title, url, snippet: content }`, refusing a body without a `results` array as `invalid response`; entries missing a string `url` are skipped. The body is `JSON.stringify` of exactly those four fields, sent with `Content-Type: application/json`.
- **TinyFish.** `GET https://api.search.tinyfish.ai?query=<query>` with `X-API-Key: <apiKey>`; ignores `depth`. Decodes `results[]` into `{ title, url, snippet }` in returned order with the same refusal rule. The URL is built with `new URL('https://api.search.tinyfish.ai')` and `searchParams.set('query', …)`, which serializes as `https://api.search.tinyfish.ai/?query=…` (WHATWG adds the `/` path); tests compare the parsed URL's origin, pathname `/`, and search params rather than a literal string.
- **Order (decision).** Both providers keep the array order the API returned. TinyFish's `position` field is ignored, not used to sort; Tavily's `score` is ignored.
- **Search depth (user decision).** Tavily sends `search_depth: "basic"` (1 credit) or `"advanced"` (2 credits); TinyFish has no depth option and ignores it.
- **Provider request options (user decision).** Beyond depth, the bundled providers send their cheapest defaults and nothing else: Tavily `topic: "general"` and `max_results` equal to `--results`, with no answer, raw content, or images; TinyFish only `query`, so it defaults to US/English web results, page 0.
- **Result count (user decision).** Each provider attempt is exactly one HTTP request. TinyFish, which has no count parameter, returns its first page; the core cuts it to the count later. Neither provider trims its own result list to `numResults`.
- **Domain filtering (user decision).** Nothing configures domain filtering, so neither provider sends `include_domains` or `exclude_domains`. `site:` and `-site:` operators in the query text pass through unchanged.
- **Query length (user decision).** No provider caps the query; a provider's own refusal (Tavily over 400 characters, TinyFish over 2000) comes back as its HTTP 400 failure.
- **Decoding without trusting the shape.** A non-string `title` or `content`/`snippet` decodes as an empty string rather than throwing, so normalizing (empty title → URL) handles it later. An entry that is not an object, or has no string `url`, is skipped. Only a body that is not an object with a `results` array is `invalid response`. Decoding does no whitespace, escaping, or URL validation: that is `normalizeResults` in `src/web-search/render.ts` (slice 2), run by the core.
- **Shared decoder (decision).** Because both providers decode the same envelope and differ only in the snippet field's name (`content` for Tavily, `snippet` for TinyFish), one helper does it, so the two modules carry no duplicated decode loop for `sonarjs` or the duplication check in `npm run check` to flag.
- **Provider capability (from `ai/guidelines/plugins.md` §1).** A provider never reads token files, `Managers`, `process.env`, or any other host state; the injected `fetch` is what lets tests run with no live network. It never falls back to the global `fetch`.
- **No module side effects (`ai/guidelines/plugins.md` §6).** Each provider module only declares its provider; nothing runs at import.
- **Module shape (from slice 2).** Each provider module's one export is `provider`, a `WebSearchProvider`, so the module satisfies `WebSearchProviderModule` and `() => import('./tavily.js')` in the slice 5 catalog needs no adapter. Type the constant against `WebSearchProvider` so a drift from the contract fails typecheck in this slice.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this slice uses it |
| --- | --- | --- |
| Provider fetch helpers | `src/models/providers/result.ts` (`PROVIDER_TIMEOUT_MS` = `30_000`, `isTimeout`, `firstLine`) | Imported by `http.ts` for the budget and the reason text. `isTimeout` already returns `false` for an `AbortError`, so it cannot misread a cancel. |
| HTTP provider fetcher | `src/models/providers/anthropic.ts` (`fetchAnthropicModels`, `decodePage`) | Model for an injected `fetcher`, `AbortSignal.any` with a timeout, the `response.ok` check, and decoding `unknown` without trusting the shape. |
| Fetcher tests | `src/models/providers/anthropic.test.ts` | Pattern for a fake `fetch` typed `typeof fetch` that records its `(url, init)` calls, and for a timeout: a fetch that throws `new DOMException('deadline', 'TimeoutError')` (no fake timers). |
| Object guard | `src/value-guards.ts` (`isRecord`) | The "is a JSON object" check in the decoder; do not add another local `isObject`. |
| Tavily search API | `POST https://api.tavily.com/search`, `Authorization: Bearer <key>` | Body `query`, `max_results` (0–20, default 10); results carry `title`, `url`, `content` (snippet), `score`. |
| TinyFish search API | `GET https://api.search.tinyfish.ai`, `X-API-Key: <key>` | Param `query` (≤ 2000 chars); results carry `position`, `title`, `snippet`, `url`, `site_name`. No result-count parameter. |

## Proposed changes

All new files under `src/web-search/providers/`; relative imports carry `.js` (`../contract.js`, `../../models/providers/result.js`, `../../value-guards.js`). No existing file is edited.

- **`src/web-search/providers/http.ts`** (new) — exports `requestJson(capability, url, init)`, where `url` is a `string | URL` and `init` is the method, headers, and optional body (no signal). It performs the shared step above and resolves to the parsed body as `unknown`, or rejects with a `ProviderRequestError` or the unchanged abort. About 35 counted lines.
- **`src/web-search/providers/decode.ts`** (new) — exports `decodeResults(body, snippetKey)`, which applies the decoding rules above and returns `WebSearchResult[]`, throwing `ProviderRequestError('invalid response')` when `body` is not an object with a `results` array. About 20 counted lines.
- **`src/web-search/providers/tavily.ts`** (new) — exports `provider`: its `search` builds the POST body and headers, calls `requestJson`, and returns `decodeResults(body, 'content')`.
- **`src/web-search/providers/tinyfish.ts`** (new) — exports `provider`: its `search` builds the GET URL (`query` only), calls `requestJson` with the `X-API-Key` header and no body, and returns `decodeResults(body, 'snippet')`.

Every export is imported by a test below until slice 5's catalog consumes the provider modules, which keeps `knip` from reporting unused exports. Each file stays far under the 200-line `max-lines` limit.

## Tests

Vitest `server` project, colocated, each with a fake `fetch` as in `src/models/providers/anthropic.test.ts`; no test touches the network.

- **`src/web-search/providers/http.test.ts`** (new):
  - A 2xx JSON body resolves to the parsed value; `fetch` receives the given method, headers, and body, plus an `AbortSignal`.
  - Non-2xx gives a `ProviderRequestError` with message `HTTP 429 Too Many Requests`, and `HTTP 500` when the status text is empty; the body is not read.
  - A fetch that throws a `TimeoutError` `DOMException` gives `timed out after 30 s`.
  - A network rejection (`new TypeError('fetch failed\ncause: ECONNRESET')`) gives its first line, `fetch failed`.
  - A non-JSON body and an empty body each give `invalid response`; a `text()` that rejects with a `TimeoutError` gives `timed out after 30 s`, not `invalid response`.
  - An abort from the capability's signal is rethrown as the original rejection, not a `ProviderRequestError`, including when the rejection is a `TimeoutError` (abort wins).
  - Aborting the capability's signal aborts the signal `fetch` received; with no capability signal, `fetch` still receives a signal.
- **`src/web-search/providers/decode.test.ts`** (new) — maps the named snippet key to `snippet` in order; a non-string title or snippet becomes `''`; entries that are not objects or lack a string `url` are skipped; a body that is not an object, or lacks a `results` array, is `invalid response`; an empty `results` array gives `[]`.
- **`src/web-search/providers/tavily.test.ts`** (new) — URL, `POST`, `Authorization: Bearer <key>`, `Content-Type: application/json`, body exactly `query`, `max_results`, `search_depth`, `topic: "general"` (no domain, answer, raw content, or image fields); `depth: 'advanced'` maps to `search_depth: "advanced"`; decoding maps `content` to `snippet` in order; a body without `results` is `invalid response`; an entry without a string `url` is skipped; a `site:` query is sent unchanged; a 401 gives `HTTP 401 Unauthorized`; a timeout gives `timed out after 30 s`; a prompt abort is rethrown as an abort.
- **`src/web-search/providers/tinyfish.test.ts`** (new) — origin `https://api.search.tinyfish.ai`, pathname `/`, search params only `query`; `GET` with no body; `X-API-Key: <key>`; the request is identical for `depth: 'basic'` and `'advanced'`; decoding keeps returned order even when `position` disagrees; a body without `results` is `invalid response`; a 400 gives `HTTP 400 Bad Request`; a timeout gives `timed out after 30 s`; a prompt abort is rethrown as an abort.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- No manual end-to-end check: nothing reaches these modules from a command until `./product/plans/ready/web-search-10-typed-command.md`, whose manual check exercises a live Tavily search.

## Out of scope

- The catalog, manifests, lazy activation, version checks, and disabling (`./product/plans/ready/web-search-5-provider-registry.md`).
- Fallback between providers, failure-line formatting, and cutting to `--results` (`./product/plans/ready/web-search-6-search-core.md`).
- Normalizing, deduping, and rendering results (`./product/plans/ready/web-search-2-result-rendering.md`).
- Paging a provider to reach `--results`; provider options beyond `--depth` (topics, locations, languages, dates, answers, raw content, images); configured domain filtering (user decisions).
