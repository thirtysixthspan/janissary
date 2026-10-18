# Scripts tab plugin registration
**Complexity: 2/10** — three literal registrations and the existing tests that enumerate the catalog; this is the step that makes `scripts` a live command in the running app.

## Goal

Register the scripts plugin in the production catalog, the server loader map, and the client registry, so the `scripts` command opens the tab in a running app. Add the tests that show the registration is complete and that the client entry loads lazily.

## Design decisions and dependencies

This subplan depends on `05-scripts-plugin-server`, `06-scripts-client-list`, and `07-scripts-client-row-actions`, because every module it names must exist. It also depends on `04-runscripts-topic-and-actions`, because the manifest's topic has to be known.

- The three entries land together in this subplan. `tabPluginLoaders` is typed `satisfies Record<ProductionTabPluginId, TabPluginLoader>`, and `clientPluginRegistry` is typed `satisfies Record<ProductionTabPluginId, ClientPluginRegistration>`. A catalog entry without its loader and client entry fails typecheck. For the same reason, no earlier subplan adds the catalog entry.
- The imports are literal. The server loader is `() => import('./scripts/activate.js')`. The client loader map gets `scripts: () => import('./scripts/index')`, and the registry gets `scripts: clientPlugin(1, clientPluginLoaders.scripts)`. The schema literal 1 is pinned against the shared constant by `web/src/plugins/registry.test.tsx`.
- The command claim is admitted. `createPluginCommands` refuses a claim only when a built-in answers to that name, and none does for `scripts`. The test in this subplan checks that the claim is admitted and that it routes.
- The lazy client chunk is loaded only when a scripts tab exists. That is how the existing registry works, and this subplan checks it with a test. The production build and the chunk check are in `10`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Production catalog | `src/plugins/catalog.ts` (`tabPluginCatalog`) | Adds `scriptsManifest` in alphabetical position. |
| Server loader map | `src/plugins/loaders.ts` (`tabPluginLoaders`) | Adds the `scripts` entry. |
| Client loader map and registry | `web/src/plugins/registry.tsx` (`clientPluginLoaders`, `clientPluginRegistry`) | Adds the `scripts` entries. |
| Loader coverage test | `src/plugins/loaders.test.ts` | Passes once the key is added. |
| Registry schema test | `web/src/plugins/registry.test.tsx` | Pins the `scripts` literal to the shared constant. |
| Command collision rule | `src/plugins/command-adapter.ts` (`createPluginCommands`) | Admits the `scripts` claim. |
| Command ordering and sample tests | `src/commands.test.ts` | Must keep passing with the new command. |

## Proposed changes

- `src/plugins/catalog.ts`: import `scriptsManifest` from `./scripts/manifest.js` and add it to the array in alphabetical position.
- `src/plugins/loaders.ts`: add `scripts: () => import('./scripts/activate.js')` in alphabetical position.
- `web/src/plugins/registry.tsx`: add `scripts: () => import('./scripts/index')` to `clientPluginLoaders`, and `scripts: clientPlugin(1, clientPluginLoaders.scripts)` to `clientPluginRegistry`, in alphabetical position.

Nothing else changes in this subplan. The docs for the command are in `09`.

## Tests

- In `src/plugins/loaders.test.ts` (existing): the test that the loader map covers every bundled plugin and nothing beyond them passes with the new key.
- In `src/plugins/scripts/manifest.test.ts` (new): the manifest is in the production catalog. It claims exactly the command `scripts`, its only notification topic is `runscripts`, and it declares no `dockTab` capability. `createPluginCommands` given the catalog and the core commands admits `scripts` and produces a command that matches the input `scripts` and `scripts left`.
- In `web/src/plugins/registry.test.tsx` (existing): the `scripts` schema literal equals `SCRIPTS_PAYLOAD_SCHEMA_VERSION`.
- In `web/src/plugins/scripts/index.test.tsx` (from `06`, extended): `clientPluginRegistry.get('scripts')` exists. Its lazy component resolves to a module whose default export is a component and whose `isPayload` is the shared guard, and the module is not loaded until the component is first rendered.
- In `src/commands.test.ts` (existing): every registered command declares at least one sample, and the routing tests still pass with `scripts` present.

## Verification

Run `./scripts/run.mjs check-diff`. Confirm that the three edited files each stay under 200 code lines. Confirm that `web/src/plugins/registry.tsx` still uses only literal imports and that no static import of `./scripts/index` appears in it.

## Out of scope

- The production build and the chunk check, which are in `10`.
- The help row and the spec, which are in `09`.
- Any change to the catalog rule, the command resolution order, or the registry's shape.
