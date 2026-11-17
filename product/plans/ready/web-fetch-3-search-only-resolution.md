# Web fetch 3 — search resolution module, search-capable filter, and failure headings

**Complexity: 6/10** — ~95 added lines across 5 edited files plus the new resolution module, 26 test scenarios (most moved from `registry.test.ts`), 9 requirements (p=6.23)

Run order: 3 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "Registry" and "Failure lines" bullets under "Provider contract, registry, and catalog", the last sentence of the "Provider contract" decision, the `web search` sentence closing "Failure and refusal lines", and the search half of "Completion"). Depends on `product/plans/ready/web-fetch-1-rename-web-directory.md` (the `src/web/` layout) and `product/plans/ready/web-fetch-2-provider-capability-declarations.md` (the optional `search` manifest field, and `isConfigured` in the new `src/web/providers/capabilities.ts`).

`src/web/providers/registry.ts` has to make room for fetch. Today's `src/web-search/registry.ts` is 179 raw lines and 163 counted ones (`max-lines` skips blanks and comments), and subplan 2 leaves it about the same size. The source plan moves attempt resolution out of it, one module per operation. This plan moves search resolution out and makes `web search` consider only search-capable providers. It also parameterises the shared failure-line formatter by command, so fetch can reuse it. `web search` output stays byte-identical. A fetch-only provider is invisible to it once one exists (subplan 12).

Paths below are the post-rename ones from subplan 1. Line anchors point at today's `src/web-search/` files, which is where to look until subplan 1 lands; grep for the quoted identifier rather than trusting the number.

## Design decisions

- **Search resolution module (source plan, Registry).** `explicitAttempts` and `autoAttempts` (today `src/web-search/registry.ts:93` and `:119`, closures inside `createProviderRegistry`) and the dispatch in `resolveAttempts` (`:133`) move to a new `src/web/providers/search-resolution.ts`. Its one export of behavior is `resolveSearchAttempts(manifests, disabledReason, tokens, name)`. The two helpers stay private module functions beside it, so neither function grows past the cognitive-complexity limit.
  - `manifests` is the registry's `readonly WebSearchProviderManifest[]`.
  - `disabledReason` is a lookup from provider id to its stored reason, or `undefined` when the provider is enabled. Export its type as `DisabledReason` from the same module; subplan 4's fetch resolution takes the same parameter.
  - `tokens` is `ProjectTokens`, and `name` is the `--provider` value as typed.
  - The bodies don't change apart from two substitutions. `disabled.get(id)` becomes `disabledReason(id)`, and `disabled.has(id)` becomes `disabledReason(id) !== undefined`. The `?? 'Unknown failure'` fallback in the `auto` failure list stays.
- **`AttemptResolution` moves with it.** The type (today `registry.ts:16`) moves to `search-resolution.ts`, and `registry.ts` imports it from there. Leaving it in the registry would make `search-resolution.ts` import a type from the module that imports its function, an import cycle that `import-x/no-cycle` and `madge --circular` (named in `eslint.config.mjs` beside that rule) exist to catch. Nothing re-exports it from `registry.ts` (`ai/guidelines/imports-and-barrel-files.md`). Its only other importer is `registry.test.ts:13`, which moves its type import to `./search-resolution.js`. Subplan 4 imports it from here too.
- **The registry delegates.** `ProviderRegistry.resolveAttempts(name, tokens)` keeps its name and signature, so `runWebSearch` and the compatibility test call it unchanged. Its body calls `resolveSearchAttempts(manifests, (id) => disabled.get(id), tokens, name)`, passing a lookup over the registry's private `disabled` map. That map stays in the registry and stays the only disabled set. `runAttempt`, `disable`, `loadProvider`, and the two classification helpers don't move. `registry.ts` drops its imports of `formatFailures` and `isConfigured`, which only resolution used. It ends near 125 counted lines, which leaves subplan 6 room for the fetch attempt.
- **Search-capable only (source plan, Provider contract).** `searchesWeb(manifest)` is a new export of `src/web/providers/capabilities.ts`. It is false only for an explicit `search: false`, so an absent field means the provider searches, and the frozen v1 fixture (which declares no `search`) stays searchable. `resolveSearchAttempts` first keeps the manifests where it holds, then runs the moved logic on that list only. So the filter reaches all three places that read the catalog:
  - the `auto` list, including the stored-failure lines printed when every configured provider is disabled;
  - the explicit lookup, so naming a search-incapable provider prints the unknown-provider line, even when that provider is disabled;
  - the `available:` list in the unknown-provider line.
  Once `local` exists, `web search --provider local` therefore prints `Web search: unknown provider "local" (available: auto, tavily, tinyfish).`.
