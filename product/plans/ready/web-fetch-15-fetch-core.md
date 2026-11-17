# Web fetch 15 — the fetch core

**Complexity: 6/10** — 25 test scenarios (mostly abort and no-fallback cases), 14 requirements, ~85 added lines in 2 new modules and 1 edited file (p=6.00)

Run order: 15 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "Core" bullet under "Fetch core", "Disabled providers", "Selection", "`--timeout`", "Failure and refusal lines", "Empty content and offsets past the end", the abort sentences of "Remote connection lines and cancellation", the fetch-core half of step 4 of "Order of work", and the "Core" bullet under "Tests"). Depends on these earlier subplans:

- `product/plans/ready/web-fetch-1-rename-web-directory.md`, for the `src/web/` layout;
- `product/plans/ready/web-fetch-2-provider-capability-declarations.md`, for `WebFetchRequest`, `WebSearchCapability`, and `providerApiKey` in `src/web/providers/capabilities.ts`;
- `product/plans/ready/web-fetch-3-search-only-resolution.md`, for `formatFailures` with its headings parameter, `ProviderFailure`, and `WEB_FETCH_FAILURE_HEADINGS` in `src/web/providers/failure-lines.ts`, and `searchProviderNames()`;
- `product/plans/ready/web-fetch-4-fetch-attempt-resolution.md`, for the registry's `resolveFetchAttempts(name, format, tokens)` and `fetchProviderNames()`;
- `product/plans/ready/web-fetch-5-explicit-fetch-provider.md`, for the explicit-provider refusals;
- `product/plans/ready/web-fetch-6-fetch-attempt-runner.md`, for `runFetchAttempt(manifest, request, capability, reportDisabled?)` and its `FetchAttemptOutcome`;
- `product/plans/ready/web-fetch-8-tavily-fetch.md` and `product/plans/ready/web-fetch-9-tinyfish-fetch.md`, which make the two hosted catalog entries fetch-capable, as the shared-registry test below needs;
- `product/plans/ready/web-fetch-12-local-redirects-and-catalog.md`, for `webProviderCatalog` with `local`;
- `product/plans/ready/web-fetch-13-fetch-parser.md`, for `WebFetchCommand`;
- `product/plans/ready/web-fetch-14-fetch-rendering.md`, for `FetchedPage`, `renderFetched`, and `renderRedirect`.

This plan adds `webFetch(request, deps)`, the one function every caller uses. It resolves attempts, runs them in order with fallback, and renders one string. It mirrors `runWebSearch` in `src/web/search/search.ts` and takes no `Managers`, tab, or channel. So the typed command (subplan 21), the remote operation (subplan 18), and both ACP loops (subplans 24 and 25) can each call it with the tokens of the host they run on. It also makes search and fetch share one module-level registry, which is how they share one disabled set. Subplan 16 adds the cache in front of this loop.

Paths below are the post-subplan-14 ones. At today's baseline the search core is `src/web-search/search.ts`: its module registry is `const providerRegistry = createProviderRegistry(webSearchProviderCatalog);` (`:18`), `webSearchProviderNames` is at `:20`, the attempt loop in `runWebSearch` at `:31`–`67`, and `webSearch` at `:69`. Subplans 2, 3, and 12 change lines inside it (`providerApiKey`, `searchProviderNames()`, the headings argument, and `webProviderCatalog`). `src/web/fetch/` and `src/web/providers/default-registry.ts` don't exist yet. Grep for the quoted identifier rather than trusting a line number.

## Design decisions

