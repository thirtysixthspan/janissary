# Memoise the application command inventory

**Complexity: 2/10** — one module-level cache in `src/application-commands.ts`; the inventory depends only on static registries, and no caller mutates the returned rows.

`listApplicationCommands` rebuilt, normalized, and sorted roughly a hundred rows on every dispatch, completion, and settings snapshot.

## Goal

Build the sorted inventory once, lazily, and return the cached array from every later call, with no behavior change.

## Approach

1. Rename the builder to `buildApplicationCommands` and keep `listApplicationCommands` as a lazy `??=` accessor over a module-level cache.
2. The backlog proposal's exported reset is not needed: `pluginCommandClaims` and the plugin catalog are static, and `application-commands.claims.test.ts` installs its `vi.mock` before the first call in its own module graph, so the cache is built from the mocked catalog. Adding an unused export is avoided.

## Implementation steps

1. Edit `src/application-commands.ts`.
2. Add `src/application-commands.cache.test.ts`; existing tests stay untouched.
3. Add one sentence to `product/specs/application-commands.md`.

## Tests

- Repeated `listApplicationCommands()` calls return the same sorted array.
- Repeated resolution leaves the cached rows unchanged.
- Existing `application-commands.test.ts`, `application-commands.claims.test.ts`, and `native-commands/manager.test.ts` pass untouched.

## Out of scope

- Cache invalidation for runtime catalog changes (the catalog is static).
- Any change to the returned row shapes or to resolution logic.
