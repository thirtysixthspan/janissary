# Give each web search provider attempt its own request object

**Complexity: 2/10** — 5 added lines in 1 existing file, 4 requirements, 3 test scenarios, no new units (p=3.91).

## Goal

`runWebSearch` must hand every provider attempt a request object of its own, built from the parsed command, so a provider that normalizes or annotates the request it receives cannot change the query, result count, or depth a later fallback provider gets.

## Issue

Recorded on PR #2010's branch backlog, severity 3/10:

> Remove the shared-request debt by giving each provider attempt its own request object.

Verified against `src/web-search/search.ts`:

- `runWebSearch` builds the `providerRequest` literal before `for (const manifest of resolution.manifests)` and passes that same object to every `registry.runAttempt` call, so all attempts share it.
- The literal's type is `WebSearchRequest`, whose three fields are mutable, so a provider that assigns to `request.numResults`, `request.query`, or `request.depth` in place silently changes what the next fallback provider receives.
- The capability object is already rebuilt inside the loop, so the request is the only per-attempt input still shared between attempts.
- `product/plans/complete/web-search-6-search-core.md` directs building "the request and capability" for each manifest in order, and its `Request and capability` decision describes the provider-facing request as coming from the command per attempt.

## Approach

1. Move the `providerRequest` literal from before the loop to inside it, immediately after `deps.signal?.throwIfAborted()` and next to the `capability` literal, so each attempt receives a fresh `{ query: request.query, numResults: request.numResults, depth: request.depth }` copied from the command.
2. Extend `src/web-search/search.test.ts` with a test in which the first provider mutates its request, the second provider succeeds, and the assertions cover both what the second provider sees and what the search renders.
3. State the per-attempt request guarantee in the developer provider reference where it already describes what each attempt receives.

## Design decisions

- **Build the request per attempt from the command, not from the previous attempt's object.** Copying the command's fields on every iteration is what confines a mutation to the attempt that made it; there is no earlier request object left to clone.
- **No freeze and no readonly type.** A provider may still mutate its own request; the change only stops that mutation from reaching a later attempt, matching the recorded proposal risk. `Object.freeze` or a `Readonly<WebSearchRequest>` would change what providers are allowed to do at the boundary and is not needed for this fix.
- **Rendering keeps reading the command.** `renderSearch` already takes the `WebSearchCommand`, so the cut count and the no-results query come from the command rather than an attempt's copy. Nothing there changes.
- **No behavior change for the bundled providers.** Neither bundled provider mutates its request, so output, fallback order, failure lines, resolution lines, and abort handling are unchanged.
- **One test, not a new suite.** The existing request-and-capability shape test already pins the first attempt's request values; the new test pins the second attempt's values after a first attempt mutates its copy.

## Proposed changes

Only `src/web-search/search.ts` changes. The literal moves inside the loop, keeping its `WebSearchRequest` type annotation so the contract import stays in use:

```ts
  const failures: ProviderFailure[] = [];
  for (const manifest of resolution.manifests) {
    deps.signal?.throwIfAborted();
    const providerRequest: WebSearchRequest = {
      query: request.query,
      numResults: request.numResults,
      depth: request.depth,
    };
    const capability: WebSearchCapability = {
      apiKey: deps.tokens[manifest.token] ?? '',
      fetch: deps.fetch,
      signal: deps.signal,
    };
    const outcome = await registry.runAttempt(
      manifest,
      providerRequest,
      capability,
      deps.reportDisabled,
    );
```

No new module, function, or type. The file stays well under the 200-line `max-lines` limit (~67 lines).

## Tests

Extend `src/web-search/search.test.ts` in the existing `describe('runWebSearch')` block with one test, using the existing `fakeProvider`, `registryWith`, `command`, and `result` helpers:

- **A mutation stays inside its attempt** — a fake `tavily` provider sets `request.numResults = 1` (and also changes `request.query` and `request.depth`, so every copied field is exercised) and then throws `new ProviderRequestError('HTTP 429 Too Many Requests')` so the search falls back; a fake `tinyfish` provider returns five results.
  - The second provider's first call argument must `toStrictEqual({ query: QUERY, numResults: 5, depth: 'basic' })`, the command's original values.
  - The output must list all five results, so the cut still comes from the command's `numResults` and not from the mutated copy.
  - Both providers must have been called once, pinning that the fallback itself still works.

The existing request-and-capability shape test, every fallback test, and every resolution, abort, and rendering test must keep passing unchanged.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Confirm the new test's second-provider assertion fails against the current `src/web-search/search.ts` before the source change and passes after it.

## Spec

No `./product/specs/` update. The web search behavior spec does not exist yet on this branch; `./product/plans/ready/web-search-10-typed-command.md` creates it in a later documentation slice, and `./product/plans/complete/web-search-reject-on-every-abort.md` already recorded the same deferral. No bundled provider mutates its request, and no user-visible message, output, or resolution behavior changes, so there is no behavior for a spec to state here.

## Documentation

Update the closing sentence of the "The capability" section in `documentation/developer-documentation/web-search-providers.md`, which already says each attempt gets a fresh capability, to state that each attempt also gets its own request object, so a provider that mutates the request it receives leaves a later fallback attempt's request unchanged. No `help/` page or `documentation/user-documentation/` page describes this boundary.

## Out of scope

- Freezing the request object, making `WebSearchRequest` readonly, or otherwise changing what a provider may do with the object it receives.
- Changing `src/web-search/registry.ts`, the bundled providers, rendering, failure-line formatting, resolution, or abort handling.
- Writing the web search behavior spec ahead of its documentation slice.
- Any other work item on PR #2010's branch backlog.