- **One registry per process (source plan, Disabled providers).** Today `search.ts` creates its own `providerRegistry` at module scope. Move that instance to a new `src/web/providers/default-registry.ts` as the exported `webProviderRegistry`, built with `createProviderRegistry(webProviderCatalog)`. The module holds nothing else. `search.ts` and the fetch core both import it. Without the move, a provider disabled by a fetch would still search, and the other way round. Module top level only builds the registry: the catalog's `activate` functions are literal dynamic imports, so no provider module loads, as today (`ai/guidelines/plugins.md` §6).
- **The search core switches over.** In `src/web/search/search.ts`, delete the local `providerRegistry` and the `createProviderRegistry` and `webProviderCatalog` imports, and import `webProviderRegistry` from `../providers/default-registry.js`. `webSearchProviderNames()` returns `webProviderRegistry.searchProviderNames()`, and `webSearch` calls `runWebSearch(webProviderRegistry, request, deps)`. The type-only `ProviderRegistry` import stays for `runWebSearch`'s parameter. Nothing else in `search.ts` changes, so no `web search` output changes.
- **Deps (source plan, Core).** `WebFetchDeps` is declared in the fetch core with its own five fields, not derived from `WebSearchDeps`, so neither core imports the other:
  - `tokens`, the `ProjectTokens` of the host running the fetch;
  - `fetch`, the transport handed to providers (`typeof fetch`);
  - `signal`, optional, the caller's abort signal;
  - `reportDisabled(name, reason)`, optional, called once when a provider is first disabled;
  - `now()`, optional, returning milliseconds since the epoch.
  This plan declares `now` and reads it nowhere. Subplan 16's cache reads it and falls back to `Date.now` when it's absent. Callers in subplans 18, 21, and 25 never pass it.
- **The loop.** `runWebFetch(registry, request, deps)` lives in a new `src/web/fetch/fetch.ts`. `registry` is a `ProviderRegistry` and `request` is subplan 13's `WebFetchCommand` (`url`, `format`, `timeoutSeconds`, `maxChars`, `offset`, `provider`). It runs these steps in order:
  1. Call `deps.signal?.throwIfAborted()`. So an already-aborted call rejects even when resolution would have returned a refusal line.
  2. Resolve with `registry.resolveFetchAttempts(request.provider, request.format, deps.tokens)`. A `{ kind: 'line' }` result is returned as is, and nothing is activated or sent. The core lowercases nothing: the parser has already lowercased `format`, and resolution lowercases `provider` itself (subplans 4, 5, and 13).
  3. For each manifest in `resolution.manifests`, in order, call `deps.signal?.throwIfAborted()`. Then build a fresh request and capability for this attempt, as `runWebSearch` builds its own per iteration, so a provider that mutates what it receives can't change the next attempt's input. Call `registry.runFetchAttempt(manifest, fetchRequest, capability, deps.reportDisabled)` with:
     - `fetchRequest`, a `WebFetchRequest` of `{ url: request.url, format: request.format, timeoutMs: request.timeoutSeconds * 1000 }`;
     - `capability`, a `WebSearchCapability` of `{ apiKey: providerApiKey(manifest, deps.tokens), fetch: deps.fetch, signal: deps.signal }`. `providerApiKey` (subplan 2) returns the named token's value, or `''` for a manifest with no token name or an absent value, so the empty-key rule keeps one definition.
  4. On `fetched`, call `deps.signal?.throwIfAborted()`, then return `renderFetched({ url: outcome.url, source: manifest.id, content: outcome.content }, request.offset, request.maxChars)`.
  5. On `redirected`, call `deps.signal?.throwIfAborted()`, then return `renderRedirect(outcome.url)`. No other provider is tried.
  6. On `aborted`, throw `outcome.error`.
  7. On `failed` or `plugin-failed`, push `{ name: manifest.id, reason: outcome.reason }` onto a `ProviderFailure[]` and continue with the next manifest.
  8. After the loop, call `deps.signal?.throwIfAborted()`, then return `formatFailures(failures, WEB_FETCH_FAILURE_HEADINGS)`. The list is never empty here, because resolution returns attempts only when at least one manifest is enabled.
  Steps 4 and 5 check the abort because subplan 6's runner returns a valid page or redirect even when the signal has fired.
