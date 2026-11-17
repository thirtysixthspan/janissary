# Web fetch 6 — run one fetch attempt through the registry

**Complexity: 6/10** — ~100 added lines across 1 edited file plus the new result decoder, 13 requirements, 32 test scenarios (mostly abort and result-shape cases) (p=6.09)

Run order: 6 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the `runAttempt` sentences of the "Registry" bullet under "Provider contract, registry, and catalog", "Disabled providers", the abort sentence of "Remote connection lines and cancellation", and the `ProviderRequestError` sentence of "`local` fetch"). Depends on these earlier subplans:

- `product/plans/ready/web-fetch-1-rename-web-directory.md`, for the `src/web/providers/` layout and `WEB_PROVIDER_API_VERSION`;
- `product/plans/ready/web-fetch-2-provider-capability-declarations.md`, for `WebFetchRequest`, `WebFetchPage`, `WebFetchRedirect`, and `WebFetchResult` in `src/web/providers/contract.ts`, the optional `fetch` on `WebSearchProvider`, and the registry-local `SearchingProvider` type and predicate that `loadProvider` narrows with;
- `product/plans/ready/web-fetch-3-search-only-resolution.md`, which moves search resolution and `AttemptResolution` out of `registry.ts` and leaves it near 125 counted lines;
- `product/plans/ready/web-fetch-4-fetch-attempt-resolution.md`, for the registry's `resolveFetchAttempts(name, format, tokens)` member and the `fetchFormats` option on the registry tests' `FakeManifestOptions`.

The registry runs a search attempt with an API-version check, lazy activation, failure classification, abort handling, and one disabled map (`runAttempt` in `src/web/providers/registry.ts`). A fetch attempt needs the same guards around `provider.fetch`, and has to share that disabled map so a provider that breaks in either operation is disabled for both. This plan adds that fetch counterpart. Nothing calls it yet; subplan 15's core does.

Paths below are the post-rename ones. None of the fetch types exists at today's baseline. Today's registry is `src/web-search/registry.ts` (179 raw lines, 163 counted), where `disable` (`:60`), `classifyActivationFailure` (`:72`), `classifySearchFailure` (`:82`), `loadProvider` (`:44`), and `runAttempt` (`:139`) are the pieces this plan reshapes. Grep for the quoted identifier rather than trusting a line number.

## Design decisions

- **`runFetchAttempt` (source plan, Registry).** `ProviderRegistry` gains `runFetchAttempt(manifest, request, capability, reportDisabled?)`, added to the type and to the object `createProviderRegistry` returns. It takes a `WebFetchRequest` and the same `WebSearchCapability` search uses, and resolves to a new exported `FetchAttemptOutcome`. Its five kinds are these:
  - `{ kind: 'fetched', url, content }`, the final URL and content strings copied from the provider's page;
  - `{ kind: 'redirected', url }`, where `url` is the provider's `redirectedTo` value;
  - `{ kind: 'failed', reason }`;
  - `{ kind: 'aborted', error }`;
  - `{ kind: 'plugin-failed', reason }`.
  The flat `url` and `content` fields are what subplan 15 passes on to `renderFetched({ url, source, content }, …)` and `renderRedirect(url)` (subplan 14). It calls `provider.fetch(request, capability)`, never `capability.fetch`, which is the transport the provider itself uses.
- **One failure type for both outcomes.** The three failure kinds, `failed`, `aborted`, and `plugin-failed`, become one registry-local union type, `AttemptFailure`. `AttemptOutcome` becomes `results` or an `AttemptFailure`, which is the same shape as today, so `runWebSearch` in `src/web/search/search.ts` and every search test compile unchanged. `FetchAttemptOutcome` is `fetched`, `redirected`, or an `AttemptFailure`. `disable` and both classification helpers return `AttemptFailure`, which is what lets one copy of each serve both runners.
- **Shared guards, not copied ones.** The version check, activation, and the missing-function check move out of `runAttempt` into one private closure inside `createProviderRegistry`, `activateProvider(manifest, operation, capability, reportDisabled)`. Both runners call it first. It returns either `{ kind: 'loaded', provider }` or an `AttemptFailure`, and a runner returns the failure as is. It runs these steps in order, exactly as `runAttempt` does today:
  1. A manifest whose `apiVersion` is not `WEB_PROVIDER_API_VERSION` is disabled with `requires provider API <n>`, and its module is never activated.
  2. `loadProvider` activates the module. An import or `activate` throw goes to `classifyActivationFailure`.
  3. A module without the operation's function is disabled with that operation's reason: `provider failed: module has no provider` for search, unchanged, and `provider failed: module has no fetch` for fetch. Keep the two texts in a registry-local table keyed by operation.
  Two copies of these 20-odd lines would also be flagged by `npm run duplication` (jscpd, `.jscpd.json` reports any clone of 5 lines and 50 tokens), so sharing them is required, not optional.
