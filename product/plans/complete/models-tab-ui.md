# Models tab UI

**Complexity: 5/10** — this is a complete server-and-client plugin surface with dockable table rendering, guarded actions, and focused UI tests, built on the existing list-tab pattern.

## Goal

Add a singleton `models` tab that groups visible catalog records by provider and lets a user refresh provider data or hide and disable an entry after confirmation.

## Decisions and dependencies

- Depends on `models-host-topic.md`; catalog behavior, record format, and server lookups are delivered by earlier subplans.
- Reuse the sessions tab's command grammar, dock behavior, metadata header, narrow rows, and confirmation-dialog pattern. `models` opens or focuses the singleton tab titled `models`; `models left` and `models right` dock it. A bare `models` returns a docked tab to the center. Any other argument is refused with `Usage: models [left|right]`.
- The center table has Model, Name, Harness, and actions columns. Docked rows stack id/actions above name/harness. Missing names fall back to ids. Provider group headings and order follow the canonical source plan. Hidden rows are absent; disabled rows are dimmed and have no Delete control.
- The headings are `Anthropic` for claude, `OpenAI` for codex, and opencode groups from the id prefix: `OpenCode Zen`, `OpenCode Go`, `Google`, `OpenAI`, or the raw unknown prefix. An opencode id without `/` stays under `opencode`. Groups follow catalog order: claude, codex, then opencode prefixes in first-seen order. New prefixes appended by Refresh appear last. An empty visible catalog reads `No models` without column headings.
- The header is a full-width metadata bar; Refresh is to the left of the host split control (center) or dock-cycle control (docked), and the controls sit at the right. Table classes start with `models-`, horizontal padding is 12px, and the actions column has a fixed width.
- The client is a thin rendering layer: group calculation and catalog state come from the server topic. Refresh only starts after the user presses Refresh, and all clients show a disabled spinning icon while `refreshing` is true.
- Map the topic's `ModelGroup.heading` to the UI group's `label` and `ModelGroup.records` to its `rows`. Derive each row's `harness` from the group key: `opencode` for keys beginning `opencode:`, otherwise the group key. Copy `id` and `name`, and normalize the optional topic `disabled` flag to a boolean in the client payload.
- The Delete button is a right-aligned icon-only `faTrash` control with accessible label `Delete <id>`. Deleting asks through `ConfirmDialog` with title `Delete <model id>?` and button `Delete`, sets both flags through the topic action, and leaves the record in the catalog. The tab has no restore action.

## Existing code to reuse

| Need | Existing code |
| --- | --- |
| Dockable singleton list and command grammar | `defineDockableList` in `src/plugins/define-list-tab.ts:38`, `parseDockArgument` in `src/plugins/dock-argument.ts:3`, and the sessions activation at `src/plugins/sessions/activate.ts:62` |
| Metadata bar and split/dock-cycle controls | `PluginActionsHeader` in `web/src/plugins/PluginActionsHeader.tsx:6`, the header in `web/src/plugins/sessions/SessionList.tsx:77`, and the docked portal in `web/src/plugins/DockedPluginBody.tsx:16` |
| Wide/narrow list rows and styling | `WideSessionRow`/`NarrowSessionRow` in `web/src/plugins/sessions/SessionRowBody.tsx:12,30`, `SessionRowActions` in `web/src/plugins/sessions/SessionRowActions.tsx:30`, and the grid/narrow selectors in `web/src/plugins/sessions/sessions.css:18,50` |
| Confirmation dialog | `ConfirmDialog` re-exported by `web/src/plugins/api.ts:52` and used by `SessionList` at `web/src/plugins/sessions/SessionList.tsx:120` |
| Plugin contract, async Delete result, and topic source | `defineIntents` in `src/plugins/define-intents.ts:32`, `TabPluginTopicActionCapability` in `src/plugins/api-topic-action-capability.ts:4`, `readModelsTopic` in `src/plugins/models-topic.ts:5`, and `product/specs/tab-plugins.md` |
| Server registration and client lazy loading | `sessionsManifest` in `src/plugins/sessions/manifest.ts`, `tabPluginCatalog`/`tabPluginLoaders` in `src/plugins/catalog.ts`/`src/plugins/loaders.ts`, and `clientPluginLoaders`/literal schema registration in `web/src/plugins/registry.tsx:33,85` |
| Registry and lazy-chunk checks | loader parity in `src/plugins/loaders.test.ts`, schema pinning in `web/src/plugins/registry.test.tsx:27`, and the import-boundary example in `web/src/plugins/roles/chunk-imports.test.ts:61` |
| Async Delete refusal result | `TabPluginTopicActionCapability` in `src/plugins/api-topic-action-capability.ts`; only the `models/delete` action returns `Promise<string | undefined>` |

