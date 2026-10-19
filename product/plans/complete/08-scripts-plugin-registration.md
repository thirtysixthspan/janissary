# Scripts tab plugin registration
**Complexity: 2/10** — three literal registrations that the `satisfies` types hold to parity, plus the existing tests that enumerate them; this is the step that makes `scripts` a live command in the running app.

## Goal

Register the scripts plugin in the production catalog, the server loader map, and the client registry, so the `scripts` command opens the tab in a running app. Add the tests that show the registration is complete and that the client entry loads lazily.

## Design decisions and dependencies

This subplan depends on `05-scripts-plugin-server`, `06-scripts-client-list`, and `07-scripts-client-row-actions`, because every module it names must exist. It also depends on `04-runscripts-topic-and-actions`, because the manifest's topic has to be known.

- The three entries land together in this subplan. `tabPluginLoaders` in `src/plugins/loaders.ts` is typed `satisfies Record<ProductionTabPluginId, TabPluginLoader>`. `clientPluginLoaders` in `web/src/plugins/registry.tsx` is typed `satisfies Record<ProductionTabPluginId, () => Promise<unknown>>`, and the object literal passed to `createClientPluginRegistry` for `clientPluginRegistry` is typed `satisfies Record<ProductionTabPluginId, ClientPluginRegistration>`. `ProductionTabPluginId` is derived from the `tabPluginCatalog` array, so a catalog entry without its server loader, client loader, and client registry entry fails typecheck. For the same reason, no earlier subplan adds the catalog entry.
- The imports are literal. The server loader is `() => import('./scripts/activate.js')`. The client loader map gets `scripts: () => import('./scripts/index')`, and the registry gets `scripts: clientPlugin(1, clientPluginLoaders.scripts)`. The schema literal 1 must equal `SCRIPTS_PAYLOAD_SCHEMA_VERSION` in `src/plugins/scripts/shared.ts`, which the manifest's `payloadSchemaVersion` also uses. `web/src/plugins/registry.test.tsx` pins the literal, as described under Tests. If the two ever differ, `web/src/plugins/PluginBody.tsx` (its `registration.schemaVersion !== plugin.schemaVersion` check) replaces the tab with a payload schema failure, and the pin test catches that before it ships.
- The command claim is admitted. `createPluginCommands` in `src/plugins/command-adapter.ts` refuses a claim only when a core command answers to that bare name (its `match` accepts the name) or when the name is in `RESERVED_NON_COMMAND_NAMES` (`src/commands/reserved.ts`, which holds only `help`). No core command is named `scripts`, and no core `match` accepts a bare `scripts` token, so the claim is admitted and the plugin's command answers `scripts` and `scripts left`. The test in this subplan checks that the claim is admitted and that it routes.
- The lazy client chunk is loaded only when a scripts tab exists. `clientPlugin` in `web/src/plugins/registry.tsx` wraps each loader in a `React.lazy`, and that `React.lazy` is created when the registry is built at module scope. React runs the loader only when the tab's component first renders, so in the running app the chunk stays out of the entry bundle until a scripts tab mounts. This subplan checks the static-import side with a source-read test in `web/src/plugins/registry.test.tsx`, the approach that `web/src/overlay-plugins/registry.test.ts` and `web/src/editor/plugins/registry.test.ts` already use for their registries. The production build and the chunk check are in `10`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Production catalog | `src/plugins/catalog.ts` (`tabPluginCatalog`) | Adds `scriptsManifest` between `schedulesManifest` and `searchManifest`, in the import block and in the array. |
| Server loader map | `src/plugins/loaders.ts` (`tabPluginLoaders`) | Adds the `scripts` key between `schedules` and `search`. |
| Client loader map and registry | `web/src/plugins/registry.tsx` (`clientPluginLoaders`, `clientPluginRegistry`) | Adds the `scripts` keys between `schedules` and `search` in both maps. |
| Loader coverage tests | `src/plugins/loaders.test.ts`, `src/plugins/host.test.ts` (around line 72) | Both pass once the key is added. `host.test.ts` repeats the loader-to-catalog parity check. |
| Registry tests | `web/src/plugins/registry.test.tsx` | Pins the `scripts` literal to the shared constant and gets the lazy-import test. The existing loop over every loader already loads the new entry. |
| Command collision rule | `src/plugins/command-adapter.ts` (`createPluginCommands`) | Admits the `scripts` claim. |
| Core-only command list | `src/plugins/adapters.test.ts` (`coreCommands`, lines 22 to 24) | Copied into the manifest test. `commands` cannot be used, because it already holds the plugin's generated `scripts` command and would reserve the name against the plugin itself. |
| Source-read lazy precedent | `web/src/overlay-plugins/registry.test.ts` (lines 46 to 52), `web/src/editor/plugins/registry.test.ts` (lines 49 to 55) | The pattern for the static-import test. |
| Command ordering, sample, and routing tests | `src/commands.test.ts` | The sample, priority, and `findCommand` tests cover the new command with no edit. The routing assertions added here go in this file. |

## Proposed changes

- `src/plugins/catalog.ts`: import `scriptsManifest` from `./scripts/manifest.js` on the line after the `schedulesManifest` import and before the `searchManifest` import, and add it to the `tabPluginCatalog` array between `schedulesManifest` and `searchManifest`. The `as const satisfies readonly TabPluginDeclaration[]` form does not change.
- `src/plugins/loaders.ts`: add `scripts: () => import('./scripts/activate.js')` to `tabPluginLoaders` between the `schedules` and `search` keys.
- `web/src/plugins/registry.tsx`: add `scripts: () => import('./scripts/index')` to `clientPluginLoaders` between its `schedules` and `search` keys, and add `scripts: clientPlugin(1, clientPluginLoaders.scripts)` to the object passed to `createClientPluginRegistry` in the same position.

