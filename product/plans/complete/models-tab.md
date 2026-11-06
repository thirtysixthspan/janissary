# Models tab

**Complexity: 7/10** — a new core catalog service with three provider fetchers and a serialized write queue, a new host topic and notification event, a new plugin on both sides, a catalog file format change rippling through eight consumers, and a roles payload schema bump.

## Summary

The model catalog now has its own dockable `models` tab instead of a Models column in the roles tab. It shows visible records grouped by provider, refreshes them from Anthropic, Codex, and configured OpenCode providers, and lets users disable and hide a record without removing it. The roles tab edits roles only and marks entries whose models are not enabled.

The bundled catalog and project override use ordered model records with `id`, optional `name`, and optional `disabled` and `hidden` flags. `ModelCatalogManager` owns the effective catalog, serialized writes, provider refresh, and notifications. Its `models` topic supplies grouped state to the lazy Models plugin and updates the other model consumers without restarting Janissary.

## Design decisions

### The tab

1. `models` opens or focuses the singleton tab titled `models`. `models left` and `models right` dock it in that sidebar. Bare `models` returns a docked tab to the center. Other arguments are refused with `Usage: models [left|right]`.
2. The full-width metadata bar places Refresh and the host split or dock-cycle control at the right. The center table has Model, Name, Harness, and actions columns. Docked rows put the model id and actions above the name and harness. A missing display name falls back to the id.
3. Claude models form the `Anthropic` group and Codex models form `OpenAI`. OpenCode ids group by the prefix before `/`: `opencode` is `OpenCode Zen`, `opencode-go` is `OpenCode Go`, `google` is `Google`, and `openai` is `OpenAI`. Other prefixes are shown as their raw string. A bare OpenCode id uses the `opencode` fallback prefix and `OpenCode Zen` heading. The two `OpenAI` groups remain distinguishable by the Harness column.
4. Groups follow catalog order: Claude, Codex, then OpenCode prefixes in first-appearance order. Newly appended prefixes follow existing prefixes. Hidden rows and groups with no visible models are omitted. An empty catalog reads `No models` without column headings.
5. Disabled visible rows are dimmed and have no Delete control. Refresh is user initiated; while it runs, the button is disabled and spins on every view receiving the `refreshing` topic state.
6. Opening `models`, Delete, and Refresh reload the project file. No file watcher runs while the app is idle.

### The file

7. `known-models.json` is the bundled catalog and `.janissary/known-models.json` is a project override. The override replaces the bundled catalog wholesale. Each harness maps to an ordered array of records with a required nonempty string `id`, optional string `name`, and optional boolean `disabled` and `hidden`. The bundled records contain only `id` until a project refresh or hand edit supplies more fields.
8. The decoder rejects the whole override when its JSON or record shape is invalid, warns, and uses the bundled catalog. An old id-list override is invalid and warns `warning: .janissary/known-models.json is not an object of model-record lists — using the bundled catalog`. A stale `.janissary/harness-models.json` file is not read. The decoder checks each record's fields but does not reject duplicate ids; duplicate rows can appear, and Delete addresses the first matching record.
9. The encoder writes two-space JSON with a trailing newline and omits false flags. Delete writes the full effective catalog to the project override. Refresh writes only when at least one provider was reached; if none was reached, it reports the outcome and leaves the file unwritten. A first successful Delete or Refresh seeds the override from the catalog in effect, including the bundled fallback when the existing override is invalid.

### The two flags

10. `hidden` removes a record from the Models tab only. A hidden but enabled model remains available to other consumers. `disabled` removes a model from launch and selection choices: harness launches and completion, the New harness dialog, agent model selection, ACP's `ask` role, conversation choices, and the roles entry picker. A disabled but visible record remains dimmed in Models.
11. Agent automatic selection prefers `google/gemini-3.1-flash-lite` when enabled, then the first enabled OpenCode model. An explicit unknown or disabled model fails execution with `Agent: unknown model "<value>".`. If there is no enabled OpenCode model, no run or record is created.
12. ACP filters disabled ask-role entries on each attempt, including the model of an already-open session. It closes a current session whose model became disabled and tries the next enabled entry. If none remain, it reports `ACP: the ask role lists no models.`.
13. Conversations offer enabled Claude and OpenCode models and refresh their choices when the catalog changes. A saved disabled or retired pair falls back to the first available pair when one exists. If no enabled pair exists, an existing conversation retains and uses its saved pair on the next query; this is a divergence from the disabled-model launch rule.

