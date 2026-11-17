# Web fetch 12 — `local` redirects and catalog entry

**Complexity: 6/10** — 25 test scenarios (mostly redirect edge cases), 14 requirements, ~48 added lines across 3 edited files (p=6.18)

Run order: 12 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "Redirects" and "Reachable hosts" decisions under "The `local` provider", the 3xx sentences of "Decoding and status", "Local fetch is a provider", the `local` half of "Selection", the "Catalog" and "`local` fetch" bullets under "Provider contract, registry, and catalog", and the developer-doc half of "Documentation"). Depends on these earlier subplans:

- `product/plans/ready/web-fetch-1-rename-web-directory.md`, for the `src/web/providers/` home and the developer doc's renamed paths;
- `product/plans/ready/web-fetch-2-provider-capability-declarations.md`, for the optional `token`, `search`, and `fetchFormats` manifest fields, `WebFetchRedirect`, and the doc rows it adds;
- `product/plans/ready/web-fetch-3-search-only-resolution.md`, for `searchesWeb` and `searchProviderNames()`, which keep `local` out of search;
- `product/plans/ready/web-fetch-4-fetch-attempt-resolution.md` and `product/plans/ready/web-fetch-5-explicit-fetch-provider.md`, for `resolveFetchAttempts` and `fetchProviderNames()`, and the resolution paragraphs they write into the developer doc;
- `product/plans/ready/web-fetch-6-fetch-attempt-runner.md`, whose `runFetchAttempt` turns `{ redirectedTo }` into the `redirected` outcome;
- `product/plans/ready/web-fetch-7-attempt-timeout.md`, for the rewritten timeout paragraph in the developer doc;
- `product/plans/ready/web-fetch-8-tavily-fetch.md` and `product/plans/ready/web-fetch-9-tinyfish-fetch.md`, which complete the hosted catalog entries and add the real-catalog fetch assertions this plan updates;
- `product/plans/ready/web-fetch-10-local-fetch-helpers.md`, for `upgradedUrl`;
- `product/plans/ready/web-fetch-11-local-provider.md`, for `createLocalProvider`, the one header record and attempt signal per call, the answering-URL rule, and the private `discardBody`.

The `local` provider follows a redirect only when it stays on the same host. A redirect to another host stops the fetch and names the target, so the caller fetches it explicitly. This plan adds that redirect handling. It also lists `local` last in the provider catalog, which makes it a real provider behind the same manifest, lazy activation, registry, and disabled set as Tavily and TinyFish. And it documents the fetch half of the provider contract and the `local` provider for provider authors.

Paths below are the post-rename ones. At today's baseline the catalog is `src/web-search/providers/catalog.ts` (`export const webSearchProviderCatalog = [` at `:18`), the search core is `src/web-search/search.ts` (the import at `:6` and `const providerRegistry = createProviderRegistry(webSearchProviderCatalog);` at `:18`), and `local.ts` doesn't exist until subplan 11. Grep for the quoted identifier rather than trusting a line number.

## Design decisions

