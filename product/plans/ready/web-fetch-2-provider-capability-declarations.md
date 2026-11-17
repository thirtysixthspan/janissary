# Web fetch 2 — provider capability declarations and fetch types

**Complexity: 6/10** — ~70 added lines across 6 edited files (contract, registry narrowing, catalog, search core, both bundled providers), 10 requirements, 11 test scenarios (p=6.01)

Run order: 2 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (sections "Provider contract", "Local fetch is a provider", "Contract" under "Provider contract, registry, and catalog", and step 2 of "Order of work"). Depends on `product/plans/ready/web-fetch-1-rename-web-directory.md` (the `src/web/` layout and `WEB_PROVIDER_API_VERSION`).

One provider plugin will serve both `web search` and `web fetch`. The `local` provider will serve fetch only, and it won't need a token. So the manifest has to say statically what a provider offers, the token has to become optional, and the contract needs fetch request and result types. This plan makes those additive contract changes. It changes no behavior: with only Tavily and TinyFish in the catalog, `web search` behaves exactly as it does today.

Paths below are the post-rename ones from subplan 1. Line anchors are the same in today's `src/web-search/` files, because subplan 1 changes import paths without adding or removing lines.

## Design decisions

- **Capability declaration (source plan, Provider contract).** `WebSearchProviderManifest` in `src/web/providers/contract.ts` gains two optional static fields. `search` is a boolean saying whether the provider searches. `fetchFormats` is typed `readonly WebFetchFormat[]` and lists the fetch formats the provider serves. It must be `readonly` because the catalog's manifests are `as const`, which turns an array literal into a readonly tuple that a mutable array type would refuse. Both are data the registry reads without importing the module (`ai/guidelines/plugins.md` §3).
- **Declarations only.** This plan adds no code that reads `search` or `fetchFormats`. Subplan 3 adds `searchesWeb` and filters search by it. Subplan 4 adds `fetchesWeb` and `servesFetchFormat`. Don't add those predicates here.
- **An absent `search` means the provider searches.** The frozen v1 fixture (`src/web/providers/fixture-v1/manifest.ts`) predates the flag and declares neither field. It must keep loading as a search provider without being edited (`ai/guidelines/plugins.md` §11). So only an explicit `search: false` makes a manifest search-incapable; the `local` provider (subplan 12) declares it. Tavily and TinyFish declare `search: true` explicitly in `src/web/providers/catalog.ts`. Their `fetchFormats` arrive in subplans 8 and 9.
- **An absent or empty `fetchFormats` means no fetch.** Subplan 4 counts a manifest as fetch-capable only when `fetchFormats` is non-empty, so the contract states both cases now.
- **Optional token (source plan).** `token` becomes optional on the manifest (`token?: ProjectTokenName`). A manifest with no token name counts as configured. `isConfigured` (today a private function at `src/web/providers/registry.ts:39`, `function isConfigured(manifest: WebSearchProviderManifest, tokens: ProjectTokens): boolean`) moves to a new `src/web/providers/capabilities.ts` and is exported, so later resolution modules share it. Its existing rule stays exact for a manifest that names a token: configured only when that token's value is a non-empty string.
- **The API key comes from one helper.** A tokenless provider gets an empty `apiKey`. `capabilities.ts` also exports `providerApiKey(manifest, tokens)`. It returns the named token's value, or `''` when the manifest names no token or the value is absent. `runWebSearch` in `src/web/search/search.ts` builds its capability with it, replacing `apiKey: deps.tokens[manifest.token] ?? ''` (`search.ts:48`), which no longer type-checks once `token` can be undefined. Subplan 15's fetch core builds its capability with the same helper, so the empty-key rule has one definition.
- **Fetch types (source plan, Provider contract).** The contract gains five exported types:
  - `WebFetchFormat`, which is `'markdown' | 'text' | 'html'`.
  - `WebFetchRequest`, with `url` (the absolute URL string), `format` (a `WebFetchFormat`), and `timeoutMs` (the per-attempt timeout in milliseconds). Subplans 11 and 15 use these field names.
  - `WebFetchPage`, which is `{ url, content }`: the final URL and the content string.
  - `WebFetchRedirect`, which is `{ redirectedTo }`: the absolute target URL of a cross-host redirect.
  - `WebFetchResult`, the union of the page and the redirect. It has no `kind` field. Subplan 6 tells them apart by which fields are present, and subplan 12 returns `{ redirectedTo }` as is.
  `WebFetchFormat` lives in the contract, so providers never import from `src/web/fetch/`.
