# Models tab

**Complexity: 7/10** — a new core catalog service with three provider fetchers and a serialized write queue, a new host topic and notification event, a new plugin on both sides, a catalog file format change rippling through eight consumers, and a roles payload schema bump.

Feature: move the models section out of the roles tab and into a new tab models tab. The tab should have a metadata bar with split and dock buttons floated right. an additional button should be a refresh button that fetches the latest models from providers and creates an updated available-models.json file in the project .janissary directory which overrides the available-models.json file in the project. the `models` command opens the models tab `models left|right` dock the tab. models should be grouped by provider. an action row in the table should contain a delete button which disables and hides a model from the list (but does not remove it from available-models, instead only sets the disabled and hidden fields in the model record). The styling of the models should use a table similar to the tables using in sessions and conversations tabs.

## Summary

The model catalog lists the model ids each harness may launch with. Today it shows up only as the left "Models" column of the roles tab. It changes only when someone hand-edits `known-models.json` against each provider's published list (`product/specs/harness.md` § What the bundled catalog holds). A dedicated models tab gives the catalog its own home. It's a table grouped by provider. A Refresh button pulls the current lists from the providers into a project override file. A per-row Delete hides and disables a model without dropping its record. The roles tab then holds roles only.

The catalog file becomes `known-models.json` and stores one record per model instead of a bare id string. A core service owns the catalog in memory and on disk. It applies every change at once, without a restart, and publishes the catalog to plugins through a new `models` host topic. The models tab is a thin dockable list over that topic, built the way the sessions tab is.

## Design decisions

### The tab

