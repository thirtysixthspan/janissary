# Move the scheduling tab into a schedules plugin

**Complexity: 7/10** — larger than the image migration and not purely mechanical. The bundled tab-plugin extension point exists and `plugin-tab-payload-updates.md` deliberately landed the two halves this migration was waiting on (the `schedules` notification topic for its data, plugin-tab docking for its placement), so the tab itself is a migration along an established path. What is genuinely new is that the schedules tab is the first plugin tab that is **not opened on a file**: it reads host state it did not produce, writes host state back, docks itself from a command, and has to survive `profile save`/`profile launch` without a path to reopen from. That needs four additive contract extensions before the migration can start. All four are additive, so `TAB_PLUGIN_API_VERSION` stays at 1 and every existing plugin keeps loading untouched.

## Goal

`schedules`, `schedules left`, and `schedules right` open the aggregated schedule list through a bundled `schedules` tab plugin instead of through a core `schedules` command and a core `view: 'schedules'` tab. Everything the user sees stays the same: the same command grammar, the same singleton open-or-reuse behavior, the same full and compact layouts, the same selection keys, the same clear-all and delete-row confirmations, the same double-click-to-focus-the-owner, the same dock cycle, and the same profile capture and restore. Core stops carrying a schedules view kind, a schedules tab creator, a schedules command, an `aggregatedSchedules` field on every tab view, and two schedule-mutating wire methods.

## Design decisions

1. **Three new server capabilities and one new client capability, all additive.** The schedules plugin needs to read a slice of host state at open time, act on it, and place its own tab. Each is a named capability a manifest must declare, held to that declaration by the existing `restrictToDeclared` (`src/plugins/context.ts:32`), so nothing widens for plugins that do not ask.

2. **`topicData(topic)` reads what a declared topic carries, right now.** `TOPIC_SOURCES.schedules.read` already exists (`src/plugins/notifications.ts:32`) but is dispatcher-internal, so a plugin can only learn a topic's contents when the topic happens to fire. A tab has to be built with the current rows the moment the user types `schedules`. Reusing the same `read` function is what keeps one definition of where a topic's data comes from. Asking for a topic the manifest did not declare is a plugin-authoring mistake and throws, exactly as an undeclared capability does.

3. **`topicAction(action)` acts on a declared topic, through actions the topic itself defines.** The alternative — bare `cancelSchedule`/`clearSchedules`/`focusTab` capabilities — puts a specific host subsystem into the generic v1 capability set and grants any plugin that asks the run of the scheduler and the focus stack. Tying actions to a topic keeps the grant narrow and symmetric with `topicData`: a plugin may act only on state the host already agreed to show it. v1's `schedules` topic defines exactly three, matching the three things the current tab body can do:
   - `{ action: 'cancel', tab, id }` → `ScheduleManager.cancel`,
   - `{ action: 'clear' }` → `ScheduleManager.clearAll`,
   - `{ action: 'focusOwner', tab }` → focus that tab, and only when it currently owns a row in the topic's data, so this is "focus the tab this row belongs to" rather than a general focus-anything grant.

4. **`dockTab(instanceKey, dock)` docks one of the plugin's own tabs.** `schedules left` docks from a command, and no capability could do that — docking was reachable only from the client's dock-cycle control and from profile launch. It mirrors `updateTab`: addressed by the plugin's own id plus instance key, a key with no open tab is a silent no-op, and `null` undocks back to centre and makes the tab active, which is exactly what bare `schedules` on a docked list does today (`src/schedules-tab.ts:19`). It delegates to the same `managers.tab.setDock` the client control uses, so there is still one docking path.