- **Provider shape.** `WebSearchProvider` gains an optional `fetch`, a function-typed property shaped like `search`: `(request: WebFetchRequest, capability: WebSearchCapability)` returning `Promise<WebFetchResult>`. Its `search` becomes optional too. A provider implements what its manifest declares. The fixture's object literal (`src/web/providers/fixture-v1/provider.ts`, `export const provider: WebSearchProvider = {`) still type-checks against it and is not edited. `WebSearchProviderModule` is unchanged.
- **The search call keeps compiling.** With `search` optional, `await provider.search(request, capability)` in `runAttempt` (`registry.ts:165`) no longer type-checks, because `loadProvider` returns a plain `WebSearchProvider`. Its `typeof module.provider?.search === 'function'` check doesn't narrow the returned object's type. Give `loadProvider` the return type `Promise<SearchingProvider | undefined>`, where `SearchingProvider` is a registry-local type: `WebSearchProvider` with `search` required. Narrow with a small type predicate in `registry.ts` that checks `search` is a function, instead of a cast or a non-null assertion. Then `runAttempt`'s call stays as it is. The `provider failed: module has no provider` reason and the abort handling around it don't change. Subplan 6 later generalises `loadProvider` per operation.
- **Bundled providers keep a precise type.** `src/web/providers/tavily.ts` and `tinyfish.ts` declare `export const provider: WebSearchProvider = {`. With that annotation, every direct `provider.search(…)` call in `tavily.test.ts` and `tinyfish.test.ts` calls a possibly-undefined function. `tsc` and the type-aware lint rules skip test files (`tsconfig.json` excludes `src/**/*.test.*`, and `eslint.config.mjs` ignores `**/*.test.ts` in its type-aware block), so nothing fails. But the error is real, and subplans 8 and 9 add `provider.fetch(…)` calls the same way. So change both declarations to `export const provider = { … } satisfies WebSearchProvider;`. `satisfies` still types the method parameters from context, and it keeps `search` (and later `fetch`) required on the exported object. The method bodies don't change. The frozen fixture keeps its annotation.
- **The capability object stays narrow.** `WebSearchCapability` holds `apiKey`, `fetch`, and `signal`, and serves both operations unchanged.
- **Type names stay.** The frozen fixture imports `WebSearchProviderManifest` and `WebSearchProvider` by name, so the contract types are not renamed.
- **API version stays 1.** Every change is additive (`ai/guidelines/plugins.md` §4), so `WEB_PROVIDER_API_VERSION` does not move.
- **Contract comment (source plan, Contract).** Rewrite the module comment at the top of `contract.ts` (lines 1–20) as follows:
  - The opening sentence says the lazily activated module's `provider` implements `search`, `fetch`, or both, matching its declaration, instead of "one normalized `search`". The capability description adds that `apiKey` is empty for a tokenless provider.
  - It gains the declaration rules. An absent `search` means the provider searches. An absent or empty `fetchFormats` means no fetch. An absent `token` means always configured, with an empty `apiKey`.
  - Search's existing rules stay. Its `auto` sentence reads "configured" rather than "whose token is configured", because a tokenless provider is always configured.
  - It gains fetch's four extension-point rules (`ai/guidelines/plugins.md` §5). Later subplans implement them.
    - **Resolution.** An explicit `--provider` picks one fetch-capable provider by id and never falls back. `auto` takes every fetch-capable, configured, enabled provider that serves the requested format.
    - **Ordering.** Attempts follow catalog order.
    - **Async.** Attempts run one at a time, each awaited before the next.
    - **Returning nothing.** An empty `content` string is an answer, not a failure. A `{ redirectedTo }` result is an answer too, and never falls back.
  - The existing errors rule covers fetch too. A thrown `ProviderRequestError` is an expected failure, and any other throw disables the provider.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Manifest and provider types | `src/web/providers/contract.ts` (`WebSearchProviderManifest`, `WebSearchProvider`, `WebSearchCapability`) | Extended in place |