Nothing else changes in this subplan. The only new file is `src/plugins/scripts/manifest.test.ts`, and `web/src/plugins/scripts/index.test.tsx` stays as `06` wrote it. The docs for the command are in `09`.

## Tests

- In `src/plugins/loaders.test.ts` (existing, no edit): the test that the loader map holds a loader for every bundled plugin and nothing beyond them passes with the new key, and so does the `it.each` test that resolves each loader to a module with an `activate` function, which now includes `./scripts/activate.js`. `src/plugins/host.test.ts` (around line 72) asserts the same loader-to-catalog parity and passes too.
- In `src/plugins/scripts/manifest.test.ts` (new, vitest in the style of `src/plugins/scripts/shared.test.ts`): the test imports `scriptsManifest` from `./manifest.js`, `tabPluginCatalog` from `../catalog.js`, `createPluginCommands` from `../command-adapter.js`, and the ledger helpers `clearContributionRejections` and `contributionRejection` from `../rejections.js`. Test files are exempt from the plugin boundary rules in `eslint.plugin-boundaries.mjs`, so these imports lint. It asserts:
  - the catalog holds `scriptsManifest` by identity;
  - `id` and `command` are `scripts`, `notifications` is exactly `['runscripts']`, and `capabilities` does not contain `dockTab`;
  - `apiVersion` equals `TAB_PLUGIN_API_VERSION` and `payloadSchemaVersion` equals `SCRIPTS_PAYLOAD_SCHEMA_VERSION`, compared with the constants rather than with literals (the API constant is 2 in `src/plugins/api-capabilities.ts` today, and the schema constant is 1);
  - the claim is admitted: after `clearContributionRejections()`, `createPluginCommands(tabPluginCatalog, coreOnly)` returns exactly one command named `scripts`, `contributionRejection('scripts')` is undefined, and that command's `match` accepts `scripts` and `scripts left`.

  `coreOnly` is built the way `coreCommands()` is built at `src/plugins/adapters.test.ts` lines 22 to 24: the `commands` export of `../commands/index.js` filtered to the entries whose `run` does not call `runCommand`. The ledger is cleared first because importing `commands/index.js` already ran the production adapter, and any refusal that run recorded would otherwise be read as this test's result.
- In `web/src/plugins/registry.test.tsx` (existing): import `SCRIPTS_PAYLOAD_SCHEMA_VERSION` and `isScriptsPayload` from `@shared/plugins/scripts/shared`, add a `scripts` line to the existing schema-pin test so that `clientPluginRegistry.get('scripts')?.schemaVersion` equals `SCRIPTS_PAYLOAD_SCHEMA_VERSION`, and add a test in the style of `web/src/overlay-plugins/registry.test.ts` (lines 46 to 52). That test reads `web/src/plugins/registry.tsx` from the repository root with `readFileSync`, asserts that no static import path in it contains `scripts`, and asserts that the source contains `scripts: () => import('./scripts/index')`. A second test awaits `clientPluginLoaders.scripts()` and asserts that the resolved module's `isPayload` is `isScriptsPayload`. The existing loops over every loader already check that the new entry resolves with a default export and a guard.
- `web/src/plugins/scripts/index.test.tsx` (from `06`): no change. It already pins the entry's default export to `ScriptsTab` and its `isPayload` to the shared guard. The registry-level assertions sit in `registry.test.tsx` because the literal import lives in `registry.tsx`. The "not loaded until first rendered" property is pinned by the static-import test above rather than by a runtime test, because a runtime check would have to mock the dynamic import, and the source read is the pattern the overlay and editor registries use for this property.
- In `src/commands.test.ts` (existing): the sample test (every registered command declares a sample), the priority walk, and the `findCommand` checks already cover the new command with no edit. Add a `describe` block asserting that `resolveCommand('scripts')` and `resolveCommand('scripts left')` each return `{ kind: 'app', name: 'scripts', cmd }`, where `cmd` is the input, as `src/commands/resolve.test.ts` does for `video` (line 60). The file already imports `resolveCommand`.
- The frozen fixture tests (`src/plugins/fixture-v1/compatibility.test.ts` and `web/src/plugins/fixture-v1/compatibility.test.tsx`) pin the contract, which this subplan does not change, so they need no edit here.

## Verification

Run `./scripts/run.mjs check-diff`. Before this subplan, `src/plugins/catalog.ts` has 24 code lines, `src/plugins/loaders.ts` has 21, and `web/src/plugins/registry.tsx` has 77, counting only the lines that are not blank and not `//` comments, which is what the `max-lines` rule counts in these files. Each addition is one or two lines, so all three stay far under 200 and no extraction is planned. Confirm that `web/src/plugins/registry.tsx` still uses only literal imports. The source-read test above enforces that, and a grep for `scripts/index` in the file should match only the one `import()` line.

The first live check uses the `run` skill to launch the app in a project with two runscripts. Type `scripts` in the command bar, and a tab titled `scripts` opens and lists both runscripts in alphabetical order. Then type `scripts left`, and then `scripts` again: the same tab is focused, and no second tab opens. Before this subplan, the same input answers `Unknown command: "scripts"`, so the change is visible. `10` runs the full two-project walk and the production build.

## Out of scope

- The production build and the chunk check, which are in `10`.
- The help row and the spec, which are in `09`.
- Any change to the catalog rule, the command resolution order, or the registry's shape.
