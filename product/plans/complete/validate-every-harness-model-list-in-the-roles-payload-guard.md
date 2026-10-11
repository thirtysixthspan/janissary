# Validate every harness model list in the roles payload guard

**Complexity: 3/10** — one predicate and its tests, plus a boundary test on the client side that already loads every plugin entry. No behavior, contract, or file change: the guard is right about everything except one field, and the fix is to make it say what it claims.

`isRolesPayload` asserts that `catalog` is an object and that `catalog.models` is a non-null object (`src/plugins/roles/shared.ts`), and then stops. The declared type beside it is `LaunchCatalog = { models: Record<string, string[]>; efforts: string[] }`, and the tab consumes `catalog.models` two ways that assume the inner half: `Object.entries(catalog.models)` in the catalog column and `models[pickHarness]` behind the picker's harness dropdown. Both are only safe when every value is an array of strings. A `null` models list, an array of arrays, a harness mapped to the string `codex`, or a list with one non-string member all pass the guard today and reach `Object.entries(...).map` or `.map` inside React children, where the boundary error the guard exists to prevent has already become a render failure that takes the whole tab with it.

The host builds this catalog (`harnessLaunchCatalog` in `src/plugins/context.ts`), so nothing produces a malformed one today. The guard is a boundary against a broken or out-of-date plugin, and a boundary that validates three of four levels of the thing it guards is not the boundary the type says it is.

## Goal

- The guard accepts `catalog.models` only as a record whose every own value is an array of strings, which is what `LaunchCatalog` claims.
- The client boundary refuses such a payload before `RolesTab` renders, proven by a test that goes through the entry's own exported guard.
- A role whose stored harness, model, or effort is not in the catalog still opens: a stale entry is a warning the plan deferred, not a refusal.

## Design decisions

- **Complete the predicate rather than cast around it.** The alternative — asserting the type and letting TypeScript treat a checked-but-unproven value as proved — would move the failure from a boundary error to a render error without moving it earlier, which is the opposite of what a guard is for.
- **An empty catalog is valid.** `harnessLaunchCatalog` answers an empty catalog to a plugin whose capability was revoked, so `{ models: {}, efforts: [] }` has to pass; only the *shape* of each value is new, never its presence.
- **Every own value, not just the ones a caller reads.** `Object.values` walks everything the guard is handed, so a malformed harness nobody looks at today still fails the payload rather than waiting for the day someone drags onto it.
- **The stored roles stay outside this check.** Entries carry any harness and model the file holds, and the plan that built the tab deferred warning about them. Widening the refusal to entries would turn the deferred warning into a hard block, which is a different decision.
- **The client test goes through the entry, not the source module.** Importing the guard directly would prove the source; loading `clientPluginLoaders.roles()` and calling the module's own exported `isPayload` proves the boundary the host actually runs, at the same lazy chunk the tab uses.

## Implementation steps

1. **`src/plugins/roles/shared.ts`.** Add a local `isModelCatalog` predicate — a record whose every own value is an array containing only strings — and use it for `catalog.models` in `isRolesPayload`, replacing the bare `typeof === 'object'` pair.
2. **`src/plugins/roles/shared.test.ts`** (new) — the predicate's cases.
3. **`web/src/plugins/registry.test.tsx`** — load the roles entry and assert its guard refuses the malformed catalogs and accepts a populated one.

## Tests

`src/plugins/roles/shared.test.ts`:

- A payload with an array for `models`, `null`, a scalar harness value, a model list holding a non-string, and an empty-but-well-typed catalog: each of the first four refused, the last accepted.
- A populated catalog accepted, and a role whose harness, model, and effort are all outside it still accepted, pinning the deferred stale-entry rule.

`web/src/plugins/registry.test.tsx`:

- The roles entry's exported guard refuses a payload whose model list is not an array of strings and accepts one that is, so nothing malformed reaches `RolesTab`.

## Out of scope

- Validating anything else about a payload the guard already accepts, including the entry objects inside a role.
- Warning about a stored role naming a harness or model the catalog does not offer. That is the plan's deferred stale-entry work and stays deferred.
- Changing the host's catalog construction, which already produces the shape the guard now requires.

## Verification

- `./scripts/run.mjs check-diff` is clean: lint, both typechecks, and the roles tests plus the client registry test.
- Manual check: none available from the UI, since the host never produces a malformed catalog; the boundary test is the check, and it fails the moment the guard is weakened.