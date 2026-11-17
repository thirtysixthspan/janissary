# Frozen fetch provider fixture

**Complexity: 3/10** — ~22 added production lines across 2 new fixture modules, 7 behavioral requirements, 5 test scenarios (p=4.41).

## Goal

Pin the fetch half of the version-1 web provider contract with a frozen fixture provider, so a later change that breaks `fetch` while keeping API version 1 fails a compatibility test. This applies `ai/guidelines/plugins.md` §11 (make compatibility testable, not aspirational) to the fetch extension point, which the search fixture `src/web/providers/fixture-v1/` does not cover.

## Approach

Mirror the existing `fixture-v1` search fixture in a new sibling directory, `src/web/providers/fixture-v1-fetch/`. The manifest is pure declaration data with a literal `apiVersion: 1` so bumping `WEB_PROVIDER_API_VERSION` cannot silently re-label it; it declares a fetch-only, tokenless provider serving every format. The provider module implements a representative `fetch` that returns both result shapes the contract allows. A compatibility test builds a real registry from just this manifest, checks resolution for `auto` and by name, and round-trips both result shapes through the production activation and decode path. The fixture stays out of the production catalog, and the existing search fixture is left byte-for-byte unchanged.

## Implementation steps

1. Add `src/web/providers/fixture-v1-fetch/manifest.ts`: an `as const satisfies WebSearchProviderManifest` object with `id: 'fixture-v1-fetch'`, literal `apiVersion: 1`, `search: false`, `fetchFormats: ['markdown', 'text', 'html']`, no `token`, and `activate: () => import('./provider.js')`. It must not import `WEB_PROVIDER_API_VERSION`.
2. Add `src/web/providers/fixture-v1-fetch/provider.ts`: export `provider: WebSearchProvider` with a `fetch` that returns a fixed `{ url, content }` page for one distinguished request URL and a fixed `{ redirectedTo }` result for another. It must not import `WEB_PROVIDER_API_VERSION`.
3. Add `src/web/providers/fixture-v1-fetch/compatibility.test.ts` following the style of `src/web/providers/fixture-v1/compatibility.test.ts`: assert the manifest and `WEB_PROVIDER_API_VERSION` are `1`; build a registry with `createProviderRegistry([fixtureV1FetchManifest])`; assert `resolveFetchAttempts` selects the fixture for `auto` and by name for a requested format; and call `runFetchAttempt` to assert the page result and the redirect result both decode into the expected `FetchAnswer`.
4. Update the compatibility paragraph at the top of `documentation/developer-documentation/web-search-providers.md` to name the new fetch fixture alongside the existing search fixture.

## Tests

New `src/web/providers/fixture-v1-fetch/compatibility.test.ts` covering:

- Registration and version pin: manifest declares literal `1` and the constant is still `1`, so resolution picks the fixture.
- `resolveFetchAttempts('auto', format, tokens)` selects the fixture.
- `resolveFetchAttempts('fixture-v1-fetch', format, tokens)` selects the fixture by name.
- `runFetchAttempt` round-trips the page URL into `{ kind: 'fetched', url, content }`.
- `runFetchAttempt` round-trips the redirect into `{ kind: 'redirected', url }`.

The existing `src/web/providers/fixture-v1/compatibility.test.ts` and the rest of the provider suites must keep passing unchanged.

## Specs

`product/specs/web-fetch.md` already describes the fetch result shapes and compatibility behavior; this fixture adds a test, not a behavior change, so no functional spec update is needed. The developer-documentation compatibility paragraph is updated in step 4.

## Out of scope

- Adding the fixture to `webProviderCatalog` or any production loader; it is loaded only by its compatibility test.
- Editing `src/web/providers/fixture-v1/` in any way; it stays byte-identical.
- Changing `WEB_PROVIDER_API_VERSION`, the provider contract types, registry logic, or fetch decoding.
- Changing the PR description or any other backlog entry.