### Delete

14. Delete asks through `ConfirmDialog` with title `Delete <model id>?` and button `Delete`. Confirm sets both flags to `true`, writes the record, and leaves it in the catalog. The UI has no restore action; users clear the flags in `.janissary/known-models.json` by hand.
15. A missing, hidden, or disabled record is refused with `no model "<harness> <id>"`. If a row becomes unavailable while its confirmation is open, the Models tab shows a dismissible `Delete failed:` alert after the dialog closes. A catalog write failure reports `Could not write known-models.json at <path>.` through the refresh notification event.

### Refresh

16. Provider fetches run concurrently, each with a 30-second timeout. OpenCode runs `opencode models`, trims nonempty lines, and keeps every returned provider prefix. Codex runs `codex debug models`, keeps entries whose `visibility` is `list`, and maps `slug` to `id` and `display_name` to `name`. Claude requests `GET https://api.anthropic.com/v1/models` with `ANTHROPIC_API_KEY`, paginates with `last_id`, and maps `display_name` to `name`. Missing CLIs and a missing Anthropic key are skipped. Malformed output, duplicate provider ids, non-success HTTP responses, and timeouts fail that provider without merging partial results.
17. Claude and Codex sync each successful list, including an empty list. OpenCode syncs only prefixes reported by the current machine. An existing unreported prefix is kept unchanged and reported as `<prefix> skipped: not configured in opencode.` A successful empty OpenCode result reaches no prefix; it preserves existing records and does not count as a reached harness. A failed or skipped OpenCode command does not mark prefixes unconfigured.
18. For a reached provider, listed records keep their existing order and flags, fetched names replace stored names, stale ids are removed, and new ids append in provider order. OpenCode counts aggregate its reached prefixes; its visible count includes preserved prefixes. A failed or skipped provider keeps its existing records. A Delete queued during provider fetching is written first, and the later merge preserves its flags when the provider still lists the model.
19. Refresh is single flight. A second request joins the active refresh. Delete and the refresh merge/write share a serialized queue. Disposing the manager aborts the active refresh; a disposed refresh writes and reports nothing.
20. The one-line `models-refresh` summary starts `Models refreshed:` when any harness was reached and `Models not refreshed:` otherwise. Reached harnesses are listed in Claude, Codex, OpenCode order with their visible count after merge and nonzero added/removed deltas. A zero count remains visible; zero deltas and empty parentheses are omitted. Skips and failures follow in harness order, then unreported OpenCode prefixes in catalog order. A timeout reads `<harness> failed: timed out after 30 s.`; a missing CLI reads `<harness> skipped: <binary> is not installed.`; a missing Anthropic key reads `claude skipped: ANTHROPIC_API_KEY is not set.`.
21. The `models-refresh` event has a default-on toggle, bypasses focus suppression, uses the success alert default, and appears in the feed or as a toast when the feed is not visible. A catalog write failure reports the exact path and does not apply the uncommitted candidate; a catalog change found during the preceding reload remains in effect.

### Taking effect

22. Manager catalog changes update the in-memory catalog only after a successful write. A changed catalog emits `models:changed`, `conversations:changed`, and `state:dirty`. Refreshing transitions and successful writes emit `models:changed`; unchanged reloads emit nothing. Open Models tabs repaint from their topic, roles tabs republish their catalog-derived missing markers, conversations update their model choices, and the New harness dialog reads current enabled choices without a restart.
23. The new `models` topic is additive to the tab-plugin API and does not bump `TAB_PLUGIN_API_VERSION`. Its payload is the visible groups plus `refreshing`. The Models command reloads before reading topic data. Refresh is fire-and-forget and its results arrive through the topic and notification. Delete returns an asynchronous manager refusal, which the plugin forwards through `rejectRequest`; every pre-existing topic action remains synchronous.

### The roles tab