- **`loadProvider` per operation (generalising subplan 2).** A registry-local `ProviderOperation` type is `'search' | 'fetch'`. Beside subplan 2's `SearchingProvider`, add `FetchingProvider`, which is `WebSearchProvider` with `fetch` required. A registry-local map type takes each operation to its narrowed provider type. Subplan 2's type predicate takes the operation as a second argument and checks that the provider's member for that operation is a function, narrowing to the mapped type. `loadProvider(manifest, operation)` resolves to that mapped type, or to `undefined` when the module lacks the function. So `runAttempt` still calls `provider.search(…)` without a cast or a non-null assertion, and `runFetchAttempt` calls `provider.fetch(…)` the same way.
- **Rename the call classifier.** `classifySearchFailure` becomes `classifyCallFailure`, since both runners send a provider-call throw to it. Its body is unchanged. Search tests never name it, because it's private.
- **No declaration check.** The runner checks the module, not the manifest. It doesn't consult `fetchFormats` or `fetchesWeb`, because only fetch resolution (subplans 4 and 5) chooses which manifests reach it. A search-only module that does reach it fails step 3 with `module has no fetch`.
- **Result validation (source plan, Registry).** A new pure module, `src/web/providers/fetch-result.ts`, exports `decodeFetchResult(value)`. It takes the `unknown` value the provider resolved to and returns the `fetched` or `redirected` outcome, or `undefined` for anything else. It also exports the `FetchAnswer` type, the union of those two outcome kinds, which `FetchAttemptOutcome` includes. It imports only `isRecord` from `../../value-guards.js` and reads fields through it, as `decodeResults` in `src/web/providers/decode.ts` does, so `no-unsafe-member-access` passes. It imports nothing from `registry.ts`, so there's no cycle. Its checks run in this order:
  1. A record whose `url` and `content` are both strings is `fetched`. Empty `content` is still `fetched`, because empty content is an answer. An empty `url` string passes too, since the source plan asks only for strings. Extra fields are ignored and never copied into the outcome. When a record carries both a page and `redirectedTo`, this check wins.
  2. Otherwise, a record whose `redirectedTo` is a non-empty string is `redirected`. The runner doesn't parse it as a URL. The provider supplies an absolute target, as subplan 12's `local` does with the target's `href`.
  3. Anything else returns `undefined`: a non-record such as a number, `null`, or an array; a record missing `content`; a non-string `url`; or an empty or non-string `redirectedTo` with no valid page.
  For `undefined`, `runFetchAttempt` disables the provider with `provider failed: fetch did not return a page`, mirroring `provider failed: search did not return an array`.
- **Expected failures (source plan, `local` fetch and Registry).** A thrown `ProviderRequestError` from `provider.fetch` is `failed` with its message and disables nothing. Any other throw, including a synchronous one, disables the provider with `provider failed: <first line>` through `errorFirstLine` in `src/error-text.ts`. Both come from `classifyCallFailure`.
- **Abort (source plan, Remote connection lines and cancellation).** The fetch path checks `capability.signal?.aborted` at the same four points `runAttempt` does today, so an attempt that sees the abort disables nothing and reports nothing. The `error` it carries matches search too:
  - an activation throw is `aborted` with the thrown error (`classifyActivationFailure`);
  - a missing `fetch` is `aborted` with `capability.signal.reason` (the shared step 3);
  - an invalid result is `aborted` with `capability.signal.reason`;
  - a throw of either kind from `fetch` is `aborted` with the thrown error (`classifyCallFailure`).
  As in search, two cases don't consult the signal. The version check disables a mismatched manifest even during an abort, because it runs before any await. And a valid page or redirect is returned even when the signal has fired; subplan 15's core checks the abort after a `fetched` or `redirected` outcome.
- **One disabled map (source plan, Disabled providers).** Every failure path in both runners goes through the one `disable` closure over the registry's single `disabled` map, which both resolutions also read (subplans 3 and 4). A first disable stores the reason and calls `reportDisabled` once. A repeat keeps the first reason and reports nothing, as today, whichever operation the repeat comes from.
- **File size.** Subplans 2 to 4 leave `registry.ts` near 135 counted lines. The fetch runner, outcome types, and generalised loader add about 60, and `activateProvider` takes about 20 out of `runAttempt`. Putting the decoder in `fetch-result.ts` keeps `registry.ts` near 175 counted lines, under the 200-line `max-lines` limit (blanks and comments skipped). Don't compact code to fit. If it still ends past 200, move `disable` and the two classification helpers into a new `src/web/providers/attempt-guards.ts`, as a factory that takes the disabled map and returns the three functions.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Search attempt runner | `runAttempt`, `loadProvider`, `disable`, `classifyActivationFailure`, `classifySearchFailure` in `src/web/providers/registry.ts` (today `src/web-search/registry.ts:44`–`176`) | Guards moved into `activateProvider` and shared; fetch is a sibling path |
| Narrowed search provider | `SearchingProvider` and its type predicate in `registry.ts` (subplan 2) | Generalised per operation |
| Fetch types | `WebFetchRequest`, `WebFetchResult` in `src/web/providers/contract.ts` (subplan 2) | Request and provider result |
| Fetch resolution | `resolveFetchAttempts` on the registry (subplan 4) | Reads the shared disabled map in the tests |
| Expected-failure type | `ProviderRequestError` in `src/web/providers/contract.ts` | Unchanged |
| Record guard | `isRecord` in `src/value-guards.ts` | Result validation |
| Decoder precedent | `decodeResults` in `src/web/providers/decode.ts` | Field reads through `isRecord` |
| First error line | `errorFirstLine` in `src/error-text.ts` | Plugin-failure reasons |

