# Scripts tab plugin server modules
**Complexity: 3/10** — three small server modules shaped like the schedules plugin, with commands and intents routed through the topic built in `04`; nothing is registered yet.

## Goal

Create `src/plugins/scripts/` with the manifest, the import-free shared contract, and the activation. The activation claims the `scripts` command, opens or focuses the singleton tab, routes the five client intents to topic actions, and folds topic changes into the open tab. The plugin is not added to the catalog or the loader map until `08-scripts-plugin-registration`.

## Design decisions and dependencies

This subplan depends on `04-runscripts-topic-and-actions`. The manifest's `notifications: ['runscripts']` only passes validation once `runscripts` is a known topic, and the activation calls the topic actions defined there.

- The manifest declares `id: 'scripts'`, `version: '1.0.0'`, `apiVersion: TAB_PLUGIN_API_VERSION`, `payloadSchemaVersion` set to the shared constant (1), `tabLabelPrefix: 'scripts'`, an empty `fileExtensions`, `command: 'scripts'`, `notifications: ['runscripts']`, and the capabilities `openOrFocusTab`, `updateTab`, `topicData`, `topicAction`, `originTab`, `rejectRequest`, and `reportFailure`. It does not request `dockTab`, because the tab is centre-only. It does not use `defineDockableList`, which always docks and would also open the tab with a dock argument.
- No built-in command matches `scripts`. The `schedule` command matches only `^schedule\b`, and no other command's match accepts it, so `createPluginCommands` admits the claim. The catalog test in `08` checks this.
- The shared contract in `shared.ts` re-declares the row shape `{ name, schedules, open }` and the payload `{ rows }`, the same way `src/plugins/schedules/shared.ts` re-declares its row. A shared test pins the shapes to the host's types. The file imports nothing.
- The command ignores its argument, so `scripts left` opens the tab as a plain `scripts` does. Its order of work is: call `ensureDirectory` through `topicAction` with the origin label, read `topicData('runscripts')`, check the result with the shared guard, and then call `openOrFocusTab('scripts', ...)` with the title `scripts`. If the guard fails, the command reports a failure. The factory itself does no work, because the factory is the one place where resources may be registered, and this plugin registers none.
- The origin label comes from `originTab()` in the command and in each intent. The intent's `originTab()` is the scripts tab that sent it, so the feed attributes failures to that tab.
- The notify handler replaces the tab payload with the rows through `updateTab` and leaves the title alone. A slice that fails the guard is ignored rather than mapped, as the notify path of `defineDockableList` does. A delivery that fails the guard means the host and the plugin disagree about the shape, and mapping it would be wrong.
- The five intents (`execute`, `delete`, `clone`, `create`, `open`) are a table built with `defineIntents`, which handles the tab-payload check, unknown names, and bad payloads. Each entry sends its topic action with the origin and, where there is one, the name. Each returns `null`. A malformed payload or unknown name is a rejection. A tab payload that fails the guard is a failure, which is how `defineIntents` already treats it. If `originTab()` returns `null`, the entry does nothing.
- The `create` payload is an empty object, so the ingress check for a present payload passes.
- Names are passed through unchanged. The host checks them against `isRunscriptName`, so the plugin does no name validation of its own.
- The activation has no `dispose`. The plugin acquires nothing. The refresh belongs to the host and is released by `TabPluginHost.dispose` (see `03`). The source plan's "disposal releases what the tab acquired" test therefore becomes a check that the activation holds nothing to release.
- The activation provides `opener: noFileOpener('scripts')`, as the schedules plugin does, because the interface requires an opener.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Schedules plugin shape | `src/plugins/schedules/manifest.ts`, `shared.ts`, `activate.ts` | Pattern for the three files. |
| Intent table | `src/plugins/define-intents.ts` (`defineIntents`) | Used for the five intents. |
| No-file opener | `src/plugins/no-file-opener.ts` (`noFileOpener`) | Used for the required opener. |
| Plugin API surface | `src/plugins/api.ts` (only `../api.js` may be imported) | Source of `TAB_PLUGIN_API_VERSION`, the types, `defineIntents`, and `noFileOpener`. The boundary lint rule permits only `../api.js` and the plugin's own files. |
| Capability names | `src/plugins/api-capabilities.ts` | The capability list in the manifest must match these names. |
| Topic action shapes | `src/plugins/api-topics.ts` (from `04`) | The type the activation sends. |

## Proposed changes

- `src/plugins/scripts/manifest.ts` (new): export `scriptsManifest` as a constant that satisfies `TabPluginDeclaration`, shaped like `src/plugins/schedules/manifest.ts`.
- `src/plugins/scripts/shared.ts` (new): export `SCRIPTS_PAYLOAD_SCHEMA_VERSION` (1), the row and payload types, the intent payload types, and the guards `isScriptsPayload`, `isRunscriptsData` (for the topic slice), `isNameIntent`, and `isCreateIntent`. The file imports nothing.
- `src/plugins/scripts/activate.ts` (new): export `activate()`. It returns the opener, the `command` handler, the `notify` handler, and the `intent` handler built by `defineIntents`. If the file grows past about 180 code lines, move the intent table into `src/plugins/scripts/intents.ts`, which imports only `./shared.js` and `../api.js`.

## Tests

- In `src/plugins/scripts/activate.test.ts` (new), using fake capabilities in the same style as `src/plugins/schedules/activate.test.ts`:
  - The `scripts` command calls `ensureDirectory` through `topicAction` with the origin label, reads `topicData('runscripts')`, and opens the singleton with title `scripts` and the rows it was given.
  - A second `scripts` call passes the same instance key `scripts` to `openOrFocusTab`, so the host focuses the open tab.
  - `scripts left` and `scripts right` open the tab as a bare `scripts` does, and no dock call is made.
  - A `runscripts` notification replaces the tab's payload through `updateTab` and does not send a title. A notification whose data fails the guard causes no `updateTab` call.
  - Each of the five intents sends the topic action it names, carries the origin from `originTab()`, and returns `null`. The `create` intent sends no name.
  - A malformed payload on an intent is rejected, not treated as a failure. An unknown intent name is rejected. An invalid tab payload is reported as a failure.
  - When `originTab()` returns `null`, an intent sends no topic action and still returns `null`.
  - The activation has no `dispose` function.
- In `src/plugins/scripts/shared.test.ts` (new): `isScriptsPayload` accepts a complete payload and rejects `null`, an array, a missing `rows`, a row with a non-string name, a non-numeric `schedules`, and a non-boolean `open`. The intent guards reject arrays and `null`. `isRunscriptsData` matches the same rules. A type-level pin checks that `RunscriptRow` in `shared.ts` equals the host's `RunscriptRowView`.

## Verification

Run `./scripts/run.mjs check-diff`. Confirm by reading the imports that `src/plugins/scripts/activate.ts` and `manifest.ts` import only `../api.js` and their own files, which the boundary rule enforces. The plugin is not registered yet, so the running app does not change in this subplan.

## Out of scope

- The catalog, loader, and client registry entries. Those are in `08`.
- The client entry and its components. Those are in `06` and `07`.
- Docking, `dockTab`, and any capability beyond the seven listed.
- Any host state beyond the `runscripts` topic.
