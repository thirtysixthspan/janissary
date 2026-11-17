# Web fetch 5 — explicit `--provider` resolution for fetch

**Complexity: 4/10** — ~30 added lines in 1 edited file, 8 requirements, 10 test scenarios (p=5.07)

Run order: 5 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the explicit half of "Selection", the explicit refusals in "Failure and refusal lines", and the explicit half of "Fetch resolution implements the Selection and refusal rules" under "Registry"). Depends on these earlier subplans:

- `product/plans/ready/web-fetch-4-fetch-attempt-resolution.md`, for `resolveFetchAttempts` in `src/web/providers/fetch-resolution.ts`, its fetch-capable filter, its private `autoFetchAttempts` and unknown-name helpers, `servesFetchFormat` in `src/web/providers/capabilities.ts`, the registry's `resolveFetchAttempts(name, format, tokens)` member, and the injected test manifests;
- `product/plans/ready/web-fetch-3-search-only-resolution.md`, for `AttemptResolution`, `DisabledReason`, the explicit search path to mirror in `src/web/providers/search-resolution.ts`, and `WEB_FETCH_FAILURE_HEADINGS` in `src/web/providers/failure-lines.ts`;
- `product/plans/ready/web-fetch-2-provider-capability-declarations.md`, for `isConfigured` in `src/web/providers/capabilities.ts` and `WebFetchFormat`.

With `--provider <name>`, a fetch tries only that provider and never falls back, as `web search` does. When the named provider can't run, resolution returns one refusal line and sends nothing. This plan adds that explicit path to `resolveFetchAttempts`. Until it lands, subplan 4 answers every name other than `auto` with the unknown-provider line. Nothing calls fetch resolution yet; subplan 15's core does, through `registry.resolveFetchAttempts(request.provider, request.format, deps.tokens)`.

Paths below are the post-subplan-4 ones. None of these files exists at today's baseline: the explicit search path to mirror is today's `explicitAttempts` closure inside `createProviderRegistry` in `src/web-search/registry.ts` (grep `function explicitAttempts`), which subplan 3 moves to `search-resolution.ts`.

## Design decisions

- **Explicit name (source plan, Selection and Failure and refusal lines).** For any name other than `auto`, matched after lowercasing, `resolveFetchAttempts` runs these checks in this order, and the first that applies wins:
  1. A name that matches no fetch-capable manifest's id returns `Web fetch: unknown provider "<name as typed>" (available: auto, <fetch-capable ids in catalog order, comma-separated>).`. This is subplan 4's unknown-name line, unchanged. A search-only provider is unknown here, also when it's disabled, because the fetch-capable filter runs first.
  2. A disabled provider (`disabledReason(id) !== undefined`) returns `formatFailures([{ name: id, reason }], WEB_FETCH_FAILURE_HEADINGS)`, which reads `Web fetch failed (<id>): <stored reason>.`. No `'Unknown failure'` fallback is needed, because the check already has the reason.
  3. A provider that `isConfigured` rejects returns `Web fetch: provider "<id>" is not configured.`. A manifest with no token name always passes, so `local` never gets this line.
  4. A provider that `servesFetchFormat` rejects for the requested format returns `Web fetch: provider "<id>" does not support --format <format>.`. `<format>` is the `WebFetchFormat` resolution receives, which the parser (subplan 13) has already lowercased, so `--format HTML` prints `--format html`.
  Otherwise the result is `{ kind: 'attempts', manifests: [manifest] }`. The first three checks keep the order `web search` uses (unknown, then disabled, then not configured). The format check comes last. So disabled wins over both later checks, and not configured wins over an unsupported format: with no Tavily token, `--provider tavily --format html` prints the not-configured line.