- **Outputs (source plan, Failure and refusal lines).** One failed attempt prints `Web fetch failed (<name>): <reason>.`. Several print `Web fetch: every attempt failed.` followed by one `- <name>: <reason>` line per attempt, in order. When a fallback succeeds, only the attempt that answered prints: the failures collected so far are dropped. `renderFetched` prints the empty-page and past-the-end answers (subplan 14), and both come from a `fetched` outcome in step 4, so `auto` never falls back from them.
- **Timeout per attempt (source plan, `--timeout`).** Every attempt gets the full `--timeout` as `timeoutMs`, so an `auto` chain of three attempts can take three times as long. The core adds no overall deadline. Tavily's own 60-second cap is subplan 8's, inside the provider.
- **Abort (source plan, Remote connection lines and cancellation).** Cancelling rejects with the abort instead of printing, and tries no further attempt. Steps 1, 3, 4, 5, and 8 reject with the signal's reason through `throwIfAborted`, and step 6 rethrows the error the runner carries. The runner (subplan 6) already makes sure an attempt that sees the abort disables nothing.
- **Entry function.** `webFetch(request, deps)` returns `runWebFetch(webProviderRegistry, request, deps)`, as `webSearch` returns `runWebSearch(…)`. Tests call `runWebFetch` with their own registry, so cases stay isolated from the process-wide disabled set.
- **Names for completion.** `webFetchProviderNames()` in `fetch.ts` returns `webProviderRegistry.fetchProviderNames()`, beside `webSearchProviderNames()` in `search.ts`. It reads only the static catalog and activates nothing. Subplan 22 is its first production caller.
- **Imports.** `fetch.ts` imports `providerApiKey` from `../providers/capabilities.js`; `formatFailures` and `WEB_FETCH_FAILURE_HEADINGS` from `../providers/failure-lines.js`; `webProviderRegistry` from `../providers/default-registry.js`; and `renderFetched` and `renderRedirect` from `./render.js`. Type-only, it imports `ProjectTokens` from `../../project/tokens.js`, `WebFetchCommand` from `./command.js`, `WebFetchRequest` and `WebSearchCapability` from `../providers/contract.js`, `ProviderFailure` from `../providers/failure-lines.js`, and `ProviderRegistry` from `../providers/registry.js`. `default-registry.ts` imports `createProviderRegistry` from `./registry.js` and `webProviderCatalog` from `./catalog.js`. None of these forms a cycle.
- **Size and lint.** `fetch.ts` lands near 70 counted lines and `default-registry.ts` near 5, far under the 200-line `max-lines` limit. `runWebFetch` has one more branch than `runWebSearch`, which keeps it well under `sonarjs/cognitive-complexity`'s 15.
- **Duplication.** The capability object and the loop's abort checks match `runWebSearch` closely. `npm run duplication` (jscpd, `.jscpd.json`: 5 lines and 50 tokens, mild mode) should see no clone, because the two loops differ in the resolve call, the request fields, and the outcome branches between their shared lines. If it does report one between `search.ts` and `fetch.ts`, move the capability construction into an exported `providerCapability(manifest, deps)` in `src/web/providers/capabilities.ts` taking `{ tokens, fetch, signal? }`, and call it from both cores. Don't merge the two loops.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Search core | `runWebSearch`, `webSearch`, `webSearchProviderNames`, `WebSearchDeps` in `src/web/search/search.ts` (today `src/web-search/search.ts`) | The shape to mirror; switched to the shared registry |
| Module-level registry | `const providerRegistry = createProviderRegistry(…)` in `search.ts` | Moved to `default-registry.ts` as `webProviderRegistry` |
| Registry | `createProviderRegistry`, `ProviderRegistry`, `resolveFetchAttempts`, `runFetchAttempt`, `fetchProviderNames` in `src/web/providers/registry.ts` (subplans 4 to 6) | Resolution, attempts, the one disabled map |
| Catalog | `webProviderCatalog` in `src/web/providers/catalog.ts` (subplan 12) | Builds the shared registry |
| API key | `providerApiKey` in `src/web/providers/capabilities.ts` (subplan 2) | The capability's `apiKey` |
| Failure lines | `formatFailures`, `ProviderFailure`, `WEB_FETCH_FAILURE_HEADINGS` in `src/web/providers/failure-lines.ts` (subplan 3) | Failure output |
| Rendering | `renderFetched`, `renderRedirect` in `src/web/fetch/render.ts` (subplan 14) | Answer output |
| Request type | `WebFetchCommand` in `src/web/fetch/command.ts` (subplan 13) | The core's input |
| Search core tests | `src/web/search/search.test.ts` (`fakeProvider`, `registryWith`, the abort cases, `describe('the module registry')`) | The layout for the fetch core tests |

