# Models tab

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
- The Delete button is a right-aligned icon-only `faTrash` control with accessible label `Delete <id>`. Deleting asks through `ConfirmDialog` with title `Delete <model id>?` and button `Delete`, sets both flags through the topic action, and leaves the record in the catalog. The tab has no restore action.

## Existing code to reuse

| Need | Existing code |
| --- | --- |
| Dockable singleton list plugin | `src/plugins/sessions/activate.ts`, `src/plugins/define-list-tab.ts`, and `src/plugins/dock-argument.ts` |
| Metadata bar and split action | `web/src/plugins/sessions/SessionList.tsx` and `web/src/plugins/DockedPluginBody.tsx` |
| Wide/narrow list rows and styling | `web/src/plugins/sessions/SessionRowBody.tsx`, `SessionRowActions.tsx`, and `sessions.css` |
| Confirmation dialog | `ConfirmDialog` from `web/src/plugins/api.ts` |
| Plugin contract and topic | `src/plugins/api.ts`, `src/plugins/models-topic.ts`, and `product/specs/tab-plugins.md` |

## Proposed changes

1. Add `src/plugins/models/manifest.ts`, `shared.ts`, and `activate.ts`. Declare id and command `models`, `fileExtensions: {}`, `notifications: ['models']`, and exactly the capabilities `openOrFocusTab`, `updateTab`, `dockTab`, `topicData`, `topicAction`, `rejectRequest`, and `reportFailure`. Keep `shared.ts` import-free; define schema version 1 and a payload containing `groups` plus `refreshing`, where each group has a `label` and rows and each row has `harness`, `id`, `name`, and `disabled`. Include the payload guard, empty intent guard, and Delete guard requiring nonempty harness and id.
2. Implement the server activation with `defineDockableList`, topic `models`, instance key and title `models`. Reload before the list command reads topic data. The Refresh intent invokes the refresh action; the Delete intent forwards manager refusal through `rejectRequest`.
3. Register the plugin in `src/plugins/catalog.ts`, `src/plugins/loaders.ts`, and `web/src/plugins/registry.tsx` using a literal schema version 1.
4. Add the client entry and `ModelsTab`, `ModelRow`, and `models.css` under `web/src/plugins/models/`. Match the specified center and docked layouts, group headers, four columns, fixed actions width, 12px horizontal padding, accessible icon-only Delete button, no-model empty state, disabled row, Refresh spin/disabled state, and ConfirmDialog wording. Use only `models-` table classes and shared generic tab chrome.
5. Add server activation/shared tests, topic repaint and intent tests, `web/src/plugins/models/ModelsTab.test.tsx`, a chunk-import test, and registry coverage. Cover command arguments and reload ordering, payload guards, row grouping and fallback, narrow layout, empty state, Refresh state, confirm/cancel/confirm Delete flow, and omission of Delete on disabled rows.
6. Add `product/specs/models-tab.md` for command grammar, grouped layout, file/reload behavior, hidden/disabled semantics, Delete, Refresh outcomes, exact notification strings, write failures, and immediate updates. Document the exact refresh line format: `Models refreshed:` when at least one harness was reached, otherwise `Models not refreshed:`; successful harness counts precede skips and failures, and each unreported opencode prefix is reported as `<prefix> skipped: not configured in opencode.`. The fetch, merge, and failure details must match the provider and manager subplans.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation change. Verify the plugin remains lazy in the client bundle through its chunk-import test and that all topic-driven views repaint after a manager delivery.

## Out of scope

- Roles-tab changes and catalog provider/manager implementation.
- Restoring a deleted model from the UI, removing its record, model-to-role dragging, or catalog file watching.
- A separate client-side model cache or recomputation of groups.
