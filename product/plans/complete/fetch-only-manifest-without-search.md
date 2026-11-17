# Treat fetch-format manifests without search as fetch-only

**Complexity: 2/10** — one changed predicate and one comment across 2 production files; 5 requirements and 7 test scenarios (p=4.32).

## Goal

Make an omitted `search` on a manifest that declares `fetchFormats` mean fetch-only, so a bundled fetch-only provider is never handed to `web search`. Today `searchesWeb` returns `manifest.search !== false`, so such a manifest is treated as a searcher, its module has no `search`, the first `auto` search disables it with `provider failed: module has no provider`, and the shared disabled set removes it from `web fetch` too until restart. A manifest written before fetch existed, which declares no formats and omits `search`, must keep searching.

## Approach

Change the one predicate that decides search capability, `searchesWeb` in `src/web/providers/capabilities.ts`, so an explicit `search` value still wins and an omitted one falls back to the inverse of `fetchesWeb`. That keeps every version-1 search manifest searchable (no fetch formats) and makes a format-declaring manifest fetch-only without a `search: false` line. Both consumers, `searchProviderNames` and `resolveSearchAttempts`, already filter through this predicate, so they need no edits. The three bundled catalog manifests declare `search` explicitly and are unaffected. Update the declaration-rules comment in `src/web/providers/contract.ts` and the manifest description plus resolution wording in `documentation/developer-documentation/web-search-providers.md` so the written rule matches the code. Cover all four declaration combinations in `capabilities.test.ts` and replace the registry test that pins the old disabling behavior with one that shows such a manifest is absent from search resolution.

## Implementation steps

1. In `src/web/providers/capabilities.ts`, change `searchesWeb` to return `manifest.search ?? !fetchesWeb(manifest)`. Keep `fetchesWeb` and the rest of the file unchanged. Run `$janissary/scripts/run.mjs check-diff`.
2. In `src/web/providers/contract.ts`, update the declaration-rules comment so it says an omitted `search` searches only when the manifest declares no fetch formats, and that declaring formats without `search` is fetch-only. Run `$janissary/scripts/run.mjs check-diff`.
3. In `documentation/developer-documentation/web-search-providers.md`, update the `search` row of the Manifest reference table to the same rule, and the resolution sentence that currently names only `search: false` as unknown to `web search` so it also covers a manifest that declares fetch formats without `search`. Run `$janissary/scripts/run.mjs check-diff`.
4. Add the missing `searchesWeb` case in `src/web/providers/capabilities.test.ts` and clarify the existing absent-search case, so all four combinations are pinned. Replace the `disables a fetch-only module run as a search attempt` case in `src/web/providers/registry.test.ts` with assertions that a format-declaring, search-omitting manifest is absent from `searchProviderNames`, from `auto` resolution, and from the `available:` list of an explicit lookup. Two other registry cases (`skips a provider disabled by a fetch attempt in search resolution` and `keeps the fetch reason when a later search also fails, reporting once`) use a format-declaring manifest to check the shared disabled set across commands; add `search: true` to their manifests so they still describe a searchable provider under the new declaration rule. Run `$janissary/scripts/run.mjs check-diff`.
5. Update `product/specs/web-search.md` provider-selection paragraph with the new declaration rule, promote the plan, remove the resolved backlog entry, then check, commit and push to `feature/web-fetch`.

## Tests

- `src/web/providers/capabilities.test.ts`: omitted `search` with no fetch formats is searchable; omitted `search` with a non-empty `fetchFormats` is not; explicit `search: true` is searchable; explicit `search: false` is not.
- `src/web/providers/registry.test.ts`: a manifest that declares `fetchFormats` but omits `search` is not listed by `searchProviderNames`, is not among `resolveAttempts('auto')`, and is unknown to an explicit lookup (its id absent from the `available:` list). The two cross-command disable tests keep their assertions with an explicit `search: true` on their manifests.
- Existing `src/web/providers/search-resolution.test.ts`, `src/web/providers/fixture-v1/compatibility.test.ts`, `src/web/providers/fixture-v1-fetch/compatibility.test.ts`, and the rest of the provider suites keep passing unchanged.

## Specs

`product/specs/web-search.md` states the provider-selection rule: search considers search-capable providers, an omitted `search` searches only with no fetch formats, and declaring formats without `search` makes a provider fetch-only and unknown to search. `product/specs/web-fetch.md` needs no change because fetch resolution keys off `fetchFormats`, which this fix does not touch.

## Out of scope

- Changing `fetchesWeb`, `servesFetchFormat`, `isConfigured`, `providerApiKey`, the manifest types, or `WEB_PROVIDER_API_VERSION`.
- Changing search or fetch resolution modules, the shared disabled set, the catalog manifests, or any fixture.
- Adding new documentation pages, changing the PR description, touching other backlog entries, or merging the pull request.