## Proposed changes

These land as one change. Each step keeps typecheck green on its own, but the shared-registry test needs both cores on `webProviderRegistry`.

- `src/web/providers/default-registry.ts` (new): `webProviderRegistry`.
- `src/web/search/search.ts`: use the shared registry, as described above.
- `src/web/fetch/fetch.ts` (new): `WebFetchDeps`, `runWebFetch`, `webFetch`, `webFetchProviderNames`.

## Tests

`src/web/fetch/fetch.test.ts` (new), laid out like `src/web/search/search.test.ts`. A `fakeFetchProvider(id, fetch, options)` helper builds a manifest with `apiVersion: WEB_PROVIDER_API_VERSION`, a `token` named after the id unless the options say tokenless, `fetchFormats`, and a `vi.fn` `activate` resolving to `{ provider: { fetch: spy } }`, as `fakeProvider` does for search. A `registryWith(…)` helper passes the manifests to `createProviderRegistry`. A `command(overrides)` helper fills `WebFetchCommand` defaults (`https://example.com/page`, `markdown`, 30, 10000, 0, `auto`). Attempts are mocked as `tavily` (`markdown` and `text`), `tinyfish` (`markdown` and `html`), and a tokenless `local` (all three), in that order, mimicking subplan 4's test manifests, with both tokens present unless a case says otherwise. Each case asserts the exact output string where there is one. It covers:

