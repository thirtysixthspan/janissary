# Test disabled and hidden model lookups

**Complexity: 2/10** — one focused compatibility API test and a short spec clarification pin the two model-availability flags.

## Goal

Pin the lookup contract that disabled models are unavailable for launch while hidden models remain available outside the models list.

## Approach

Add a test to `src/models/catalog-file.test.ts` using the temporary project override and the existing `loadHarnessModels` setup. The fixture has one disabled model, one hidden model, and one ordinary model. Assert that `modelsFor('claude')` returns the hidden and ordinary ids in order, `isKnownModel` rejects the disabled id, and it accepts the hidden and ordinary ids. Keep the existing `afterEach` cleanup so the module-level lookup state resets to the bundled catalog.

Clarify `product/specs/harness.md` that `hidden` affects visibility in the models list only and does not remove a model from launch choices. This matches the current lookup implementation and the catalog record contract.

## Tests

Run `./scripts/run.mjs check-diff` after the test change. The focused assertions must fail if disabled records are returned or accepted, or if hidden records are removed from either lookup.

## Out of scope

- Provider refresh, the catalog manager, consumer migration, and the models tab implementation.
- Changing the lookup implementation or model record format.
- Help or user-documentation changes; this work clarifies the existing harness model-catalog spec only.