1. `models` opens or focuses the singleton models tab, titled `models`. `models left` and `models right` dock it into that sidebar. A bare `models` on a docked tab returns it to the centre. Any other argument is refused with `Usage: models [left|right]`. This is the sessions tab's grammar (`product/specs/sessions-tab.md` § Opening the tab).
2. The header is a full-width metadata bar with its controls floated right: Refresh, then the host's split control in the centre or its dock-cycle control when docked. This matches the sessions tab header.
3. The centre table has four columns: Model (the id), Name (the provider's display name), Harness, and an unlabeled actions column. Rows sit under one heading row per provider group. Docked, each row stacks onto two lines the way the sessions tab's docked rendering does: the model id and its actions on the first line, then the name and harness. A record with no display name shows its id in the Name column too. That covers every opencode model, because `opencode models` prints bare ids.
4. The table follows the sessions tab's table styling, with its own `models-` class names: column headings laid out like `session-columns`, 12px horizontal padding, a fixed-width actions column so different button counts don't shift the columns, and icon-only right-aligned row buttons with the verb in the accessible label.
5. Groups and their heading names come from the model id. The `claude` harness's models form one group headed `Anthropic`. The `codex` harness's form one headed `OpenAI`. The `opencode` harness's models split by the id prefix before the first `/`: `opencode` → `OpenCode Zen`, `opencode-go` → `OpenCode Go`, `google` → `Google`, `openai` → `OpenAI`. Any other prefix is shown raw. An id with no `/` under opencode is grouped under its raw harness name. The two `OpenAI` groups are told apart by the Harness column.
6. Groups appear in file order: claude, codex, then opencode prefixes in the order they first appear in the catalog. A prefix that is new after a refresh goes last, because the merge appends it.
7. An empty table (no visible model at all) reads `No models`, with no column headings, as the sessions tab does.
8. The catalog file is re-read from disk each time `models` runs and at the start of each Delete and Refresh. A hand edit made while the app runs therefore shows up on the next of those, in the tab and in every other consumer, because a re-read that finds a change replaces the in-memory catalog as decision 22 describes. There is no file watching in this version.

### The file

9. The catalog file is `known-models.json`: the bundled file at the repo root and the project override at `.janissary/known-models.json`. The rename from `harness-models.json` has already landed on master, and an old `.janissary/harness-models.json` is already ignored (user answer; `product/plans/complete/rename-harness-models-to-known-models.md`). The switch to records (decision 10) breaks hand-written overrides in the old id-list shape. So the commit is marked breaking, and the generated changelog (`scripts/release/changelog.mjs`, built from commit subjects) records it.
10. The file is an object mapping each harness name to an ordered list of model records. A record has a required nonempty string `id`. It may also have a string `name`, plus `disabled` and `hidden` booleans that are written only when true. The bundled file is converted mechanically: each id string becomes a record holding only `id`.
11. The project override still replaces the bundled catalog wholesale. Once a project's first Delete or Refresh writes `.janissary/known-models.json`, later bundled updates reach that project only through its next Refresh. When no override exists, the first Delete or Refresh seeds it from the catalog in effect, which is the bundled one. An override that exists but doesn't decode (decision 12) is treated the same way. The catalog in effect is then the bundled fallback, so a Delete or Refresh seeds from it and replaces the broken file (user answer). The broken file is not kept, and the startup warning is the only notice that it was broken.
12. Loading keeps today's fallback contract from `loadHarnessModels`, with the warnings renamed. A missing override uses the bundled catalog. An override that isn't valid JSON, or doesn't decode to the record shape, prints a warning and uses the bundled catalog. The warnings read `warning: .janissary/known-models.json is invalid JSON — using the bundled catalog` and `warning: .janissary/known-models.json is not an object of model-record lists — using the bundled catalog`.

### The two flags

13. Each flag also works on its own. `hidden` keeps a model out of the models tab. `disabled` keeps it out of everything that offers or launches models: the roles entry picker, the conversation model picker, the New harness dialog, `harness --model` completion, agent model selection, and the ACP `ask` role's attempt list, which skips a disabled entry (user answer). `harness --model <it>` is also refused with today's unknown-model message. Delete sets both flags. A hand-edited record that is disabled but not hidden shows dimmed with no delete button. One that is hidden but not disabled is still offered and launchable everywhere else.

### Delete

14. Delete asks first, through `ConfirmDialog`, the way the sessions tab asks before Detach and Terminate, because the tab offers no restore. The dialog's title is `Delete <model id>?` and its button is `Delete`. Confirming sets `disabled` and `hidden` on that record and writes the override. The record is never removed.
15. A deleted model cannot be restored from the tab in this version. The user clears the flags in `.janissary/known-models.json` by hand, and the change takes effect on the next `models`, Delete, or Refresh (decision 8).

### Refresh

16. Refresh gets each provider's list from the source below, and all sources run concurrently, each with a 30 second timeout.
   - **opencode**: `opencode models`, which prints one `<provider>/<model>` id per line. Every id it reports is kept, including providers beyond the bundled three. On one machine today it reports `openai/` and `opencode/` and nothing else, because it lists only the providers the user has configured in opencode.
   - **codex**: `codex debug models`, which prints JSON whose `models` array carries `slug`, `display_name`, and `visibility`. Only entries whose `visibility` is `list` are kept, which drops internal models such as `codex-auto-review`. `slug` becomes `id` and `display_name` becomes `name`.
   - **claude**: Anthropic's Models API list endpoint (`GET https://api.anthropic.com/v1/models`, authenticated with `ANTHROPIC_API_KEY`, paged until no more pages remain). `id` becomes `id` and `display_name` becomes `name`. Without the key the claude group is skipped.
17. The merge syncs per provider, not per harness. For claude and codex, the provider is the harness. For opencode, each id prefix is its own provider: a prefix `opencode models` reported is synced, and a prefix already in the catalog that it didn't report at all counts as not reached and is kept unchanged. That's because opencode lists only providers configured on this machine, so silence means "not configured here", not "gone". Without this, one Refresh on a machine without OpenCode Go or Google configured would drop every bundled `opencode-go/` and `google/` model. Within a synced provider, the provider's records come to match what was fetched. New ids are appended in fetched order, and a prefix new to the catalog is appended after the existing opencode records. A listed id keeps its record's flags, so a refresh never brings back a deleted model that is still listed, and the fetched name replaces the stored one. An id the provider no longer lists is dropped, flags or not: the fetched list is evidence the model is gone. If the provider lists it again later, it comes back as an ordinary visible model. A harness Refresh could not reach at all (CLI missing, no key, timeout, error) keeps its whole list exactly as it was. When no harness was reached, nothing is written.
18. Refresh is single-flight. While it runs, every client's Refresh icon spins and its button is disabled, driven by a `refreshing` flag in the topic data. A second Refresh request is ignored. Delete and the refresh's write share one write queue, so they never interleave. A Delete that lands mid-refresh is applied first and then kept by the merge, because the merge reads the catalog only after its fetches settle.
19. Refresh reports to the notifications feed, not the tab. It reports in one line, attributed to the models tab: for example, `Models refreshed: codex 12 (+1 −2), opencode 29 (+3). claude skipped: ANTHROPIC_API_KEY is not set.` Each reached harness reads `<harness> <count>`, where the count is visible models after the merge, then its added and removed counts in parentheses. A zero count is left out, and the parentheses go when both are zero. Reached harnesses come first in the order claude, codex, opencode, then each unreached one as `<harness> skipped: <reason>.` or `<harness> failed: <first line of the error>.`. A timeout reads `<harness> failed: timed out after 30 s.`. A missing CLI reads `<harness> skipped: <binary> is not installed.`. Last, each opencode prefix kept because opencode didn't report it reads `<prefix> skipped: not configured in opencode.`, for example `google skipped: not configured in opencode.`. When no harness was reached, the line starts `Models not refreshed:`. These strings were confirmed by the user.
20. The line goes through a new host notification event, `models-refresh`, raised by the catalog service. Like `plugin-note`, a line raised while the feed is off screen shows as a toast and counts toward burst escalation (`product/specs/notifications.md` § Toasts and escalation), so the user sees it with the feed closed.
21. A write that cannot happen reports `Could not write known-models.json at <path>.` on the same event, and the catalog and tab stay unchanged.

### Taking effect

22. A Delete or Refresh takes effect at once. The in-memory catalog is replaced right after the file is written, so every consumer in decision 13 sees it without a restart. Open roles tabs republish, the conversations topic fires so open conversation pickers update, and a state broadcast refreshes an open New harness dialog.

### The roles tab

23. The models column is removed from the roles tab, along with the two drags that used it: catalog to role card (add) and entry to catalog (remove). Entries are added with the existing Add entry picker and removed with the row's remove control. Role and entry reordering drags stay.
24. `roles.json` is never touched by a Delete or Refresh. A role entry whose model is not in the effective catalog for its harness stays on its card but shows dimmed. That covers a deleted, disabled, dropped, or never-listed model. The entry gets the tooltip `Not in the model catalog`, with no visible text, so the row layout doesn't change. The server decides which entries are marked.

## What already exists (reuse, don't rebuild)

| Need | Existing piece |
| --- | --- |
| Catalog load with fallback and warnings | `loadHarnessModels` and `decodeHarnessModels` in `src/harness/models.ts`; called once from `src/main.ts` ("`loadHarnessModels(cwd)`") |
| Atomic file write | `atomicWriteFile` in `src/atomic-write.ts` |
| Singleton dockable list plugin over a host topic | the sessions plugin: `src/plugins/sessions/activate.ts` spreads `defineDockableList` (`src/plugins/define-list-tab.ts`) and routes row verbs through `topicAction` with a per-row check (`rowEntry`) |
| Dock argument grammar | `parseDockArgument` in `src/plugins/dock-argument.ts` (used by `defineDockableList`) |
| Host topic contract and sources | `TabPluginNotificationTopic`, `NOTIFICATION_TOPICS`, `TabPluginNotification`, `TabPluginTopicAction` in `src/plugins/api-topics.ts`; the per-topic source table in `src/plugins/topics.ts`; a topic split into its own files: `src/plugins/api-topics-connections.ts` and `src/plugins/connections-topic.ts` |
| A manager on `Managers` with a host topic | `SessionsManager` (`src/sessions/manager.ts`), registered in `src/managers.ts` (`ManagerRegistry`, `MANAGER_DISPOSE_ORDER`) and built in `src/controller/create-managers.ts`; its topic fires on `messageBus.on('sessions', 'changed', …)` |
| Serialized read-modify-write queue | the `queue` / `settle` chain in `src/plugins/roles/activate.ts` |
| Metadata bar with Refresh and split | `SessionList` in `web/src/plugins/sessions/SessionList.tsx`: `PluginActionsHeader`, a `faRotate` Refresh button, `capabilities.splitAction`; the docked frame is `DockedPluginBody` (`web/src/plugins/DockedPluginBody.tsx`) |
| Wide and narrow row renderings | `WideSessionRow` / `NarrowSessionRow` in `web/src/plugins/sessions/SessionRowBody.tsx`, chosen by `capabilities.dock !== null` |
| Table and row-button styling | `web/src/plugins/sessions/sessions.css`, `web/src/plugins/shared.css`, `SessionRowActions.tsx` |
| Confirmation dialog | `ConfirmDialog` from `web/src/plugins/api.ts`, used by `SessionList` |
| Host notification events | `NotificationEventType` and the per-event toggle map in `src/notifications/index.ts`, `NOTIFICATION_ALERT_DEFAULTS` in `src/notifications/alert-defaults.ts`, the detail passthrough in `src/notifications/format.ts`, raised through `notify(managers, …)` |
| Catalog offered to plugins | `harnessLaunchCatalog` in `src/plugins/context.ts` |
| Models column to remove | the `roles-catalog` column in `web/src/plugins/roles/RolesTab.tsx`, `dragCatalogModel` and `dropOnCatalog` in `web/src/plugins/roles/roles-dnd.ts`, and the catalog styles in `roles.css` |
| Tab plugin registration | `src/plugins/catalog.ts`, `src/plugins/loaders.ts`, `web/src/plugins/registry.tsx`, per `ai/guidelines/plugins-tabs.md` |

## Proposed changes

Land the steps in this order. Each one leaves typecheck and tests green.

### 1. The `src/models/` feature and the record format

The file rename has already landed on master (`product/plans/complete/rename-harness-models-to-known-models.md`). That covers the root `known-models.json`, the `package.json` `files` entry, the `appKnownModels` sandbox key, the unknown-model message, and the warnings in `src/harness/models.ts`. An old `.janissary/harness-models.json` is already ignored (`product/specs/harness.md` § What the bundled catalog holds). What's left here is converting `known-models.json` to records (decision 10) and replacing `src/harness/models.ts`. The second warning's text changes from "model-id lists" to "model-record lists" (decision 12).

Create `src/models/` with these modules, each under 200 lines:
- **`catalog-file.ts`**: pure decode and encode of the record shape (decision 10), the bundled import, and `readCatalog(projectDir)`, which returns the catalog in effect, whether it came from the override, and the override path, with decision 12's fallback and warnings. A record with an empty `id`, a non-string `name`, or a non-boolean flag makes the whole file undecodable, the same all-or-nothing rule `decodeHarnessModels` applies today. Writing goes through `atomicWriteFile` with two-space JSON and a trailing newline.
- **`merge.ts`**: a pure function that takes the current catalog and the per-harness fetch outcomes. It returns the merged catalog, the per-harness added and removed counts, and the opencode prefixes kept as unreported, following decision 17.
- **`groups.ts`**: a pure function that turns the catalog into the topic's view, following decisions 3, 5, 6, and 13. It drops hidden records, splits by provider, applies the friendly heading names, keeps file order, and fills `name` with the id when it's absent. It also builds the summary line in decision 19 from the merge counts and outcomes.
- **`providers/opencode.ts`, `providers/codex.ts`, `providers/anthropic.ts`**: each fetches one harness's list (decision 16). Each returns one of three outcomes: ok with records, skipped with a reason, or failed with a reason. The two CLI fetchers use `execFile` from `node:child_process` with a 30 s `timeout` and an `AbortSignal`. A spawn `ENOENT` is the "not installed" skip. The Anthropic fetcher uses the global `fetch` with `AbortSignal.any` of the refresh's signal and `AbortSignal.timeout(30_000)`. It sends the `x-api-key` and `anthropic-version: 2023-06-01` headers and pages with `after_id` while `has_more` is true. A non-2xx answer is a failure whose reason is the status line. A missing key is a skip.
- **`manager.ts`**: `ModelCatalogManager`, registered on `Managers` as `models`, built in `src/controller/create-managers.ts` with the project directory, and listed in `MANAGER_DISPOSE_ORDER` beside `conversations`. It replaces `src/harness/models.ts`, which is deleted, and the `loadHarnessModels(cwd)` call in `src/main.ts`, because the constructor reads the catalog. It holds the in-memory catalog and exposes:
  - `modelsFor(harness)`: ids of non-disabled records
  - `isKnownModel(harness, id)`: true only for a non-disabled record
  - `view()`: the topic slice: the groups and `refreshing`
  - `reload()`: re-reads the file (decision 8) and, when the decoded catalog differs from the one in memory, replaces it and emits the change events below
  - `delete(harness, id)`: returns `no model "<harness> <id>"` when no record by that key is both visible and enabled, so a stale or forged request is refused here rather than in the plugin
  - `refresh()`
  
  Writes run on one promise chain, as in the roles activation, and every queued step starts with `reload()`. `refresh()` sets `refreshing`, fetches concurrently, then queues the merge-and-write. It skips the write when no harness was reached. It raises `models-refresh` attributed to the models tab's label when one is open, or `models` otherwise, then clears `refreshing`. After every successful write and every `refreshing` change it emits `messageBus` `'models' 'changed'`. After a catalog change it also emits `'conversations' 'changed'` and `'state' 'dirty'`. `dispose()` aborts an in-flight refresh through its `AbortController`, and an aborted refresh writes and reports nothing.

### 2. Switch every catalog consumer to `managers.models`

Each of these reads `managers.models` instead of the deleted module-level functions:
- **`src/harness/manager.ts`**: `isKnownModel` at the `--model` check, plus `modelsFor` in `harnessLaunchView`
- **`src/acp/manager.ts`**: it no longer reads the catalog. It launches the `ask` role's entries in order, via `askRoleEntries` and `attemptOrder` in `src/acp/ask-role.ts`. The attempt list built at the `attemptOrder(this.askModels(…), this.entryOf(label))` call filters out entries for which `managers.models.isKnownModel(entry.harness, entry.model)` is false, so a deleted model is never tried (user answer). When the filter leaves nothing, ACP reports the existing `NO_ASK_MODEL` (`ACP: the ask role lists no models.`). The tab's current entry is filtered too, so a session opened before a Delete moves to the next enabled entry on its next attempt.
- **`src/agent/model.ts`**: `selectedModel` takes the available list as a parameter. Its callers in `src/agent/execute.ts` and `src/agent/manager.ts` pass `managers.models.modelsFor('opencode')`
- **`src/completion/handlers.ts`**: `completeHarnessModel` takes a `modelsFor` lookup threaded through `completeCommandLine` in `src/completion/index.ts`, the same way `monitor` and `systemSchedule` are. `src/controller/completion.ts` passes `managers.models`
- **`src/conversations/view.ts`**: `availableConversationModels` and `hasConversationModel` take the catalog lookup as a parameter. `src/conversations/manager.ts` passes `this.managers.models`, and `ConversationResponder` (`src/conversations/responder.ts`) receives it through its constructor
- **`src/plugins/context.ts`**: `harnessLaunchCatalog` reads `managers.models.modelsFor`

Add a disabled-entry case to `src/acp/manager-fallback.test.ts`: the entry is skipped, and if every entry is skipped the result is `NO_ASK_MODEL`. Update the tests that import `harness/models.js`: `src/agent/execute.test.ts`, `src/agent/model.test.ts`, `src/commands/agent.test.ts`, `src/completion/handlers.test.ts`, `src/completion/index.test.ts`, `src/plugins/context.test.ts`. Move `src/harness/models.test.ts` to `src/models/catalog-file.test.ts`.

### 3. The `models-refresh` notification event and the `models` host topic

Add `models-refresh` to `NotificationEventType` and the toggle map (on by default) in `src/notifications/index.ts`. Add it to `NOTIFICATION_ALERT_DEFAULTS` as `{ desktop: true, sound: 'success' }`, and to the `detail ?? ''` passthrough in `src/notifications/format.ts`. It bypasses focus suppression, like `plugin-note` (user-confirmed). Without that, the line would be dropped in the common case, because it's attributed to the models tab the user just clicked Refresh in.

Add a `models` channel with a `{ type: 'changed' }` event to the typed channel map in `src/bus.ts` (beside `sessions: SessionsEvent`).

Add the `models` topic as an additive change, with no `TAB_PLUGIN_API_VERSION` bump. Its types go in a new `src/plugins/api-topics-models.ts`: the notification variant, whose data is the manager's `view()`, and three actions, `{ topic: 'models', action: 'reload' }`, `{ topic: 'models', action: 'refresh' }`, and `{ topic: 'models', action: 'delete', harness, id }`. These join the unions in `src/plugins/api-topics.ts` the way `ConnectionsTopicAction` does, and `models` joins `NOTIFICATION_TOPICS`. Its source goes in a new `src/plugins/models-topic.ts`, registered in the table in `src/plugins/topics.ts`. It subscribes to `messageBus.on('models', 'changed', …)`, reads `managers.models.view()`, and acts by calling `reload()`, `refresh()`, or `delete()`, returning `delete`'s refusal string. Both new files exist because `topics.ts` (220 raw lines) and `api-topics.ts` (185) have no room.

### 4. The `models` tab plugin

`src/plugins/models/manifest.ts`: id `models`, command `models`, `fileExtensions: {}`, `notifications: ['models']`, and capabilities `openOrFocusTab`, `updateTab`, `dockTab`, `topicData`, `topicAction`, `rejectRequest`, `reportFailure`. This matches `sessionsManifest`.

`src/plugins/models/shared.ts` is import-free. Its payload is the groups and `refreshing`. Each group carries a `label` and its rows, and each row carries `harness`, `id`, `name`, and `disabled`. It holds `MODELS_PAYLOAD_SCHEMA_VERSION = 1`, `isModelsPayload`, `isEmptyIntent`, and `isDeleteIntent` (nonempty `harness` and `id`). Like every shared guard it rejects arrays and `null` where an object is required.

`src/plugins/models/activate.ts` builds on `defineDockableList` with topic `models`, instance key `models`, and title `models`. That gives decision 1's command and the repaint on delivery. Its own `command` first calls `topicAction({ topic: 'models', action: 'reload' })`, then delegates to the list's `command`, so decision 8's re-read happens before `topicData` is read. It defines two intents:
- `refresh` calls `topicAction({ topic: 'models', action: 'refresh' })` and returns `null`.
- `delete` calls the delete action, turns a returned refusal into `rejectRequest`, and returns `null`. It keeps no row check of its own, because the manager's refusal already covers an absent, hidden, or disabled record.

Register the plugin in `src/plugins/catalog.ts`, `src/plugins/loaders.ts`, and `web/src/plugins/registry.tsx`, with a schema-version literal of `1`.

`web/src/plugins/models/`:
- **`index.tsx`**: default-exports `ModelsTab` and re-exports `isModelsPayload` as `isPayload`, importing `../shared.css` and `./models.css`, as the sessions entry does.
- **`ModelsTab.tsx`**: the header, the empty state, and the rows. It holds the pending-delete state for `ConfirmDialog`, like `SessionList`'s `pending`.
- **`ModelRow.tsx`**: the wide and narrow renderings, plus the delete button (a `faTrash` icon, label `Delete <id>`), which is omitted on a disabled row.
- **`models.css`**: the frame reuses `plugin-tab`, `plugin-meta`, and `plugin-actions` from `web/src/plugins/shared.css`, as `SessionList` does. Only the table rules live here, under `models-` class names: columns, rows, the fixed-width actions cell, a group heading row, and a dimmed disabled row, with the same padding and widths as the matching `session-` rules in `sessions.css`. This mirrors those values rather than promoting the sessions rules to shared, which would restyle a working tab for one new consumer. If a third list table needs the same rules, promote them to `shared.css` then.

The Refresh button gets `spin` on its `FontAwesomeIcon` and `disabled` while `payload.refreshing` is true. Unlike `SessionList`, the tab doesn't refresh itself on becoming active: Refresh spawns CLIs and calls an API, so it runs only on a click.

### 5. The roles tab

Server, in `src/plugins/roles/`:
- Add `notifications: ['models']` to the manifest. Add a `notify` handler that ignores the topic data and republishes from the roles file and `harnessLaunchCatalog()`.
- A notification has no origin tab, so `rootOf` can't be trusted there. The activation keeps the last root its command or an intent resolved, in a closure variable beside `queue`, and the handler republishes with that root.
- `payloadFrom` marks each entry `missing: true` when its model isn't in `catalog.models[entry.harness]` (decision 24).
- Bump `ROLES_PAYLOAD_SCHEMA_VERSION` to 2, update `isRolesPayload` to accept the optional boolean, and update the roles schema-version literal in `web/src/plugins/registry.tsx`. The picker in `EntryPicker.tsx` keeps reading `catalog.models`.

Client, in `web/src/plugins/roles/`:
- Remove the catalog column from `RolesTab.tsx`.
- Remove `dragCatalogModel`, `dropOnCatalog`, and the catalog drag kind from `roles-dnd.ts`.
- Remove the catalog styles from `roles.css`.
- In `RoleCard.tsx`, render a `missing` entry dimmed with `title="Not in the model catalog"`.

### 6. Specs, help, and docs

- **New `product/specs/models-tab.md`**: the tab, the file, the flags, Delete, Refresh, and the exact strings above.
- **`product/specs/roles.md`**: the two-column layout and catalog drags go, dimmed entries come in, the picker sees only enabled models, and the tab republishes on a catalog change.
- **`product/specs/harness.md`** § Launching with a model and effort level and § What the bundled catalog holds: the new file name, record shape, `disabled`, and live reload. The hand-maintenance rules stay for the bundled file.
- **`product/specs/notifications.md`**: the `models-refresh` event in the event list, the focus-suppression bypass list, and the alert defaults list.
- **`product/specs/tab-plugins.md`** ("This version defines seven kinds of host state") **and `ai/guidelines/plugins-tabs.md`** ("v3 defines seven topics"): both become eight, with the `models` slice described as the visible catalog grouped by provider plus the `refreshing` flag.
- **`product/specs/acp.md`**: an `ask`-role entry whose model is disabled in the catalog is skipped.
- **Help**: a new `help/models.md`, a `help/commands.md` row in its alphabetical place (the order `src/commands.test.ts` enforces), and `help/roles.md` updated.
- **User docs**: a new `documentation/user-documentation/tab-types/models.md`, plus updates to `tab-types/roles.md` and the conversations page's mention of where models come from.

## Tests

- **`src/models/catalog-file.test.ts`** (moved from `src/harness/models.test.ts`): bundled load, override replaces wholesale, the two warnings (the second now naming model-record lists) with fallback, record decoding (missing or empty `id`, non-string `name`, non-boolean flag all reject), round-trip encode writes flags only when true, and a stale `.janissary/harness-models.json` alone is ignored.
- **`src/models/merge.test.ts`**: append new ids in fetched order, keep flags on listed ids, replace names, drop unlisted ids including flagged ones, leave unreached harnesses untouched, and return the counts. For opencode: a reported prefix is synced, an unreported existing prefix is kept whole and returned as unreported, and a new prefix is appended last.
- **`src/models/groups.test.ts`**: provider split and heading names, an unknown prefix shown raw, file order and a new prefix last, hidden records dropped, a disabled-visible record kept with `disabled`, name fallback to id, and every summary-line shape in decision 19 (all reached, some skipped, a timeout, none reached).
- **`src/models/providers/*.test.ts`**: parse each source's real output shape. Codex `visibility` filtering, opencode line parsing, Anthropic paging across two pages, a missing key and a missing binary as skips, a non-2xx answer and a timeout as failures. Spawn and fetch are injected as seams, as `activate(home)` is for roles.
- **`src/models/manager.test.ts`**: Delete seeds the override from the bundled catalog and sets both flags. Delete with a broken override in place replaces it with a seeded one. Delete of an unknown, hidden, or disabled record is refused with `no model "<harness> <id>"`. `reload()` picks up a hand edit and emits only when the catalog changed. `modelsFor` and `isKnownModel` exclude disabled records at once. Refresh is single-flight. Delete during a refresh survives the merge. A failed write reports `Could not write known-models.json at <path>.` and leaves the catalog unchanged. The `'models'`, `'conversations'`, and `'state'` bus emissions fire. Dispose aborts and reports nothing.
- **`src/plugins/models/activate.test.ts` and `shared.test.ts`**: the command (bare, `left`, `right`, a bad argument) issuing `reload` before reading the topic, repaint on delivery, the refresh intent, and delete passing a manager refusal through `rejectRequest`. Also the guards.
- **`src/plugins/topics.test.ts`**: the `models` source's read, subscribe, and both actions.
- **`src/plugins/roles/activate.test.ts` and `shared.test.ts`**: the `missing` flag, the schema-2 guard, and republish on a `models` delivery using the remembered root.
- **Notifications tests** beside `src/notifications/index.ts` and `alert-defaults.ts`: the new event's toggle, alert default, and focus-suppression bypass.
- **`src/harness/manager.test.ts`**: a disabled model refused with the unknown-model message.
- **Client, `web/src/plugins/models/ModelsTab.test.tsx`**: group headings, columns, name fallback, the narrow rendering when docked, the empty state, the Refresh spin and disabled state, the confirm-then-delete flow, and no delete button on a disabled row. Add a `chunk-imports.test.ts` like `web/src/plugins/roles/chunk-imports.test.ts`.
- **Client roles tests**: update `RolesTab.test.tsx` and `roles-dnd.test.tsx` for the removed column and drags, and add a dimmed `missing` entry case.
- **`web/src/plugins/registry.test.tsx`**: the new entry and the roles schema literal.
- **`src/commands.test.ts`**: passes with the new help row and page.

## Out of scope

- Removing a model's record from the catalog file. Delete only sets `disabled` and `hidden`.
- Restoring a deleted model from the tab. The flags are cleared by hand in the file.
- Dragging models from the models tab into the roles tab.
- Watching `known-models.json` for hand edits while the app runs.
- Reading or migrating an old `.janissary/harness-models.json`.
- Layering the override over the bundled catalog. The override stays wholesale.
- Filling display names into the bundled file. Its records carry `id` only until a project refreshes.
- Fetching Google or OpenCode Go lists other than through `opencode models`.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual, in a scratch project with no `.janissary/known-models.json`:
  - Run `models`. The table shows the Anthropic, OpenAI, OpenCode Zen, OpenCode Go, and Google groups with Model, Name, Harness, and actions columns, and Refresh and split at the right of the metadata bar.
  - Run `models left`. The tab docks with two-line rows and the dock-cycle control.
  - Delete a model and confirm the dialog. The row disappears, `.janissary/known-models.json` now exists with `"disabled": true, "hidden": true` on that record, and `harness claude --model <it>` is refused.
  - Open `roles`. The models column is gone, and an entry naming the deleted model is dimmed with the `Not in the model catalog` tooltip.
  - Press Refresh with the notifications feed closed. The icon spins, a toast shows the `Models refreshed: …` line, and the groups update (a new `OpenAI` group under the opencode harness if opencode has OpenAI configured).
  - Unset `ANTHROPIC_API_KEY` and refresh again. The line names `claude skipped: ANTHROPIC_API_KEY is not set.`, and the Anthropic group is unchanged.