| Configured check | `isConfigured` at `src/web/providers/registry.ts:39` | Moved to `capabilities.ts`, gaining the tokenless rule |
| Provider loader | `loadProvider` at `src/web/providers/registry.ts:44` | Return type narrowed so `runAttempt` still calls `search` |
| Catalog | `src/web/providers/catalog.ts` (`tavilyManifest`, `tinyfishManifest`, `as const satisfies WebSearchProviderManifest`) | Gains `search: true` on Tavily and TinyFish |
| Bundled provider modules | `src/web/providers/tavily.ts`, `tinyfish.ts` | Declarations switch to `satisfies WebSearchProvider` |
| Frozen fixture | `src/web/providers/fixture-v1/` | Unchanged; must still load |
| Search core | `runWebSearch` in `src/web/search/search.ts` | Builds `apiKey` with `providerApiKey` |

## Proposed changes

All of this lands as one change. Making `token` and `search` optional breaks `search.ts:48` and `registry.ts:165` until their fixes land, so typecheck goes green only once every item is in.

- `contract.ts`: the optional `search`, `fetchFormats`, and `token` fields; the five fetch types; optional `search` and `fetch` on the provider; the comment.
- `capabilities.ts` (new): `isConfigured(manifest, tokens)` and `providerApiKey(manifest, tokens)`. It imports `ProjectTokens` from `../../project/tokens.js` and the manifest type from `./contract.js`, both type-only.
- `registry.ts`: delete the private `isConfigured` and import it from `./capabilities.js`; add the `SearchingProvider` type and its predicate, and use them in `loadProvider`.
- `catalog.ts`: `search: true` on both manifests.
- `tavily.ts`, `tinyfish.ts`: `satisfies WebSearchProvider` in place of the annotation.
- `search.ts`: build `apiKey` with `providerApiKey`.

Every touched file stays well under the 200-line limit. `registry.ts` is 179 raw lines today and loses about as many lines as it gains.

## Tests

- `src/web/providers/capabilities.test.ts` (new):
  - `isConfigured` is true with a non-empty token value, false with an empty string, false with the value missing, and true with no token name;
  - `providerApiKey` returns the token's value, returns `''` when the value is missing, and returns `''` when the manifest names no token.
- `src/web/search/search.test.ts`: a manifest with no `token`, built inline beside `fakeProvider`, used with `tokens: {}`:
  - under `auto` it is attempted, its `search` receives `apiKey: ''`, and its results print;
  - named explicitly with `--provider` it is attempted rather than refused as not configured.
- `src/web/providers/registry.test.ts`, in the `describe('the real web search provider catalog', …)` block: Tavily and TinyFish declare `search: true`, and neither declares `fetchFormats` yet.
- `src/web/providers/contract.test.ts`: its call through `activated.provider.search(…)` (line 68) becomes an optional call, `search?.(…)`, since the module type's `search` is now optional. The assertions don't change.
- `src/web/providers/fixture-v1/compatibility.test.ts` passes unchanged.
- Every existing registry, search, Tavily, and TinyFish suite passes unchanged.

## Out of scope

- Filtering search to search-capable providers, and `searchesWeb` (subplan 3).
- Fetch resolution, `fetchesWeb`, `servesFetchFormat` (subplans 4 and 5), and fetch attempts (subplan 6).
- Fetch formats and fetch implementations (subplans 8, 9, 11, and 12).
- Any spec change. `web search` output is unchanged, so `product/specs/web-search.md` stays as is.

## Documentation

Update `documentation/developer-documentation/web-search-providers.md`. The fetch contract itself is documented in subplan 12.

- **Manifest reference table.** `token` becomes "no", meaning a provider without one is always configured and gets an empty `apiKey`. Add a `search` row: optional, absent means the provider searches, and only `search: false` opts out. Add a `fetchFormats` row: optional, lists `markdown`, `text`, or `html`, and absent or empty means no fetch.
- **The provider module.** The `WebSearchProvider` sample marks `search` optional, and the text says a provider implements what its manifest declares.
- **The capability.** The `apiKey` row says it's empty for a provider whose manifest names no token.
- **Resolution and ordering.** The `auto` sentence says it skips a provider that names a token with no token file, rather than "any provider without a token file".

## Verification

Run `$janissary/scripts/run.mjs check-diff`. In a shell tab, `web search vitest`, `web search vitest --provider tinyfish`, and `web search vitest --provider nope` print what they printed before.
