# Web fetch 4 — fetch attempt resolution for `auto`

**Complexity: 6/10** — ~65 added lines across 2 edited files plus the new resolution module, 11 requirements, 26 test scenarios (p=5.98)

Run order: 4 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "Selection" decision, the `auto` half of "Registry" under "Provider contract, registry, and catalog", the `auto` sentence of "Failure and refusal lines", and the fetch half of the "Provider contract" sentence that `web fetch` considers only fetch-capable providers). Depends on these earlier subplans:

- `product/plans/ready/web-fetch-1-rename-web-directory.md`, for the `src/web/providers/` layout;
- `product/plans/ready/web-fetch-2-provider-capability-declarations.md`, for the `fetchFormats` manifest field, `WebFetchFormat`, and `isConfigured` in `src/web/providers/capabilities.ts`;
- `product/plans/ready/web-fetch-3-search-only-resolution.md`, for `AttemptResolution` and `DisabledReason` in `src/web/providers/search-resolution.ts`, the module shape to mirror, and `WEB_FETCH_FAILURE_HEADINGS` in `src/web/providers/failure-lines.ts`.

Before running anything, a fetch has to decide which providers to try and in what order, or which line to print instead. This plan adds that decision for the default `--provider auto` as a pure function beside search resolution. It also exposes the function on the registry, along with the list of fetch-capable provider names. Subplan 5 adds the explicit `--provider <name>` path to the same function. Nothing calls it yet; subplan 15's core does, and subplan 15's `webFetchProviderNames()` wraps `fetchProviderNames()` for completion.

Paths below are the post-subplan-3 ones. Today the registry is `src/web-search/registry.ts`, the failure formatter is `src/web-search/failure-lines.ts`, and `capabilities.ts` and `search-resolution.ts` don't exist yet. Grep for the quoted identifier rather than trusting a line number.

## Design decisions

- **Module (source plan, Selection).** `resolveFetchAttempts(manifests, disabledReason, tokens, name, format)` lives in a new `src/web/providers/fetch-resolution.ts`. Its parameters follow `resolveSearchAttempts` in `search-resolution.ts` (subplan 3), with `format` appended:
  - `manifests` is the registry's `readonly WebSearchProviderManifest[]`;
  - `disabledReason` is subplan 3's `DisabledReason` lookup, returning the stored reason or `undefined` for an enabled provider;
  - `tokens` is `ProjectTokens`;
  - `name` is the `--provider` value as typed;
  - `format` is a `WebFetchFormat`. It arrives lowercased from the parser (subplan 13) and typed, so resolution compares it as is and doesn't lowercase it.
  It returns subplan 3's `AttemptResolution`, either `{ kind: 'attempts', manifests }` or `{ kind: 'line', line }`. Import that type and `DisabledReason` from `./search-resolution.js`, as subplan 3 decided. Don't redeclare either, and don't move them; `search-resolution.ts` never imports `fetch-resolution.ts`, so there is no cycle.
- **Fetch-capable only (source plan, Provider contract).** A new `fetchesWeb(manifest)` in `src/web/providers/capabilities.ts` is true only when `fetchFormats` is present and non-empty, per subplan 2's declaration rule. A new `servesFetchFormat(manifest, format)` beside it is true only when `fetchFormats` contains `format`. `resolveFetchAttempts` first keeps the manifests where `fetchesWeb` holds and runs everything below on that list only. So a search-only manifest, including the frozen v1 fixture, is never attempted and never appears in a fetch line.
- **Shape.** Mirror `search-resolution.ts`. The exported function lowercases `name` and, for `auto`, returns a private module function `autoFetchAttempts`. Any other name returns the unknown-provider line from a second private function. Subplan 5 adds its explicit path as a third private function and reuses the unknown-line function as its first check, so neither the export nor any helper grows past the cognitive-complexity limit.
- **`auto`.** Start from the fetch-capable manifests in catalog order. Keep those that are configured per `isConfigured` and serve the requested format per `servesFetchFormat`. `isConfigured` treats a manifest with no token name as configured, and one whose token value is missing or the empty string as not configured. What's left is the eligible set.
  - If any eligible manifest is enabled (`disabledReason(id) === undefined`), the attempts are the enabled ones, in catalog order.
  - If eligible manifests exist but all are disabled, the line is `formatFailures` over every eligible manifest in catalog order, with `WEB_FETCH_FAILURE_HEADINGS` and each reason from `disabledReason(id) ?? 'Unknown failure'`, the same fallback search keeps. One prints `Web fetch failed (<id>): <reason>.`. Several print `Web fetch: every attempt failed.` and then one `- <id>: <reason>` line each. An unconfigured or format-incapable provider is left out of that list even when it's disabled, as search leaves out an unconfigured one.
  - If nothing is eligible, the line is `Web fetch: no provider configured.`, whatever the cause (no tokens, or no provider serving the format). The source plan has no line for this. It can't happen with the bundled catalog, because `local` needs no token and serves every format, and a disabled `local` is still eligible and prints its stored line. The line exists to keep the function total for injected catalogs, and it reuses search's wording.
