# Web fetch 11 — the `local` provider module, single request

**Complexity: 6/10** — ~80 added lines in 1 new module plus 1 edited file, 15 requirements, 18 test scenarios (p=5.92)

Run order: 11 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "Transport", "No conversion", "Decoding and status", "Reachable hosts", and "Request headers" decisions under "The `local` provider", the "`--timeout`" decision, and the "`local` fetch" bullet under "Provider contract, registry, and catalog"). Depends on these earlier subplans:

- `product/plans/ready/web-fetch-1-rename-web-directory.md`, for the `src/web/providers/` home;
- `product/plans/ready/web-fetch-2-provider-capability-declarations.md`, for `WebFetchRequest`, `WebFetchPage`, the optional `fetch` on `WebSearchProvider`, and the `satisfies WebSearchProvider` declaration style;
- `product/plans/ready/web-fetch-7-attempt-timeout.md`, for `attemptSignal(capability, timeoutMs)` and `classifyRequestError(signal, error, timeoutMs)` in `src/web/providers/http.ts`;
- `product/plans/ready/web-fetch-10-local-fetch-helpers.md`, for `upgradedUrl`, `acceptedContentType`, and `decodeBody` in `local-rules.ts`, and `readCappedBody` and `LOCAL_MAX_BODY_BYTES` in `local-body.ts`.

It doesn't depend on subplans 3 to 6, 8, or 9 and touches none of their files. Subplan 6's `runFetchAttempt` is what later calls this module and turns its throws into outcomes.

When every hosted provider fails, or when asked with `--provider local`, a fetch connects directly from the machine that owns the tab. The source plan makes that direct fetch a bundled provider plugin named `local`. This plan adds the provider module for one request and response: transport, browser headers, timeout and abort, status handling, and the body path. Subplan 12 adds redirect handling and the catalog entry. Until then the module is reachable only from its tests.

Paths below are the post-rename ones. At today's baseline the HTTP helper is `src/web-search/providers/http.ts`, whose signal expression (`:11`–`13`) and `classify` (`:47`) subplan 7 turns into `attemptSignal` and `classifyRequestError`. `src/user-agent.ts` doesn't move. Grep for the quoted identifier rather than trusting a line number.

## Design decisions

- **Factory for tests.** `src/web/providers/local.ts` exports `createLocalProvider({ profile })`, where `profile` is a function returning a `BrowserProfile`. It returns an object literal holding only `fetch`, checked with `satisfies WebSearchProvider` as `tavily.ts` and `tinyfish.ts` are since subplan 2, so `fetch` stays required on the result and tests call `provider.fetch(…)` with no optional call. The module also exports `provider`, which is that factory called with `() => randomBrowserProfile(DEFAULT_CHROME_MAJOR)` from `src/user-agent.ts`. `DEFAULT_CHROME_MAJOR` is used because no Chromium engine is running to pin the version. Tests inject a fixed profile and never depend on `Math.random`. The module implements only `fetch`, never `search`. Building `provider` at module top level only creates a closure, so it opens nothing (`ai/guidelines/plugins.md` §6).
- **Imports.** `local.ts` imports `ProviderRequestError` and, type-only, `WebFetchRequest`, `WebFetchPage`, `WebSearchCapability`, and `WebSearchProvider` from `./contract.js`; `attemptSignal` and `classifyRequestError` from `./http.js`; the three rules from `./local-rules.js`; the body reader from `./local-body.js`; and the profile helpers from `../../user-agent.js`.
- **Transport (source plan, Transport).** The provider calls `capability.fetch`, never the global `fetch` directly; subplan 15's core hands it the global one. It sends exactly one request per call in this plan. The request goes to the URL's `href` string, and its init holds exactly four fields: `method: 'GET'`, `redirect: 'manual'`, the headers below, and the attempt signal below. There is no `body` and no `credentials` option. Node's `fetch` has no cookie jar, so no cookies are sent or kept. There are no address checks before connecting (source plan, Reachable hosts).
- **The requested URL.** The request goes to `upgradedUrl(new URL(request.url))` from `src/web/providers/local-rules.ts`. No `try` guards the `new URL`: the parser (subplan 13) and the remote boundary (subplan 18) both admit only an absolute `http:` or `https:` URL that `URL.canParse` accepts. Userinfo in the URL is not stripped. Node's `fetch` refuses such a URL with a `TypeError` (`Request cannot be constructed from a URL that includes credentials: …`), and that's classified as a network error below, so it falls back like any other.
- **Headers (source plan, Request headers).** Each call to `fetch` calls `profile()` exactly once and builds one header record from it, in a private `browserHeaders(profile)`. It holds four headers:
  - `User-Agent`, set to the profile's `userAgent`;
  - `Sec-CH-UA-Platform`, set to the profile's `platform` in double quotes, for example `"macOS"`;
  - `Accept-Language`, from `acceptLanguage(profile.locale)`, so `en-GB` gives `en-GB,en;q=0.9`;
  - `Accept`, set to the module constant `text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`.
  The first three are built exactly as `openWindow` in `src/browser/index.ts:94`–`97` builds its `extraHTTPHeaders`. Subplan 12's later hops reuse this one record, so every hop sends the same headers. Node's `fetch` passes `Sec-CH-UA-Platform` and `User-Agent` through unchanged; it adds its own `Accept-Encoding` and `Sec-Fetch-Mode`, which this plan leaves alone.
