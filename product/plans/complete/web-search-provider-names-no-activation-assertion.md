# Make the provider-names test's no-activation assertion real

**Complexity: 1/10** — a test-only assertion-order change in one existing test file, no production lines, 1 requirement, and 1 scenario (p=2.32).

## Goal

The `webSearchProviderNames()` test in `src/web-search/search.test.ts` must fail when the function activates a bundled provider module. Today it cannot: its `not.toHaveBeenCalled()` assertions run after `mockRestore()` has already cleared each spy's call history, so they pass no matter how many providers were activated.

## Issue

Recorded on PR #2010's branch backlog, severity 4/10:

> Deliver the plan's provider-names test by making its no-activation assertion able to fail.

Verified against `src/web-search/search.test.ts`, in the `the module registry` block:

- The test spies on `activate` for every manifest in `webSearchProviderCatalog` with `vi.spyOn`.
- Inside `try` it asserts `webSearchProviderNames()` equals `['tavily', 'tinyfish']`; inside `finally` it calls `activation.mockRestore()` on every spy.
- Only after the `finally` does it loop over the spies asserting `not.toHaveBeenCalled()`. `mockRestore()` resets the spy's call history, so that loop always passes, even if `webSearchProviderNames()` activated every provider.

`product/plans/complete/web-search-6-search-core.md` requires the test to prove the real catalog's names with no `activate`: "`webSearchProviderNames()` returns `['tavily', 'tinyfish']` (the real catalog, manifests only, no `activate`)."

## Approach

1. Move the `expect(activation).not.toHaveBeenCalled()` loop into the `try` block, immediately after the `expect(webSearchProviderNames()).toEqual(['tavily', 'tinyfish'])` assertion and before the `finally` restores the spies.
2. Keep the catalog spy setup, the names assertion, and the `try`/`finally` cleanup exactly as they are.

No production code changes.

## Design decisions

- **Move the assertions rather than switch to `afterEach(vi.restoreAllMocks)`.** Moving the loop is the smallest change, keeps the restore scoped to the test that created the spies, and does not alter mock lifecycle for every other test in the file.
- **Keep the `try`/`finally`.** The restore still runs when the new assertion throws, so a failure cannot leave the real catalog manifests spied for the remaining tests.
- **Keep the real catalog and its spies.** The plan's test requirement is about the real catalog's names with no activation; a fake registry would not exercise the same manifests.
- **No new assertion strategy.** `not.toHaveBeenCalled()` is already the right check; only its position relative to `mockRestore()` is wrong.

## Proposed changes

Only `src/web-search/search.test.ts` changes. The provider-names test becomes:

```ts
const activations = webSearchProviderCatalog.map((manifest) =>
  vi.spyOn(manifest, 'activate'),
);
try {
  expect(webSearchProviderNames()).toEqual(['tavily', 'tinyfish']);
  for (const activation of activations) expect(activation).not.toHaveBeenCalled();
} finally {
  for (const activation of activations) activation.mockRestore();
}
```

No production module, function, or type is added or changed, and the test file stays well under the 200-line `max-lines` limit.

## Tests

The existing provider-names test is the coverage; no new test cases are needed. Its assertions now run before the spies are restored, so an activation fails it.

Probe verification: temporarily make `webSearchProviderNames()` call one catalog manifest's `activate` (or `webSearchProviderCatalog[0].activate()`), confirm the provider-names test fails on the activation assertion, then revert the probe and confirm the test passes again.

The rest of `search.test.ts` must keep passing unchanged.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Temporary activation probe fails the provider-names test, then the reverted tree passes.

## Spec

No `./product/specs/` update. This is a test-only change with no user-visible behavior change, and the web search behavior spec does not exist on this branch yet; it is deferred to a later documentation slice, as `./product/plans/complete/web-search-reject-on-every-abort.md` records.

## Documentation

None needed. No `help/` or `documentation/user-documentation/` page describes test internals.

## Out of scope

- Any change to `src/web-search/search.ts`, `src/web-search/registry.ts`, the catalog, or the providers.
- Making an activation performed while the module registry is created at import time observable; the test cannot see state that predates its own spies, and the proposal risk records that limit.
- The other recorded entries on the branch backlog.