- **Check order and line texts unchanged.** An explicit name is checked unknown, then disabled, then not configured, as today. The moved code keeps `Web search: unknown provider "<name as typed>" (available: …).`, `Web search: provider "<id>" is not configured.`, `Web search: no provider configured.`, and the stored failure lines exactly. Resolution still activates no module and returns lines rather than throwing.
- **Search names.** The registry's `providerNames()` becomes `searchProviderNames()`, listing only search-capable ids in catalog order. Its callers are `webSearchProviderNames()` in `src/web/search/search.ts` (today `search.ts:21`), `registry.test.ts:70`, `:77`, and `:442`, and `src/web/providers/fixture-v1/compatibility.test.ts:29`. `webSearchProviderNames()` keeps its name and calls the renamed method, so `web search --provider` completion (`src/completion/web.ts:17`) never offers a fetch-only provider, with no change there. The rename is host API, not provider contract: the fixture's `manifest.ts` and `provider.ts` stay untouched and `WEB_PROVIDER_API_VERSION` stays 1.
- **Failure headings (source plan, Failure lines).** `formatFailures` in `src/web/providers/failure-lines.ts` gains a second, required parameter of a new exported type `FailureHeadings`, with two string fields: `failed` (the one-failure prefix) and `everyFailed` (the several-failures header). It is required, not defaulted, so a caller that forgets it fails typecheck instead of printing search text for fetch. Export two constants beside it:
  - `WEB_SEARCH_FAILURE_HEADINGS`: `failed` is `Web search failed`, `everyFailed` is `Web search: every provider failed.`;
  - `WEB_FETCH_FAILURE_HEADINGS`: `failed` is `Web fetch failed`, `everyFailed` is `Web fetch: every attempt failed.`.
  One failure prints `<failed> (<name>): <reason>.`. Several print `<everyFailed>`, then one `- <name>: <reason>` line each, in the order given. Nothing calls it with an empty list today and that case is unchanged. After the move, every caller passes the search headings: the two calls in `search-resolution.ts` (explicit disabled, and `auto` with every configured provider disabled) and the one in `runWebSearch` (today `search.ts:66`). So `web search` output is unchanged. Subplans 4, 5, and 15 pass the fetch headings.
- **Search activation is unchanged.** `loadProvider` keeps checking `provider.search` and keeps the `provider failed: module has no provider` reason. Subplan 6 generalises it for fetch.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Resolution logic | `explicitAttempts`, `autoAttempts`, `resolveAttempts` in `src/web/providers/registry.ts` (today `src/web-search/registry.ts:93`–`137`) | Moved into `search-resolution.ts`, with the filter added |
| Resolution result type | `AttemptResolution` at `registry.ts:16` | Moved into `search-resolution.ts` |
| Disabled map | `const disabled = new Map<string, string>()` in `createProviderRegistry` | Stays in the registry; read through the lookup |
| Configured check | `isConfigured` in `src/web/providers/capabilities.ts` (subplan 2) | Reused by the moved code |
| `search` manifest field | `WebSearchProviderManifest` in `src/web/providers/contract.ts` (subplan 2) | Read by `searchesWeb` |
| Failure lines | `formatFailures`, `ProviderFailure` in `src/web/providers/failure-lines.ts` | Parameterised |
| Completion names | `webSearchProviderNames` in `src/web/search/search.ts`, used by `src/completion/web.ts` | Unchanged name, now search-capable only |

## Proposed changes

All of this lands as one change. Renaming `providerNames` and adding the `formatFailures` parameter break their callers until each is updated, so typecheck goes green only once every item is in.

- `failure-lines.ts`: the `FailureHeadings` type, the headings parameter, and the two constants.
- `capabilities.ts`: `searchesWeb`.
- `search-resolution.ts` (new): `AttemptResolution`, `DisabledReason`, `resolveSearchAttempts`, and the two private helpers. It imports `formatFailures` and `WEB_SEARCH_FAILURE_HEADINGS` from `./failure-lines.js`, `isConfigured` and `searchesWeb` from `./capabilities.js`, and, type-only, `WebSearchProviderManifest` from `./contract.js` and `ProjectTokens` from `../../project/tokens.js`.
- `registry.ts`: remove the moved code and `AttemptResolution`; import that type and `resolveSearchAttempts` from `./search-resolution.js` and `searchesWeb` from `./capabilities.js`; delegate `resolveAttempts`; rename `providerNames` to `searchProviderNames` in the function, the `ProviderRegistry` type, and the returned object.
- `search.ts`: pass `WEB_SEARCH_FAILURE_HEADINGS` to `formatFailures`, and call `searchProviderNames` in `webSearchProviderNames`.
- `contract.ts`: in the module comment as rewritten by subplan 2, the search resolution rule says both explicit and `auto` consider only search-capable providers. Comment only.