- **Explicit names come next.** Until subplan 5, a name other than `auto` resolves to the line `Web fetch: unknown provider "<name as typed>" (available: auto, <fetch-capable ids in catalog order, comma-separated>).`. The `available:` list comes from the fetch-capable list, so a search-only provider never appears in it. With the bundled catalog after subplan 12, it reads `(available: auto, tavily, tinyfish, local)`. Subplan 5 keeps that line for names that match no fetch-capable provider and adds the rest of the explicit path.
- **Refusals send nothing.** Resolution calls no manifest's `activate` and sends no request. Lines are returned, never thrown.
- **Registry surface.** `ProviderRegistry` in `src/web/providers/registry.ts` gains two members, added to the type and to the object `createProviderRegistry` returns:
  - `resolveFetchAttempts(name, format, tokens)` calls `resolveFetchAttempts(manifests, (id) => disabled.get(id), tokens, name, format)`, the same lookup over the private `disabled` map that subplan 3's `resolveAttempts` passes. So a provider disabled during either operation is skipped by both. The argument order is the one subplan 15 calls: `registry.resolveFetchAttempts(request.provider, request.format, deps.tokens)`.
  - `fetchProviderNames()` returns the fetch-capable ids in catalog order, filtering with `fetchesWeb`, as subplan 3's `searchProviderNames()` filters with `searchesWeb`.
  Nothing else in the registry changes. Its only consumers, `src/web/search/search.ts` and the tests, build it through `createProviderRegistry`, so no hand-written `ProviderRegistry` object needs the new members.
- **One change.** Every item is additive and nothing calls the new code, so typecheck and tests stay green at any point. It lands as one change all the same.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Search resolution | `resolveSearchAttempts`, `AttemptResolution`, `DisabledReason` in `src/web/providers/search-resolution.ts` (subplan 3; today `explicitAttempts`, `autoAttempts`, `resolveAttempts` inside `createProviderRegistry` in `src/web-search/registry.ts`) | The shape to mirror; result and lookup types imported |
| Capability predicates | `isConfigured`, `searchesWeb` in `src/web/providers/capabilities.ts` (subplans 2 and 3) | Gains `fetchesWeb` and `servesFetchFormat` |
| Fetch declaration | `fetchFormats` and `WebFetchFormat` in `src/web/providers/contract.ts` (subplan 2) | Read by the two new predicates |
| Failure lines | `formatFailures` and `WEB_FETCH_FAILURE_HEADINGS` in `src/web/providers/failure-lines.ts` (subplan 3) | Disabled-provider lines |
| Disabled map | `const disabled = new Map<string, string>()` in `createProviderRegistry` | Shared by both resolutions |
| Name listing | `searchProviderNames()` on the registry (subplan 3) | The shape `fetchProviderNames()` mirrors |

## Proposed changes

- `fetch-resolution.ts` (new): `resolveFetchAttempts`, the private `auto` and unknown-name helpers. It imports `formatFailures` and `WEB_FETCH_FAILURE_HEADINGS` from `./failure-lines.js` and `isConfigured`, `fetchesWeb`, and `servesFetchFormat` from `./capabilities.js`. Type-only, it imports `AttemptResolution` and `DisabledReason` from `./search-resolution.js`, `WebSearchProviderManifest` and `WebFetchFormat` from `./contract.js`, and `ProjectTokens` from `../../project/tokens.js`.
- `capabilities.ts`: add `fetchesWeb` and `servesFetchFormat`. Import `WebFetchFormat` from `./contract.js`, type-only.
- `registry.ts`: add `resolveFetchAttempts` and `fetchProviderNames` to `ProviderRegistry` and the returned object. Import `resolveFetchAttempts` from `./fetch-resolution.js`, `fetchesWeb` from `./capabilities.js`, and `WebFetchFormat` type-only from `./contract.js`. Subplan 3 leaves it near 125 counted lines, so the additions keep it well under 200 and leave subplan 6 its room.