- **Timeout and abort (source plan, `--timeout`).** One signal covers the whole attempt, every request and the body read included. Build it once per call with `attemptSignal(capability, request.timeoutMs)`, and pass it to every request. Node's `fetch` errors the response body stream with that signal's reason when it fires mid-read, so the body read needs no second signal. In `http.ts`, add `export` to `attemptSignal` and `classifyRequestError` and change nothing else; `requestJson`, `send`, and `readText` keep calling them as before. Don't write a second copy. Two steps are classified:
  - a rejection from `capability.fetch` becomes `throw classifyRequestError(capability.signal, error, request.timeoutMs)`;
  - a rejection from the body read is thrown unchanged when it's already a `ProviderRequestError` (the cap reason from `readCappedBody`), and otherwise goes through the same call.
  Pass `capability.signal` to the classifier, never the attempt signal. The attempt signal is aborted by the timeout too, so passing it would turn every timeout into a pass-through abort (subplan 7). The classifier handles three cases:
  - an error after the caller's abort is rethrown unchanged, so the runner reports `aborted` and disables nothing;
  - a timeout becomes `ProviderRequestError('timed out after <s> s')`, where `<s>` is `request.timeoutMs / 1000`;
  - a network error becomes `ProviderRequestError` with its first line, such as `fetch failed`.
- **Status (source plan, Decoding and status).** These are the response branches, checked in this order:
  - **Not 2xx** (`response.ok` is false). Discard the body, then throw `ProviderRequestError` with `HTTP <status> <status text>`, trimmed to `HTTP <status>` when the text is empty. That's the same text `requestJson` builds, `` `HTTP ${response.status} ${response.statusText}`.trim() ``.
  - **3xx.** This plan treats a 3xx the same way, so a 302 fails with `HTTP 302 Found` and nothing follows it. Subplan 12 adds a redirect branch ahead of this one for a 3xx with a `Location` header.
  - **2xx.** First call `acceptedContentType(response.headers.get('content-type'))`, before reading anything. When it throws, discard the body and rethrow its `ProviderRequestError` unchanged. Then read with `readCappedBody(response, LOCAL_MAX_BODY_BYTES)` and decode the bytes with `decodeBody(bytes, response.headers.get('content-type'))`. Return the `WebFetchPage` `{ url, content }`.
- **The answering URL.** The page's `url` is the `href` of the URL this call requested, after the upgrade. Never read `response.url`: a stubbed `new Response(…)` has an empty `url`. So `https://example.com` is reported as `https://example.com/`, and `http://example.com` as `https://example.com/`. Subplan 12 reports the last hop's URL the same way.
- **Discarding a body.** A private `discardBody(response)` awaits `response.body?.cancel()` and swallows a rejection from it, as `readCappedBody` does for its own cancels (subplan 10), so the failure reason always wins. It releases the connection instead of leaving an unread body until the timeout fires. Subplan 12 reuses it for redirect responses.
- **Raw body (source plan, No conversion).** The content is the body exactly as received, decoded to text, whatever `--format` asked for. `fetch` never reads `request.format`. An empty 2xx body of an accepted type is an empty `content` string, which is an answer (subplan 2). No HTML parser or converter is added.
- **Expected failures fall back (source plan, `local` fetch).** Every failure above is a `ProviderRequestError`, so subplan 6's runner records `failed` and never disables `local` for it. Only an unexpected throw, a plugin failure, disables it.
- **File size.** `local.ts` holds only the request and response flow, about 75 counted lines. The pure rules already live in `local-rules.ts` and `local-body.ts`. Subplan 12 grows it with the redirect loop and owns any further split.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Upgrade, content-type, charset rules | `upgradedUrl`, `acceptedContentType`, `decodeBody` in `src/web/providers/local-rules.ts` (subplan 10) | Applied to the request and response |
| Capped body reader | `readCappedBody`, `LOCAL_MAX_BODY_BYTES` in `src/web/providers/local-body.ts` (subplan 10) | The 50 MB cap; its read errors propagate unwrapped for this module to classify |
| Attempt signal and classification | `attemptSignal`, `classifyRequestError` in `src/web/providers/http.ts` (subplan 7) | Exported and reused |
| HTTP status text | `requestJson` in `src/web/providers/http.ts` | The `HTTP <status> <status text>` form copied exactly |
| Expected-failure type | `ProviderRequestError` in `src/web/providers/contract.ts` | Every refusal |
| Browser profile | `randomBrowserProfile`, `acceptLanguage`, `DEFAULT_CHROME_MAJOR`, `BrowserProfile` in `src/user-agent.ts` | Headers |
| Header precedent | `extraHTTPHeaders` in `openWindow`, `src/browser/index.ts:88`–`97` | The quoted platform and `Accept-Language` form |
| Provider declaration | `export const provider = { … } satisfies WebSearchProvider` in `src/web/providers/tavily.ts` (subplan 2) | The shape `createLocalProvider` returns |
| Real-timer timeout tests | the 10 ms cases in `src/web/providers/http.test.ts` (subplan 7) | The pattern for this plan's timeout cases |