## Tests

- `src/web/providers/search-resolution.test.ts` (new) calls `resolveSearchAttempts` directly with inline manifests whose `activate` is a `vi.fn`, and a `disabledReason` built over a plain `Map`. It takes over the five pure resolution tests from `registry.test.ts` (today `:85`–`:119`):
  - `auto` lists configured providers in catalog order, skipping a missing or empty token;
  - `AUTO` and `Auto` are matched case-insensitively, and `auto` with no token prints `Web search: no provider configured.`;
  - an explicit provider is matched case-insensitively;
  - an unknown provider prints the name as typed and the `available:` list;
  - a known but unconfigured provider prints the not-configured line with its manifest id.
  It adds these cases through the injected lookup, without running an attempt:
  - an explicit disabled provider prints `Web search failed (<id>): <reason>.`, and that wins over not-configured when its token is missing;
  - `auto` skips a disabled provider;
  - `auto` with one configured provider, disabled, prints the single-failure line, and with two, both disabled, prints the every-provider-failed block in catalog order;
  - a `search: false` manifest is skipped by `auto`, is unknown to an explicit search (also when the lookup marks it disabled), and is missing from the `available:` list;
  - a tokenless search-capable manifest counts as configured;
  - no manifest's `activate` is called by any resolution.
- `src/web/providers/capabilities.test.ts`: `searchesWeb` is true for an absent `search` and for `true`, and false for `false`.
- `src/web/providers/registry.test.ts`:
  - remove the five tests listed above and move the `AttemptResolution` type import to `./search-resolution.js`;
  - rename the three `providerNames()` calls to `searchProviderNames()`;
  - add `search?: boolean` to `FakeManifestOptions`, and a test that `searchProviderNames()` omits a `search: false` manifest and that `resolveAttempts('auto', …)` on the registry skips it;
  - keep every other test unchanged. The ones that run an attempt and then resolve (for example `'disables a provider after a plugin failure and reports it once'` and `'reports every configured provider failure for auto when all are disabled'`) prove the registry's delegate still reads its own disabled map.
- `src/web/providers/fixture-v1/compatibility.test.ts`: `searchProviderNames()` replaces `providerNames()` and still returns `['fixture-v1']`, which also pins that a manifest predating `search` stays searchable.
- `src/web/providers/failure-lines.test.ts`: the two existing tests pass `WEB_SEARCH_FAILURE_HEADINGS` with unchanged expectations; two new tests pass `WEB_FETCH_FAILURE_HEADINGS` for one failure (`Web fetch failed (local): too many redirects.`) and several (`Web fetch: every attempt failed.` then the dash lines).
- `src/web/search/search.test.ts` and `src/completion/web.test.ts` pass unchanged. Their failure, refusal, and provider-name assertions are the byte-identical check on `web search` output.

## Documentation

`documentation/developer-documentation/web-search-providers.md`, "Resolution and ordering" section, as left by subplans 1 and 2:

- The paragraph on explicit and `auto` selection says only search-capable providers take part, and that a manifest with `search: false` is unknown to `web search` and absent from its `available:` list.
- The closing sentence that sends readers to "the registry's `resolveAttempts` in `src/web/providers/registry.ts`" for the exact conditions names `resolveSearchAttempts` in `src/web/providers/search-resolution.ts` instead.
- The sentence on `formatFailures` says it takes the command's headings.

## Out of scope

- Fetch resolution (subplans 4 and 5) and fetch attempts (subplan 6).
- Spec text for the search-only provider list, which lands with the user-visible change in subplan 20. With only Tavily and TinyFish in the catalog, nothing a user sees changes here.
- Renaming `resolveAttempts`, `webSearchProviderNames`, or the catalog export (subplan 12 renames the catalog).

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/web src/completion` so the fixture compatibility suite and the completion suite run even where `--changed` would skip them. Then confirm `grep -rnw providerNames src` finds nothing, since a stale call in a test file would only fail at run time.

In a shell tab, these print exactly what they printed before the change:

- `web search vitest` (results, or `Web search: no provider configured.` with no token files);
- `web search vitest --provider nope` prints `Web search: unknown provider "nope" (available: auto, tavily, tinyfish).`;
- with no TinyFish token file, `web search vitest --provider tinyfish` prints `Web search: provider "tinyfish" is not configured.`.