- **Matching.** Compare the lowercased name with `manifest.id` exactly, as the search path does (`candidate.id === requested` in today's `explicitAttempts`). Look only among the fetch-capable manifests subplan 4's filter keeps.
- **No fallback (source plan, Selection).** The explicit result never holds more than one manifest, so `--provider local` is a direct fetch only, even when Tavily and TinyFish are configured. There is no remote-only option.
- **Names.** The unknown line prints the name as typed. The other three lines print the manifest id, as the search lines do. The parser keeps `--provider` as typed (subplan 13), and this function lowercases it.
- **Shape.** Add one private module function, `explicitFetchAttempts`, beside subplan 4's `autoFetchAttempts`. It takes the fetch-capable manifests, the `disabledReason` lookup, the tokens, the lowercased name, the name as typed, and the format. It calls subplan 4's unknown-name helper for check 1 rather than building the line again. The exported `resolveFetchAttempts` keeps its signature, and its non-`auto` branch now calls `explicitFetchAttempts` instead of the unknown-name helper. Each function stays well under the cognitive-complexity limit, and the file stays far below 200 lines.
- **Refusals send nothing.** As in subplan 4, resolution calls no manifest's `activate`, sends no request, and returns lines rather than throwing.
- **Nothing else changes.** The registry's `resolveFetchAttempts` member from subplan 4 already passes every name through, so `registry.ts` and `capabilities.ts` are untouched. Search resolution and `web search` output are untouched.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Explicit search path | `resolveSearchAttempts` and its private explicit helper in `src/web/providers/search-resolution.ts` (subplan 3; today `explicitAttempts` in `src/web-search/registry.ts`) | Check order and line shapes to mirror |
| Fetch resolution | `resolveFetchAttempts`, `autoFetchAttempts`, and the unknown-name helper in `src/web/providers/fetch-resolution.ts` (subplan 4) | Gains the explicit path; unknown-name helper reused as check 1 |
| Capability predicates | `isConfigured` (subplan 2) and `servesFetchFormat` (subplan 4) in `src/web/providers/capabilities.ts` | Token and format checks |
| Failure lines | `formatFailures` and `WEB_FETCH_FAILURE_HEADINGS` in `src/web/providers/failure-lines.ts` (subplan 3) | Disabled-provider line |
| Result and lookup types | `AttemptResolution`, `DisabledReason` in `src/web/providers/search-resolution.ts` (subplan 3) | Already imported by `fetch-resolution.ts` |

## Proposed changes

- `src/web/providers/fetch-resolution.ts`: add `explicitFetchAttempts` and route non-`auto` names to it. It already imports everything it needs from subplan 4 (`formatFailures`, `WEB_FETCH_FAILURE_HEADINGS`, `isConfigured`, `servesFetchFormat`), so no import is added.

It lands as one change. Typecheck and tests stay green, because only subplan 4's unknown-name test cases reach the changed branch, and they use names that still match nothing.

## Tests

`src/web/providers/fetch-resolution.test.ts` reuses subplan 4's injected manifests (`tavily`, `tinyfish`, tokenless `local`, and a configured search-only manifest listed first) and its `disabledReason` over a plain `Map`. It adds these cases:

- `--provider TinyFish` resolves to the `tinyfish` manifest alone, with its token present;
- `--provider local` and `--provider LOCAL` resolve to `local` alone, with Tavily and TinyFish both configured;
- an explicit tokenless provider counts as configured with `tokens` empty;
- an unknown name such as `Bing` still prints the unknown line with the name as typed and `available: auto, tavily, tinyfish, local`, as subplan 4 pins;
- the search-only manifest's id prints the unknown line, also when the lookup marks it disabled;
- `--provider tavily` with no Tavily token, and with an empty-string token, prints `Web fetch: provider "tavily" is not configured.`;
- `--provider tavily --format html` with a Tavily token prints `Web fetch: provider "tavily" does not support --format html.`;
- an explicit disabled provider prints `Web fetch failed (<id>): <reason>.`, and that line wins over not configured (disabled `tavily`, no token) and over an unsupported format (disabled `tavily`, `html`);
- not configured wins over an unsupported format: `tavily`, no token, `html`;
- no manifest's `activate` is called by any explicit resolution, including the one that returns attempts.

Every subplan 4 case, and every search-resolution, registry, and search suite, passes unchanged.

## Documentation

`documentation/developer-documentation/web-search-providers.md`, "Resolution and ordering" section, as left by subplans 1 to 4. Subplan 4 kept the interim explicit behavior out of it, so this plan adds the explicit fetch rules:

- An explicit `web fetch --provider <name>` considers only providers with a non-empty `fetchFormats`, and selects that one provider with no fallback. It's checked in the order unknown, then disabled, then not configured, then unsupported format.
- The lines a provider author will see from explicit fetch resolution are `Web fetch: unknown provider "<name>" (available: auto, tavily, tinyfish, local).`, `Web fetch failed (<id>): <reason>.`, `Web fetch: provider "<id>" is not configured.`, and `Web fetch: provider "<id>" does not support --format <format>.`, each described as the search lines are: the name as typed in the unknown line, the manifest id in the others, and the stored reason in the disabled line.
- `resolveFetchAttempts` in `src/web/providers/fetch-resolution.ts` has the exact conditions.

The `available:` list in the doc example names `local`, which joins the catalog in subplan 12. The doc describes the finished catalog, as subplan 4's fetch paragraph does.

## Out of scope

- Running attempts (subplan 6) and the fallback loop (subplan 15).
- Fetch formats on the real catalog (subplans 8, 9, and 12). Until they land, no bundled provider is fetch-capable, so the real `available:` list is `auto` alone.
- Any spec change. Nothing user-visible changes, and `product/specs/web-fetch.md` arrives in subplan 21.
- `--provider` completion (subplan 22).

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/web` so the fixture compatibility suite and the search suites run even where `--changed` would skip them. There is no manual fetch check yet, because nothing calls `resolveFetchAttempts` from a tab until subplan 21. In a shell tab, `web search vitest --provider nope` and `web search vitest --provider tinyfish` print exactly what they printed before.