24. The roles tab no longer has a catalog column or catalog-to-role / entry-to-catalog drags. The existing entry picker adds enabled models and the row control removes entries; role and entry reordering remain.
25. Role entries stay in `roles.json` when their models are disabled, dropped, hidden only from view, or absent. The server marks an entry `missing` when it is not in the enabled catalog for its harness. The client dims it and sets the tooltip `Not in the model catalog`; the marker is not written to the file. Roles payload schema is version 2, and the plugin republishes from the last resolved project root on each models-topic delivery.

## What already exists (reuse, don't rebuild)

The implementation reuses `atomicWriteFile` for safe catalog writes, the sessions plugin's dockable-list pattern for the Models tab, the existing topic and notification infrastructure, and the roles file's existing read/write path. The former `src/harness/models.ts` global loader was removed after its consumers moved to `ModelCatalogManager`.

## Proposed changes

### 1. The `src/models/` feature and the record format

`catalog-file.ts` owns record validation, encoding, fallback reads, and the project override path. `providers/` contains the Anthropic, Codex, and OpenCode fetchers and their shared outcomes. `merge.ts` synchronizes reached providers; `groups.ts` builds visible provider groups and refresh summaries. `ModelCatalogManager` owns current state, serialized writes, single-flight refresh, cancellation, and bus notifications. It is registered on `Managers` and disposed with the other long-lived services.

### 2. Switch every catalog consumer to `managers.models`

Harness validation and launch choices, command completion, agent model selection, ACP's ask-role queue, conversation choices and validation, and `harnessLaunchCatalog` all use the manager's enabled-model lookups. Pure helper functions receive a model lookup callback. The old global model loader and startup load call are removed.

### 3. The `models-refresh` notification event and the `models` host topic

The notification event has an independent default-on `modelsRefresh` toggle, focus bypass, and success alert. The topic reads grouped model state, reloads, starts refresh without awaiting it, and awaits Delete. Existing topic actions retain their synchronous contract, and the additive topic does not change the plugin API version.

### 4. The `models` tab plugin

The server and client models plugin is registered through literal loader entries. Its server activation uses the dockable-list command, reloads before reading its topic, awaits Delete refusals, and starts Refresh on user input. Its client renders the center and docked layouts, disabled and empty states, confirmation dialog, and dismissible stale-Delete error. The client implementation remains in its lazy chunk and uses the import-free shared payload contract at schema version 1.

### 5. The roles tab

The roles plugin publishes a schema-2 payload with server-derived `missing` markers when the models topic changes. The catalog column and its drag targets are removed while the enabled-model picker and role/entry reordering remain. The marker is never persisted in `roles.json`.

### 6. Specs, help, and docs

`product/specs/models-tab.md` describes the catalog, grouping, Delete, Refresh, and notification behavior. The harness, ACP, conversations, roles, notifications, and tab-plugin specs describe their updated model behavior. Help adds the `models` command and updates related model-consumer guidance. The user-facing Models page and linked command, plugin, tab, configuration, and notification pages describe the delivered workflow.

## Tests

Coverage includes catalog decoding and encoding, fallback warnings, provider parsing and timeouts, duplicate provider-id rejection, merge and group ordering, notification summaries, manager single-flight and serialized writes, dispose-during-refresh behavior, and Delete refusal. Consumer tests cover disabled models in harness launches, completion, ACP, agent selection, conversations, and roles. Plugin tests cover topic registration/actions, schema guards, lazy chunk boundaries, Models layout and controls, and the Roles missing marker. Catalog warning tests restore the stderr spy after each test.

## Out of scope

- Removing a model record or restoring a deleted model through the UI; users clear flags by hand.
- Dragging models between the Models and Roles tabs, or changing role and entry reorder behavior.
- Watching `known-models.json` continuously, migrating old id-list overrides, or layering a project override over the bundled catalog.
- Filling display names into the bundled catalog or fetching Google and OpenCode Go through any source other than `opencode models`.

## Verification

The implementation's tests exercise model record, provider, manager, topic, UI, roles, and consumer behavior. The final scratch-project acceptance covered center and docked layouts, refresh and notifications, confirmed and cancelled Delete, stale Delete refusal, role missing markers, disabled-model launch refusal, empty and invalid states, and a hand-edited catalog reload. Anthropic was skipped when its key was absent; Codex refreshed, while an OpenCode command failure was reported without discarding its existing records. GitHub's lint, tests, and TypeScript checks passed on the current PR head.