## Proposed changes

These land together.

- `src/web/providers/local.ts` (new): `createLocalProvider`, `provider`, the `Accept` constant, and the private `browserHeaders` and `discardBody`.
- `src/web/providers/http.ts`: add `export` to `attemptSignal` and `classifyRequestError`, unchanged.

## Tests

`src/web/providers/local.test.ts` (new) uses a stubbed `fetch` that records each call's URL string and init, and a profile stub that returns a fixed `BrowserProfile` (platform `macOS`, locale `en-GB`) and counts its calls. Its request constant is `{ url: 'https://example.com/page', format: 'markdown', timeoutMs: 30_000 }`. Responses are `new Response(…)` with explicit headers. It covers these cases:

- `http://example.com/a` is requested as `https://example.com/a` and reported with that URL; `http://localhost:8080/` keeps `http:`;
- the init holds `method: 'GET'`, `redirect: 'manual'`, an `AbortSignal`, and no `body`; its headers (read through `new Headers(init.headers)`) are the profile's `User-Agent`, `Sec-CH-UA-Platform` of `"macOS"`, `Accept-Language` of `en-GB,en;q=0.9`, and the `Accept` value;
- two calls to `fetch` call `profile` twice, once each;
- the exported `provider` sends a `User-Agent` containing `Chrome/149.0.0.0`, which pins the `DEFAULT_CHROME_MAJOR` wiring;
- a 200 `text/html` body is returned raw with the answering URL even when `markdown` was requested, and `https://example.com` is reported as `https://example.com/`;
- a 200 `application/json` body is returned as received;
- a 200 `text/plain` empty body is returned as empty content;
- a 404 `Not Found` fails with `HTTP 404 Not Found`, and its body source's `cancel` is called;
- a 500 with an empty status text fails with `HTTP 500`;
- a 302 with a `Location` fails with `HTTP 302 Found` and makes no second request (subplan 12 replaces this case);
- an `application/pdf` response is refused with `unsupported content type application/pdf`, its body is cancelled, and nothing is pulled from it;
- a `Content-Length` above `LOCAL_MAX_BODY_BYTES` is refused with `response larger than 50 MB`;
- a body of byte `0xE9` under `text/plain; charset=ISO-8859-1` is decoded as `é`;
- with `timeoutMs: 10` and a stub that rejects with its received signal's `reason` once that signal aborts, the fetch fails with `timed out after 0.01 s`;
- with `timeoutMs: 10` and a stub that answers 200 with a stream whose `pull` errors with the received signal's `reason` once it aborts, the fetch fails with `timed out after 0.01 s`, proving the one signal covers the body read;
- a stub rejecting with `new TypeError('fetch failed')` fails with `fetch failed`;
- with an aborted capability signal, a stub rejecting with the signal's reason rejects with that same object (`toBe`);
- an abort during the body read, the stream erroring with the capability signal's reason, rejects with that same object.

Every assertion on a failure checks both the message and `ProviderRequestError`. The timeout cases use real timers, as subplan 7's do. `src/web/providers/http.test.ts` stays unedited, because the two functions only gain `export`.

## Documentation

None here. Subplan 12 documents the `local` provider in `documentation/developer-documentation/web-search-providers.md`, and subplan 21 writes `product/specs/web-fetch.md`. Nothing user-visible changes.

## Out of scope

- Redirects, the cross-host answer, the catalog entry, and the developer docs (subplan 12).
- Converting content, extracting PDF text, custom headers, cookies, authentication, and methods other than GET (source plan, Out of scope).
- Address checks before connecting (source plan, Reachable hosts).

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/web/providers` so the new suite and the `http.ts` callers' suites run even where `--changed` skips untracked files. Confirm `grep -n "^export" src/web/providers/http.ts` lists `requestJson`, `attemptSignal`, and `classifyRequestError`. There is no manual check: a tab can't run a fetch until subplan 21, and `web search vitest` prints exactly what it printed before.