## Tests

- `src/web/providers/fetch-resolution.test.ts` (new) calls `resolveFetchAttempts` directly with a `disabledReason` built over a plain `Map`, as subplan 3's `search-resolution.test.ts` does. Its injected manifests mimic the bundled ones, each with a `vi.fn` `activate`:
  - `tavily`, token `tavily`, `fetchFormats` `markdown` and `text`;
  - `tinyfish`, token `tinyfish`, `fetchFormats` `markdown` and `html`;
  - `local`, no token, `search: false`, all three formats;
  - a configured search-only manifest (`search: true`, no `fetchFormats`) listed first.
  Subplan 5 reuses these manifests. The file covers these cases:
  - the `auto` order with every token present: `markdown` gives `tavily`, `tinyfish`, `local`;
  - a provider whose token is missing, and one whose token is the empty string, skipped;
  - `--format text` skipping TinyFish, and `--format html` skipping Tavily;
  - a disabled provider skipped;
  - `AUTO` and `Auto` matched as `auto`;
  - with no tokens and `local` disabled, the one stored line `Web fetch failed (local): <reason>.`; with all three disabled, the every-attempt block in catalog order; and a disabled but unconfigured provider left out of that block;
  - nothing eligible printing `Web fetch: no provider configured.`, once from an injected catalog of Tavily and TinyFish with no tokens, and once from Tavily alone with `--format html`;
  - a tokenless provider counting as configured;
  - the search-only manifest never attempted, also when every fetch provider is disabled;
  - an unknown name such as `Bing`, and the search-only manifest's id, printing the unknown line with the name as typed and `available: auto, tavily, tinyfish, local`. Don't test a fetch-capable id here, because subplan 5 makes it resolve;
  - no manifest's `activate` called by any resolution.
- `src/web/providers/capabilities.test.ts`:
  - `fetchesWeb` is false for an absent `fetchFormats` and for an empty one, and true for a non-empty one;
  - `servesFetchFormat` is true for a listed format, false for an unlisted one, and false when `fetchFormats` is absent.
- `src/web/providers/registry.test.ts`: add `fetchFormats?: readonly WebFetchFormat[]` to `FakeManifestOptions` (subplan 3 already adds `search?`), copied onto the manifest when given. Then add:
  - `fetchProviderNames()` lists only fetch-capable ids in catalog order, leaving out a manifest with no `fetchFormats` and one with an empty list;
  - a provider disabled by a search `runAttempt` (its `search` throws a plain error) is skipped by `resolveFetchAttempts('auto', 'markdown', TOKENS)`. When it's the only eligible provider, the line is `Web fetch failed (tavily): provider failed: <first line>.`, which proves fetch resolution reads the registry's own disabled map.
  Don't add a real-catalog assertion on `fetchProviderNames()`. Subplans 8, 9, and 12 change the catalog's fetch formats and own those assertions.
- Every existing registry, search-resolution, compatibility, and search suite passes unchanged.

## Documentation

`documentation/developer-documentation/web-search-providers.md`, "Resolution and ordering" section, as left by subplans 1 to 3, gains a paragraph on fetch `auto`. It says these things:

- only providers with a non-empty `fetchFormats` take part;
- `auto` walks them in catalog order and skips any that names a token with no token file, any that doesn't list the requested `--format`, and any already disabled;
- when every remaining provider is disabled, their stored reasons print through `formatFailures` with the fetch headings;
- when none remain, the line is `Web fetch: no provider configured.`;
- `resolveFetchAttempts` in `src/web/providers/fetch-resolution.ts` has the exact conditions.

Don't document the interim unknown-name behavior for explicit names; subplan 5 replaces it.

## Out of scope

- The explicit-provider checks (subplan 5).
- Running a fetch attempt (subplan 6).
- Fetch formats on the real catalog (subplans 8, 9, and 12).
- `webFetchProviderNames()` and the shared module-level registry (subplan 15), and `--provider` completion (subplan 22).
- Any spec change. Nothing user-visible changes, and `product/specs/web-fetch.md` arrives in subplan 21.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/web` so the fixture compatibility suite and the search suites run even where `--changed` would skip them. In a shell tab, `web search vitest` and `web search vitest --provider nope` print exactly what they printed before.