- **What counts as a redirect (source plan, Redirects and Decoding and status).** In `src/web/providers/local.ts`, a response is a redirect when its status is 301, 302, 303, 307, or 308 and it carries a usable `Location`. Those are the Fetch Standard's redirect statuses, the same five Node's own `redirect: 'follow'` acts on. Hold them in a module-level `Set`. Any other 3xx (300, 304, 305, 306) is not a redirect even with a `Location`, so it keeps subplan 11's `HTTP <status> <status text>` failure.
- **A usable `Location`.** Read it with `response.headers.get('location')` and resolve it with `new URL(location, answeringUrl)`, where `answeringUrl` is the URL this hop requested (after the upgrade), never `response.url` (subplan 11's answering-URL rule). So `/b?x=1`, `b`, and `//example.com/x` all resolve. The `Location` is unusable, and the response fails with its `HTTP <status> <status text>` line exactly as a 3xx without one does, in three cases:
  - the header is absent;
  - its value is the empty string. `Headers` trims whitespace, and `new URL('', base)` resolves to the base itself, so following it would loop to the hop limit;
  - `URL.canParse(location, answeringUrl)` is false, for example `http://[bad`. Check before constructing. An uncaught `TypeError` from `new URL` would be an unexpected throw, which subplan 6's runner treats as a plugin failure and would disable `local`.
  The unusable-`Location` failure is a `ProviderRequestError`, so it falls back like every other expected failure.
- **Same host is followed.** A target is followed when its protocol is `http:` or `https:` and its `hostname` equals the answering URL's `hostname`. The WHATWG `URL` lowercases and punycodes host names, so `EXAMPLE.com` matches `example.com`. Scheme and port may change. The comparison is exact on `hostname`, so `example.com.` and `example.com` count as different hosts, and so do `example.com` and `www.example.com`.
- **Following a hop.** Before the next request, in this order:
  1. Discard the redirect response's body with subplan 11's private `discardBody`, which releases the connection.
  2. Apply `upgradedUrl` from `src/web/providers/local-rules.ts` to the target, so each hop gets the HTTP upgrade rule. A same-host `http:` target from a public host is upgraded back to `https:`.
  3. Send the next request to that URL's `href` with the same init object subplan 11 built once per call. So every hop sends the same four headers from one `profile()` call, and one attempt signal covers every hop and the final body read. No cookies are kept, because Node's `fetch` has none.
  A same-host target with userinfo (`https://user:pw@example.com/`) is followed unchanged. Node's `fetch` refuses it with a `TypeError`, which subplan 11 already classifies as a network error.
- **Hop limit (source plan, Redirects).** A module constant of 5 is the maximum number of redirects followed, so one call sends at most six requests. When the sixth response is a redirect that would be followed, discard its body and throw `ProviderRequestError('too many redirects')`. A redirect back to the same URL is not detected separately; the hop limit ends it.
- **Cross-host answer (source plan, Redirects).** A target on a different host is not followed, and neither is one whose protocol is not `http:` or `https:` (`ftp:`, `mailto:`, `javascript:`, and so on), even on the same host. Discard the response body, then return the `WebFetchRedirect` `{ redirectedTo: target.href }`. The target is reported as resolved but never upgraded: it's not fetched here, and the caller's explicit fetch applies the upgrade itself. This check runs before the hop limit, so a cross-host redirect on the sixth response is still an answer, not `too many redirects`. That result is an answer, not a failure. The runner reports it as `redirected` (subplan 6), and the core prints `Web fetch: redirected to <url>.` without falling back (subplans 14 and 15).
- **The answering URL after redirects.** A page reached through same-host redirects reports the `href` of the last hop's requested URL, as subplan 11 decided for the first one.
- **No address checks on redirects (source plan, Reachable hosts).** A same-host redirect is followed whatever address the host resolves to, loopback and LAN included.
- **Branch order.** A response is checked in this order, and the first match wins:
  1. A redirect status with a usable `Location`: follow, answer, or refuse as above.
  2. Not 2xx (`response.ok` false): subplan 11's HTTP failure, which now also covers any 3xx that isn't a redirect.
  3. 2xx: subplan 11's content-type check, capped read, and decode.
  This replaces subplan 11's interim behavior, where a 302 with a `Location` failed with `HTTP 302 Found`.
- **Shape of `local.ts`.** `fetch` holds the hop loop. Keep it under the `sonarjs/cognitive-complexity` limit with private helpers beside it:
  - `redirectTarget(response, answeringUrl)` returns the resolved target `URL`, or `undefined` when the response is not a redirect with a usable `Location`;
  - `followsRedirect(answeringUrl, target)` is the same-host, `http:` or `https:` test;
  - subplan 11's single request with its rejection classification, and its final-response branches 2 and 3, move unchanged into two private functions that `fetch` calls on each hop and on the final response.
  Subplan 11 leaves `local.ts` near 75 counted lines, and this adds about 35. No new module is needed. If ESLint's `max-lines` still reports the file over 200 counted lines, move `redirectTarget`, `followsRedirect`, and the two constants into a new `src/web/providers/local-redirect.ts` beside it. Don't compact code to fit.
- **Catalog entry (source plan, Local fetch is a provider).** A new exported `localManifest` in `src/web/providers/catalog.ts` has these fields, in this order:
  - `id: 'local'`;
  - `apiVersion: WEB_PROVIDER_API_VERSION`;
  - no `token`;
  - `search: false`;
  - `fetchFormats: ['markdown', 'text', 'html']`;
  - `activate: () => import('./local.js')`, a literal dynamic import.
  It's declared `as const satisfies WebSearchProviderManifest` like `tavilyManifest`. It's appended after Tavily and TinyFish, so `auto` tries it last. Because it needs no token and serves every format, an `auto` fetch always ends at `local` unless it is disabled. `local.ts` exports `createLocalProvider` beside `provider` (subplan 11). The extra export is harmless, because `WebSearchProviderModule` only requires `provider`. `knip.json` sets `ignoreExportsUsedInFile`, so `localManifest` needs no other importer.
- **Catalog rename.** Now that the catalog lists a fetch-only provider, rename its export from `webSearchProviderCatalog` to `webProviderCatalog`. Subplan 1 left the name alone and subplan 3 assigned the rename here. Nothing re-exports the old name. Update every reference, which `git grep -n webSearchProviderCatalog` lists at baseline:
  - `src/web/search/search.ts`, the import and the `createProviderRegistry(…)` call (subplan 15 later moves that call to `default-registry.ts`);
  - `src/web/search/search.test.ts`, the import and the `the module registry` block;
  - `src/web/providers/registry.test.ts`, the import and the `the real web search provider catalog` block, whose `describe` title stays, because subplans 2, 8, and 9 name that block by title;
  - `documentation/developer-documentation/web-search-providers.md`, see Documentation.
  `src/completion/web.test.ts` imports only `tavilyManifest` and `tinyfishManifest`, so it doesn't change.
- **Search never sees `local`.** Search resolution and `searchProviderNames()` already skip `search: false` (subplan 3). So `web search --provider local` prints `Web search: unknown provider "local" (available: auto, tavily, tinyfish).`, and `web search` with no token files still prints `Web search: no provider configured.`. No search output changes.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| `local` module | `createLocalProvider`, `provider`, private `discardBody` in `src/web/providers/local.ts` (subplan 11) | Gains the hop loop; `discardBody` releases each redirect body |
| One header record and attempt signal per call | `browserHeaders`, `attemptSignal`, `classifyRequestError` used by `local.ts` (subplans 7 and 11) | Reused unchanged on every hop |
| Upgrade rule | `upgradedUrl` in `src/web/providers/local-rules.ts` (subplan 10) | Applied to each followed target |
| Redirect result type | `WebFetchRedirect` in `src/web/providers/contract.ts` (subplan 2) | The cross-host answer |
| Runner | `runFetchAttempt` and `decodeFetchResult` (subplan 6) | Turns `{ redirectedTo }` into `redirected` |
| Catalog | `tavilyManifest`, `tinyfishManifest`, `webSearchProviderCatalog` in `src/web/providers/catalog.ts` | Gains `localManifest`; export renamed |
| Search-capable filter | `searchesWeb` in `src/web/providers/capabilities.ts` (subplan 3) | Keeps `local` out of search |
| Node standard library | `URL`, `URL.canParse`, `Headers.get` | Resolution and parsing of `Location`; no dependency added |

## Proposed changes

These land together, so typecheck and tests are green only once every item is in.

- `src/web/providers/local.ts`: the redirect-status set and hop-limit constants, `redirectTarget`, `followsRedirect`, the two extracted per-hop functions, and the hop loop in `fetch`.
- `src/web/providers/catalog.ts`: `localManifest`, appended to the catalog, and the export renamed to `webProviderCatalog`.
- `src/web/search/search.ts`: the renamed import and call.
- The two test files and the developer doc below.

## Tests

- `src/web/providers/local.test.ts`, with subplan 11's recording `fetch` stub, fixed profile, and request constant. Replace subplan 11's case "a 302 with a `Location` fails with `HTTP 302 Found` and makes no second request" with these:
  - a 302 to `/next` from `https://example.com/page` is followed to `https://example.com/next`, whose 200 page is reported with that URL;
  - a redirect that changes scheme or port is followed (`https://example.com/` to `https://example.com:8443/x`);
  - a same-host `http://example.com/x` target is requested as `https://example.com/x`;
  - a `Location` naming `EXAMPLE.com` counts as the same host;
  - every hop sends identical headers and the same signal, and `profile` is called once for the whole call;
  - each followed redirect response has its body source's `cancel` called;
  - five redirects are followed and the sixth response's 200 page answers (six requests); a sixth redirect fails with `too many redirects` after six requests and sends no seventh;
  - a redirect to `https://www.example.com/` returns `{ redirectedTo: 'https://www.example.com/' }` without a further request, and cancels the redirect body;
  - a cross-host `http://other.example/` target is reported as `http://other.example/`, not upgraded;
  - a cross-host redirect on the sixth response returns `{ redirectedTo }`, not `too many redirects`;
  - a same-host `ftp://example.com/f` target returns `{ redirectedTo: 'ftp://example.com/f' }`;
  - a 302 with no `Location`, a 302 with an empty `Location`, and a 302 with `Location: http://[bad` each fail with `HTTP 302 Found`, sending one request;
  - a 300 and a 304 carrying a `Location` each fail with their HTTP line and send one request.
  Every failure assertion checks both the message and `ProviderRequestError`, as subplan 11's do.
- `src/web/providers/registry.test.ts`, in the `the real web search provider catalog` block:
  - the existing catalog test now expects ids `['tavily', 'tinyfish', 'local']` and tokens `['tavily', 'tinyfish', undefined]`;
  - `localManifest` has no token, `search: false`, and `fetchFormats` `['markdown', 'text', 'html']`;
  - over the real catalog, `searchProviderNames()` is `['tavily', 'tinyfish']`, and subplan 9's `fetchProviderNames()` assertion becomes `['tavily', 'tinyfish', 'local']`;
  - subplan 9's `resolveFetchAttempts('auto', 'html', …)` assertion becomes TinyFish then `local`;
  - with no tokens, `resolveFetchAttempts('auto', 'markdown', {})` resolves to `local` alone;
  - `runFetchAttempt(localManifest, …)` with a capability of `apiKey: ''` and a stub answering a 200 `text/plain` page returns `fetched`, and with a stub answering a cross-host 302 returns `redirected` with the target. This exercises the real lazy activation of `local.ts`.
- `src/web/search/search.test.ts`: only the rename. Its `the module registry` block already spies on every catalog manifest's `activate`, now `local`'s included, and expects `webSearchProviderNames()` to be `['tavily', 'tinyfish']` and a tokenless `webSearch` to print `Web search: no provider configured.`. Those unchanged expectations pin that search never sees or activates `local`.

## Documentation

`documentation/developer-documentation/web-search-providers.md`, as left by subplans 1 to 7. Leave the title, the file name, the manifest reference rows (subplan 2), the "Resolution and ordering" section (subplans 3 to 5), the timeout paragraph as subplan 7 rewrites it, and the notification sentence (subplan 20) as they are. Make these edits:

- **Opening paragraph.** A provider answers a search, a fetch of one page, or both, as its manifest declares.
- **Files to add.** `webSearchProviderCatalog` becomes `webProviderCatalog` in the prose and the sample. The sample catalog lists `tavilyManifest`, `tinyfishManifest`, `exampleManifest`, then `localManifest`, and one sentence says `local` stays last because `auto` fetch tries it as the direct fallback after every hosted provider.
- **The provider module** gains the fetch half after the search paragraphs:
  - the `fetch(request, capability)` signature beside `search` in the types sample, with `WebFetchRequest` (`url`, `format`, `timeoutMs`), `WebFetchPage` (`url`, `content`), and `WebFetchRedirect` (`redirectedTo`);
  - the page result is the final URL and the content string, and an empty `content` is an answer, so the host does not fall back;
  - the `{ redirectedTo }` result is a cross-host redirect answer, also never a fallback, which the host prints as `Web fetch: redirected to <url>.`;
  - fetch attempts run one at a time in catalog order, and a page or redirect ends the fetch.
- **The capability.** "`search` receives one capability object" becomes "`search` and `fetch` receive", unchanged otherwise.
- **Validation and failure.**
  - The plugin-failure list gains: a module whose manifest declares `fetchFormats` but has no `provider.fetch` function (`provider failed: module has no fetch`), a `fetch` that throws anything but a `ProviderRequestError`, and a `fetch` that resolves to neither a page nor a redirect (`provider failed: fetch did not return a page`).
  - The expected-failure and abort rules apply to `fetch` as they do to `search`.
  - After subplan 7's timeout paragraph, a new paragraph: each fetch attempt gets the full `--timeout` (1 to 120 seconds) as `request.timeoutMs`, which a provider passes to `requestJson` as its timeout. A provider whose API caps its own timeout sends the smaller value but still lets the helper wait the full timeout. An `auto` fetch of three attempts can take three times the timeout.
- **A new section, "The bundled `local` provider"**, before "Trust and limits". It covers these rules:
  - it is tokenless, fetch-only (`search: false`), serves every format, and is last in the catalog;
  - it connects directly from the machine running the fetch with the injected `fetch`, presenting browser headers from `randomBrowserProfile`, with no cookies;
  - it returns the body raw, whatever `--format` says;
  - it accepts only `text/*`, `application/xhtml+xml`, JSON, XML, and `+json` or `+xml` types, and refuses others with `unsupported content type <type>`;
  - it caps the body at 50 MB with `response larger than 50 MB`, and decodes with the `charset` parameter, falling back to UTF-8;
  - a non-2xx final status fails with `HTTP <status> <status text>`;
  - the HTTP upgrade rule, naming the hosts that keep `http:`;
  - the redirect rules: same host followed up to 5 hops, then `too many redirects`, and a cross-host or non-HTTP target returned as the redirect answer;
  - there are no address checks, so a role granting `web fetch` reaches the operator's private network;
  - every expected failure is a `ProviderRequestError`, so it falls back and never disables `local`.

No spec moves here. `product/specs/web-fetch.md` and its `local` rules arrive in subplan 21, and no `web search` output changes.

## Out of scope

- Printing the redirected-to line (subplans 14 and 15).
- Domain allowlists or blocklists, and address checks (source plan, Out of scope).
- `--provider` completion for fetch (subplan 22) and the shared module-level registry (subplan 15).
- Renaming the contract types, `webSearchProviderNames`, or the developer doc's file name and title.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/web src/completion` so the registry, fixture compatibility, search, and completion suites run even where `--changed` would skip them. Confirm `git grep -n webSearchProviderCatalog -- src documentation` finds nothing, and that ESLint reports `local.ts` at or under 200 counted lines. In a shell tab, `web search vitest --provider local` prints `Web search: unknown provider "local" (available: auto, tavily, tinyfish).`, and `web search vitest` prints what it printed before. There is no manual fetch check yet, because a tab can't run a fetch until subplan 21.