## Proposed changes

1. Add `src/plugins/models/manifest.ts`, `shared.ts`, and `activate.ts`. Declare id and command `models`, `fileExtensions: {}`, `notifications: ['models']`, and exactly the capabilities `openOrFocusTab`, `updateTab`, `dockTab`, `topicData`, `topicAction`, `rejectRequest`, and `reportFailure`. Keep `shared.ts` import-free; define schema version 1 and a payload containing `groups` plus `refreshing`, where each group has a `label` and rows and each row has `harness`, `id`, `name`, and boolean `disabled`. Include the payload guard, empty intent guard, and Delete guard requiring nonempty harness and id. In activation, map topic `ModelGroup.heading` to `label`, and `ModelGroup.records` to rows; set `harness` to `opencode` for `opencode:<prefix>` group keys and otherwise to the group key, copy `id` and `name`, and normalize the optional source `disabled` flag to `record.disabled === true`.
2. Implement the server activation with `defineDockableList`, topic `models`, instance key and title `models`. Wrap the list command so it synchronously invokes the `reload` topic action before delegating to the list command that reads topic data. The Refresh intent invokes the fire-and-forget refresh action. The Delete intent awaits the `models/delete` topic action's promise and forwards a resolved refusal through `rejectRequest`; a resolved `undefined` means success.
3. Register the plugin in `src/plugins/catalog.ts`, `src/plugins/loaders.ts`, and `web/src/plugins/registry.tsx` using a literal schema version 1.
4. Add the client entry and `ModelsTab`, `ModelRow`, and `models.css` under `web/src/plugins/models/`. Match the specified center and docked layouts, group headers, four columns, fixed actions width, 12px horizontal padding, accessible icon-only Delete button, no-model empty state, disabled row, Refresh spin/disabled state, and ConfirmDialog wording. Use only `models-` table classes and shared generic tab chrome.
5. Add `src/plugins/models/activate.test.ts` and `shared.test.ts`, topic repaint and intent coverage in `src/plugins/topics.test.ts`, `web/src/plugins/models/ModelsTab.test.tsx`, `web/src/plugins/models/chunk-imports.test.ts` following `web/src/plugins/roles/chunk-imports.test.ts`, and registration coverage in `src/plugins/loaders.test.ts` and `web/src/plugins/registry.test.tsx`. Cover command arguments and reload-before-read ordering, payload guards, topic-to-payload group and harness mapping, row grouping and name fallback, narrow layout, empty state without column headings, Refresh spin/disabled state and no refresh merely from activation, confirm/cancel/confirm Delete flow, and omission of Delete on disabled rows. In the activation test, await a pending Delete `topicAction` result before asserting success or forwarding its refusal to `rejectRequest`.
6. Add `product/specs/models-tab.md` for command grammar, grouped layout, file/reload behavior, hidden/disabled semantics, Delete, Refresh outcomes, exact notification strings, write failures, and immediate updates. Document the exact refresh line format: `Models refreshed:` when at least one harness was reached, otherwise `Models not refreshed:`; successful harness counts precede skips and failures, and each unreported opencode prefix is reported as `<prefix> skipped: not configured in opencode.`. The fetch, merge, and failure details must match the provider and manager subplans.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation change. Verify the plugin remains lazy in the client bundle through its chunk-import test and that all topic-driven views repaint after a manager delivery.

For final manual acceptance in a scratch project, run `models` and confirm the catalog opens in the centre with the expected groups; run `models left`, `models right`, then bare `models` to check docking and return to centre. Press Refresh and verify the icon spins only while the manager reports `refreshing`, the completed notice appears, and the rows update. Open a visible model's Delete dialog, cancel and confirm its row remains, then reopen and confirm; verify the row disappears after the topic update. Leave a stale row open while changing its record to hidden or disabled in the override, confirm Delete, and verify the manager refusal reaches the request through `rejectRequest`.

## Out of scope

- Roles-tab changes and catalog provider/manager implementation.
- Restoring a deleted model from the UI, removing its record, model-to-role dragging, or catalog file watching.
- A separate client-side model cache or recomputation of groups.