5. **A fifth thing the plugin needs is client-side: `capabilities.dock`.** The compact one-line-per-entry layout is chosen by where the tab is (`SchedulesTab`'s `compact` prop). The host owns that answer and already knows it; a plugin may not read it off the DOM any more than it may read visibility. This is the same category as `active` and is added the same way — a sixth field on `TabPluginClientCapabilities`, `'left' | 'right' | null`.

6. **The plugin renders no dock-cycle control.** Docked, the host's `DockedPluginBody` renders `DockCycleHeader` above the plugin body, as it already does for every docked plugin tab. The plugin keeps its own header row for the clear-all button and `capabilities.splitAction`. A docked schedules list therefore shows the host's chrome row above the plugin's own, rather than the single merged row it has today. That is the documented shape — "the host owns the sidebar frame, including the dock-cycle control … a plugin renders no chrome in either place" (`ai/guidelines/plugins-tabs.md`, Docking) — and taking the exception instead would mean handing a plugin the dock control.

7. **The confirm dialog and the selection arithmetic move into the plugin.** `DeleteScheduleDialog` reaches `ConfirmDialogShell`, and `schedules-keys.ts` sits in core; a client plugin may import neither. Both are small and used by nothing else, so they move under `web/src/plugins/schedules/` rather than becoming a host module a plugin is allowed to reach. The trash icon comes straight from `@fortawesome/free-solid-svg-icons`, the way `VideoTab` already takes `faCamera`, instead of through `web/src/icons.ts`.

8. **The payload carries the rows, and only the rows.** `SchedulesPayload` is `{ entries: ScheduleRow[] }`, where `ScheduleRow` re-declares the six fields of `AggregatedScheduleView` in the import-free shared contract. Re-declaring rather than importing is what that contract requires, and `shared.test.ts` pins the two shapes against each other so they cannot drift.

9. **The tab is a singleton, keyed `'schedules'`.** One instance key means `openOrFocusTab` gives the open-or-reuse behavior for free, `updateTab` addresses it without bookkeeping, and a second `schedules` focuses the existing list exactly as it does today.

10. **The notification keeps the tab current; nothing else does.** `notify` calls `updateTab` with the event's rows. The tab is not refreshed on re-open, because a tab that has been open has been receiving notifications the whole time.

11. **Two wire methods go away.** `cancelSchedule` and `clearSchedules` exist only to serve this tab body (`web/src/SchedulesTab.tsx:58,97`); their work moves behind plugin intents, so leaving them would be a second execution path to the same host action. `aggregatedSchedules` leaves `TabView` for the same reason: it was computed for every tab on every broadcast to serve one tab kind that no longer exists, and the plugin gets its rows through the topic instead.

12. **A plugin tab with no file saves without a path, and relaunches by running its plugin's command.** `writePluginEntry` writes `path: portablePath(instanceKey)` and `buildTarget` reopens with `open <path>` (`src/profile/save-entries.ts:118`, `src/profile/view-tabs.ts:63-70`), which assumes the instance key is a file. Whether it is one is a property of the declaration, not a guess about the string: a plugin claiming no `fileExtensions` cannot be reopened by `open`, so its entry omits `path` and relaunch issues its declared command instead. `path` becomes optional on the entry; every existing profile keeps loading and saving byte-identically.

13. **`type: "schedules"` in an existing profile still works.** It loads as a `plugin` view entry with id `schedules`, exactly the compatibility shim `type: "image"` and `type: "markdown"` already get (`src/profile/file.ts:54-56`). With that, the profile-level `schedules` partition, `ProfileSchedulesEntry`, and `src/profile/schedules.ts` have no remaining source and are deleted.

14. **`fixture-v1` stays frozen.** New capabilities are exercised by declarations built inside the tests that need them; `src/plugins/fixture-v1/compatibility.test.ts` passing unchanged is the proof this is additive.

## What already exists (reuse, don't rebuild)

| Concern | Where it already lives |
| --- | --- |
| Topic subscription, fan-out, budget, failure isolation | `src/plugins/notifications.ts` |
| Where the `schedules` topic's data comes from | `TOPIC_SOURCES.schedules.read` → `managers.schedule.aggregatedView()` |
| Cancel one entry, clear all, with persistence and state emit | `src/schedule/manager.ts` `cancel`, `clearAll` |
| Docking, displacement, undock-and-activate | `src/tab/dock.ts` `applyDock`, reached as `managers.tab.setDock` |
| Replacing a live tab's payload | `src/plugins/context.ts` `updateTab`, `src/tab/openers.ts` `updatePluginTab` |
| Holding a plugin to its declared capabilities | `src/plugins/context.ts:32` `restrictToDeclared` |
| A plugin command claim, and its rejection when it collides | `src/plugins/command-adapter.ts` |
| Docked plugin chrome and the mounted-while-hidden rule | `web/src/plugins/DockedPluginBody.tsx`, `web/src/Sidebar.tsx` |
| The legacy-tab-type compatibility shim shape | `src/profile/file.ts:54-56` |
| Server and client plugin reference implementations | `src/plugins/video/`, `web/src/plugins/video/` |

## Implementation steps

### 1 — Contract additions

- `src/plugins/api.ts`: add `topicData`, `topicAction`, and `dockTab` to `TabPluginCapabilityName` and the `CAPABILITIES` record (keyed by the union, so one without the other fails to compile), and the matching members to `TabPluginServerCapabilities`. Add `TabPluginTopicAction`, a discriminated union over topic and action name, with the three `schedules` members from decision 3. `TAB_PLUGIN_API_VERSION` is unchanged.
- `src/plugins/notifications.ts`: give `TopicSource` an `act(managers, action)` member beside `read`, and implement the three `schedules` actions there, so a topic's data and its actions stay in one place. Export a `readTopicData` and a `runTopicAction` for the capability layer. If this pushes the module past the file-size limit, the sources table moves to its own `topics.ts` beside it.
- `src/plugins/context.ts`: implement the three capabilities. `topicData` and `topicAction` throw when the declaration does not name the topic. `dockTab` delegates to `managers.tab.setDock` after resolving the plugin's own tab by id plus instance key, and no-ops when there is none.
- `web/src/plugins/api.ts`, `PluginBody.tsx`, `PluginTabLayer.tsx`, `DockedPluginBody.tsx`: add `dock` to `TabPluginClientCapabilities` and thread it through (`tab.dock ?? null`).

### 2 — Server plugin

- `src/plugins/schedules/shared.ts`: `SCHEDULES_PAYLOAD_SCHEMA_VERSION = 1`, `ScheduleRow`, `SchedulesPayload`, and hand-written import-free guards `isSchedulesPayload`, `isCancelIntent`, `isFocusIntent`, `isEmptyIntent`.
- `src/plugins/schedules/manifest.ts`: id `schedules`, version `1.0.0`, `tabLabelPrefix: 'schedules'`, `fileExtensions: {}`, `command: 'schedules'`, `notifications: ['schedules']`, capabilities `note`, `openOrFocusTab`, `updateTab`, `dockTab`, `topicData`, `topicAction`, `rejectRequest`, `reportFailure`.
- `src/plugins/schedules/activate.ts`: `command` parses an optional leading `left`/`right`, opens or focuses the singleton with a payload built from `topicData('schedules')`, then calls `dockTab('schedules', side ?? null)`; a trailing argument that is neither is rejected. `notify` calls `updateTab` with the event's rows. `intent` answers `clear`, `cancel`, and `focus-owner` through `topicAction`, rejecting an unknown name or a malformed payload and reporting a failure for a tab payload that is not one of ours (matching video). `opener.inline`/`opener.external` are unreachable — the manifest claims no extensions — and reject.
- Register in `src/plugins/catalog.ts` and `src/plugins/loaders.ts`.

### 3 — Client plugin

- `web/src/plugins/schedules/`: `index.tsx` (default export plus `isPayload`), `SchedulesTab.tsx` moved from `web/src/`, `schedules-keys.ts` moved from `web/src/`, and `DeleteScheduleDialog.tsx` rewritten against its own markup instead of `ConfirmDialogShell`.
- The component takes `{ payload, capabilities }`: rows from `payload.entries`, `compact` from `capabilities.dock !== null`, split from `capabilities.splitAction`, and clear / delete / focus-owner through `capabilities.intent`. No `client`, no `index`, no `tabs` prop.
- `web/src/plugins/registry.tsx`: add the `schedules` loader and registration with its schema-version literal.

### 4 — Remove the core schedules tab

- Delete `src/schedules-tab.ts`, `src/commands/schedules.ts`, `src/profile/schedules.ts`, `web/src/SchedulesTab.tsx`, `web/src/schedules-keys.ts`, `web/src/DeleteScheduleDialog.tsx`, and their tests, after porting the cases listed under Tests.
- Drop `schedules` from `src/commands/index.ts`, `makeSchedulesTab` (`src/tab/index.ts`), `addSchedulesTab` (`src/tab/creators.ts`), `openSchedulesTab` (`src/tab/openers.ts`, `src/tab/opening-state.ts`), and `'schedules'` from the view unions in `src/tab/types.ts` and `src/protocol.ts`.
- Drop `aggregatedSchedules` from `src/protocol.ts`, `src/tab/view.ts`, `src/tab/manager.ts`, and the `managers.schedule.aggregatedView()` argument in `src/controller.ts`.
- Drop `cancelSchedule` and `clearSchedules` from `src/protocol.ts`, `src/client-message.ts`, `src/message-handler.ts`, and `src/controller.ts`.
- Client: drop the schedules branches in `web/src/ViewTabBody.tsx` and `web/src/Sidebar.tsx`, and `'schedules'` from `web/src/useViewSearchState.ts`.

### 5 — Profiles

- `src/profile/types.ts`: `path` becomes optional on `ProfilePluginTabFile` and on the `plugin` member of `ProfileViewEntry`; delete `ProfileSchedulesEntry`, `ProfileSchedulesTabFile`, and `LoadedProfile.schedules`.
- `src/profile/schema.ts`: a `plugin` entry requires `id` and accepts an optional string `path`; `schedules` stays a recognized on-disk type, validated as before.
- `src/profile/file.ts`: `schedules` partitions into `views` as `{ type: 'plugin', id: 'schedules', dock }`; the `plugin` case passes `path` through when present.
- `src/profile/save-entries.ts`: `writePluginEntry` omits `path` when the owning declaration claims no file extensions.
- `src/profile/view-tabs.ts`: a path-less `plugin` target runs the plugin's declared command and matches on plugin id alone.
- `src/profile/save-route.ts`: drop the `schedules` case; a docked schedules tab is now captured by the `plugin` case. Keep `dockedViews` counting the notifications tab.
- `src/profile/agent-opener.ts` and `src/profile/manager.ts`: drop `openProfileSchedules` and the `schedules` term from the entry count.

## Tests

Contract (`src/plugins/context.test.ts`, `src/plugins/notifications.test.ts`, built from test-local declarations):

- `topicData` returns the current rows for a declared topic; asking for an undeclared topic disables the plugin; omitting the capability from the manifest and calling it disables the plugin.
- Each of the three `schedules` actions reaches its manager method; `focusOwner` for a tab owning no row changes nothing; an undeclared topic disables the plugin.
- `dockTab` docks, undocks (making the tab active), no-ops for an unknown instance key, and cannot dock another plugin's tab.
- `src/plugins/fixture-v1/compatibility.test.ts` and `src/plugins/documentation.test.ts` pass, the latter with the new counts.

Server plugin (`src/plugins/schedules/activate.test.ts`, modeled on `video/activate.test.ts`):

- `schedules` opens a tab whose payload carries the current rows; a second `schedules` focuses the same tab rather than opening a second.
- `schedules left` / `schedules right` dock it; bare `schedules` on a docked tab undocks it; an unrecognized argument is rejected.
- A `schedules` notification replaces the tab's rows.
- `clear`, `cancel`, and `focus-owner` intents reach their actions; a malformed payload and an unknown intent are rejected; a foreign tab payload reports a failure.
- `isSchedulesPayload` accepts a complete payload and rejects `null`, an array, and each missing field; `shared.test.ts` pins `ScheduleRow` against `AggregatedScheduleView`.

Profiles:

- A docked schedules plugin tab saves as a `plugin` entry with `dock`, no `path`, and no presentation keys.
- A file-opened plugin tab still saves with `path` (regression guard for decision 12).
- A path-less `plugin` entry relaunches by running the plugin's command; a legacy `type: "schedules"` entry does the same.
- `src/profile/validate.test.ts`: a `plugin` entry missing `id` is still reported; one missing `path` is not.

Client (`web/src/plugins/schedules/SchedulesTab.test.tsx`, ported from the existing suite):

- Full and compact layouts render their headings and rows, compact selected by `capabilities.dock`.
- Arrow/Home/End selection, Enter focusing the owner, Backspace/Delete opening the confirm dialog and confirming sending the `cancel` intent, and the clear button sending `clear` and being disabled when empty.
- The empty state renders when there are no rows.
- `web/src/plugins/registry.test.tsx`: the schedules schema-version literal matches the plugin's own constant.
- `web/src/plugins/PluginTabLayer.test.tsx` / `DockedPluginBody.test.tsx`: the capability object reports `dock` as the tab's side, and `null` in the centre.

## Out of scope

- Any change to how the schedules list looks or behaves beyond what the migration forces, other than the extra docked chrome row decision 6 accepts.
- The `schedule` (singular) command, the launch dialog, the per-tab schedule panel, and `ScheduleManager` itself, beyond being reached through `topicAction`.
- Further notification topics, and any topic action beyond the three v1's `schedules` topic defines.
- Any behavior change to the sidebar's profile-declared focus. The `focusLeft`/`focusRight` wire union does lose its `'schedules'` member, because that member named a view kind this change removes and only ever matched against one; no code path has ever emitted it, so the narrowing is types only.
- The embedded browser tab migration, which keeps its own backlog issue and needs a claim kind this plan does not add.