- the `auto` fallback chain: Tavily throws `ProviderRequestError('HTTP 500 Internal Server Error')`, TinyFish throws `ProviderRequestError('could not fetch: bot_blocked')`, `local` answers `{ url: 'https://example.com/', content: 'hello' }`, and the output is exactly `Fetched https://example.com/ (local).`, an empty line, and `hello`;
- a single failure from an explicit `--provider tavily` printing `Web fetch failed (tavily): HTTP 500 Internal Server Error.`;
- all three attempts failing, printing `Web fetch: every attempt failed.` and one dash line per attempt in catalog order;
- an explicit `--provider tinyfish` that fails, with the other two manifests' `activate` never called;
- a resolution refusal (an unknown `--provider bing`) returned unchanged, with no `activate` and no `fetch` stub call;
- a redirect from the first attempt printing `Web fetch: redirected to https://www.example.com/.`, with the second manifest's `activate` never called;
- an empty page from the first attempt printing the `(empty page)` answer, with no fallback;
- `--offset 10` on a five-character page printing the past-the-end answer, with no fallback;
- `--timeout 45` and `--format text` with every attempt failing: each provider receives `{ url, format: 'text', timeoutMs: 45000 }` with the URL as typed, and resolution skips TinyFish because it doesn't serve `text`;
- the capability: a token-named provider receives its token value as `apiKey`, the injected `fetch`, and the injected signal; a tokenless provider receives `apiKey: ''`;
- a first provider that mutates its request's `url` and `timeoutMs` before failing, with the second provider still receiving the original values;
- a plugin failure (a plain `Error('boom.')` from Tavily's `fetch`) calling `reportDisabled('tavily', 'provider failed: boom')` once, with TinyFish still tried and its page printed; and the same chain with no `reportDisabled` still falling back;
- a signal aborted before the call, with `--provider bing`, rejecting with the abort rather than returning the unknown-provider line;
- a signal aborted before the call with attempts available, rejecting with no `activate` called;
- a `reportDisabled` that aborts the signal as the first attempt plugin-fails, rejecting with no second attempt;
- a page resolved after the provider aborts the signal, rejecting with the abort;
- a redirect resolved after the provider aborts the signal, rejecting with the abort;
- a provider that aborts and then throws, rejecting with the thrown error (the runner's `aborted` outcome) and starting no later attempt;
- the only attempt failing as `reportDisabled` aborts the signal, rejecting instead of printing the failure line;
- in a `describe('the module registry')` block: `webFetchProviderNames()` returns `['tavily', 'tinyfish', 'local']` with every `webProviderCatalog` manifest's `activate` spied and never called; and `webFetch` with `--provider tavily` and `tokens: {}` returns `Web fetch: provider "tavily" is not configured.` without calling its `fetch` stub, which proves `webFetch` runs against the bundled registry.

`src/web/providers/default-registry.test.ts` (new) proves search and fetch share one disabled set through the real entry functions. It gets its own file because the cases leave providers disabled in the module-level registry, and vitest isolates module state per test file, so nothing leaks into `search.test.ts` or `fetch.test.ts`. It covers:

- a fetch that disables a provider refuses a later search: `tavilyManifest.activate` is spied to resolve to a module whose `fetch` throws `Error('boom.')`; `webFetch` with `--provider tavily` and a Tavily token prints `Web fetch failed (tavily): provider failed: boom.`; then `webSearch` with `--provider tavily` prints `Web search failed (tavily): provider failed: boom.`, `activate` was called once, and the `fetch` stub was never called;
- a search that disables a provider refuses a later fetch: the same with `tinyfishManifest`, a module whose `search` throws `Error('bang.')`, `webSearch` first and `webFetch` second, printing `Web fetch failed (tinyfish): provider failed: bang.`.

`src/web/search/search.test.ts` passes unchanged. Its `describe('the module registry')` block still expects `webSearchProviderNames()` to be `['tavily', 'tinyfish']` and a tokenless `webSearch` to print `Web search: no provider configured.`, which pins that the move changed no search output.

## Documentation

`documentation/developer-documentation/web-search-providers.md`, the paragraph that says a plugin failure disables the provider "for the rest of the server process" (today line 176). Add one sentence after that clause: the disable covers both `web search` and `web fetch`, because both commands use one registry per process, `webProviderRegistry` in `src/web/providers/default-registry.ts`. Leave the notification sentence alone; subplan 20 rewrites it.

No spec moves here. Subplan 20 adds the shared disabled set to `product/specs/web-search.md`, and subplan 21 writes `product/specs/web-fetch.md`.

## Out of scope

- The cache, and reading `deps.now` (subplan 16).
- The remote operation (subplans 17 to 19).
- The tab adapter, the disabled-provider notification text, and `web` dispatch (subplans 20 and 21).
- `--provider` completion, the first caller of `webFetchProviderNames()` (subplan 22).
- The agent paths (subplans 24 and 25).

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/web src/completion` so the search, provider, fixture compatibility, and completion suites run even where `--changed` would skip them. Run `npx jscpd src/web` and confirm it reports no clone between `search.ts` and `fetch.ts`; if it does, apply the Duplication decision above. Confirm `git grep -n "createProviderRegistry(" -- src` finds only `default-registry.ts` and test files.

In a shell tab, `web search vitest`, `web search vitest --provider nope`, and `web search vitest --provider local` print what they printed before. Nothing calls `webFetch` from a tab yet, so there is no manual fetch check until subplan 21.