## Proposed changes

All of this lands as one change, so typecheck goes green only once every item is in.

- `src/web/providers/fetch-result.ts` (new): `FetchAnswer` and `decodeFetchResult`.
- `src/web/providers/registry.ts`:
  - `AttemptFailure`, the reshaped `AttemptOutcome`, and the exported `FetchAttemptOutcome`;
  - `ProviderOperation`, `FetchingProvider`, the operation-to-provider map type, the generalised predicate, and `loadProvider(manifest, operation)`;
  - the missing-function reason table and `activateProvider`;
  - `runAttempt` rewritten to call `activateProvider(…, 'search', …)`, its search call and array check unchanged;
  - `runFetchAttempt`, added to `ProviderRegistry` and the returned object;
  - `classifySearchFailure` renamed to `classifyCallFailure`.
  New imports are `decodeFetchResult` and, type-only, `FetchAnswer` from `./fetch-result.js`, and `WebFetchRequest` type-only from `./contract.js`.

## Tests

- `src/web/providers/fetch-result.test.ts` (new) calls `decodeFetchResult` directly:
  - a page returned with its `url` and `content`, including empty content, and with an extra field dropped;
  - a redirect returned as `redirected` with the target;
  - a record with both a page and `redirectedTo` decoded as the page;
  - `undefined` for a number, `null`, an array, a record missing `content`, a non-string `url`, an empty `redirectedTo`, and a non-string `redirectedTo`.
- `src/web/providers/registry.test.ts` gains a `WebFetchRequest` constant, a `fetchModuleFor(fetch)` helper beside `moduleFor`, and widens `abortedError` to take either outcome type. Its manifests use `fakeManifest`, with subplan 4's `fetchFormats` option where a case resolves fetch. It adds these cases:
  - a page and an empty-content page through `runFetchAttempt`, each `fetched`;
  - a cross-host redirect result, `redirected`;
  - a manifest for another API version refused with `requires provider API 2` without activation;
  - an import failure disabling the provider with `provider failed: <first line>`;
  - a module without `fetch` (the frozen fixture's search-only shape) disabled with `provider failed: module has no fetch` and reported once;
  - a fetch resolving to a number disabled with `provider failed: fetch did not return a page` and reported once (the other invalid shapes are `fetch-result.test.ts` cases);
  - a `ProviderRequestError` as `failed` with its message, not disabled;
  - an async throw and a synchronous throw from `fetch`, each disabling with its first line;
  - five abort cases mirroring the search ones (today `registry.test.ts:311`–`415`), each `aborted` with nothing disabled or reported: a `ProviderRequestError` from `fetch`, a plain rejection from `fetch`, and a `ProviderRequestError` from `activate`, each carrying the thrown error; and a module without `fetch` and an invalid result, each carrying the signal's reason;
  - a page resolved while the signal is already aborted, still `fetched`;
  - a provider disabled by a fetch refused by search: `resolveAttempts('auto', …)` skips it and `resolveAttempts('tavily', …)` prints `Web search failed (tavily): <reason>.`;
  - a provider disabled by a fetch, and so also skipped by `resolveFetchAttempts`, whose later search attempt plugin-fails too, keeps the fetch's reason and is reported once in all;
  - one module implementing both `search` and `fetch`, served by both runners;
  - a fetch-only module through `runAttempt`, disabled with `provider failed: module has no provider`.
  The opposite direction, a provider disabled by a search refused by `resolveFetchAttempts`, is already subplan 4's test.
- Every existing registry, compatibility, and search suite passes unedited, the search attempt and abort tests included.

## Documentation

None here. Subplan 12 documents the fetch half of the contract in `documentation/developer-documentation/web-search-providers.md`, including the `module has no fetch` and `fetch did not return a page` reasons. Nothing user-visible changes, so no spec moves.

## Out of scope

- Real provider fetch implementations (subplans 8, 9, 11, and 12).
- The fetch core that loops over attempts, renders, caches, and throws on abort (subplans 15 and 16).
- Any change to which manifests reach the runner (subplans 4 and 5).

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/web` so the fixture compatibility suite and the search suites run even where `--changed` would skip them. Then confirm `grep -rn classifySearchFailure src` finds nothing. There is no manual fetch check yet, because nothing calls `runFetchAttempt` from a tab until subplan 21. In a shell tab, `web search vitest` and `web search vitest --provider nope` print exactly what they printed before.
