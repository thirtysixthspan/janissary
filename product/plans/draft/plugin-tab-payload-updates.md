# Host-pushed payload updates for a live plugin tab

**Complexity: 5/10** — two mechanisms sharing one write path. The capability itself is small and mirrors the creation path; the notification side adds a declaration field, an activation hook, a host-owned bus subscription with its own delivery rules and budget, and a new low-frequency event at its source. No new wire surface and no client change, but the lazy-activation, fan-out, and failure rules all have to be got right.

A bundled tab plugin can open a tab and can answer intents about it, but it cannot change what that tab shows once the tab exists. The payload is produced by the factory `openOrFocusTab` runs at creation (`src/plugins/context.ts:63`, `openOrFocusTab`) and is never written again, so every plugin view is effectively frozen at open time. That is the single missing capability behind two blocked migrations: an embedded browser tab whose url, domain, and strip name change when the user navigates it, and any view whose contents move on after the tab opened. The audio-player plugin sitting in `product/backlog/features.md` under `## development` needs the same thing for its playlist.

This plan adds an eighth v1 server capability, `updateTab(instanceKey, factory)`, that a plugin may call from any guarded handler — an opener, its declared command, or an intent — to replace the payload and, when it wants to, the title of a tab it already owns. The host resolves the tab by the plugin's own id plus the instance key, runs the factory, re-validates the result exactly as it validates a payload at creation, writes it onto the tab, and emits a state broadcast. Adding an optional capability is an additive change under `ai/guidelines/plugins-tabs.md` ("Additive optional declaration fields, capabilities, or hooks keep v1 compatible"), so `TAB_PLUGIN_API_VERSION` stays at 1 and every existing plugin keeps loading untouched.

A capability alone only covers plugins that are already running something the user asked for. A view whose data changes with nothing in flight — a schedules tab redrawing because a schedule fired — needs the host to speak first. So this plan also adds **host notification topics**: a manifest may declare an interest in named, low-frequency host signals, and the activation may supply a `notify` handler the host calls, guarded, when one fires. The handler responds by calling `updateTab`, so both mechanisms end at the same write path and there is still exactly one way a plugin tab's contents change.

The two are deliberately asymmetric. A capability is how a plugin pushes what it already knows; a notification is how the host hands a plugin a slice of state the plugin has no other way to see — the honest shape for a schedules view, since the schedule set belongs to the host and always will. Nothing here lets a plugin subscribe to the raw state broadcast: `state: dirty` fires on essentially every mutation, including per-keystroke shell output (`src/controller/events.ts:11`, `messageBus.on('state', 'dirty', () => sinks.emitState())`), and a plugin handler on that path is exactly what `ai/guidelines/plugins.md` §9 warns against.

## Design decisions

1. **A new server capability, `updateTab(instanceKey, factory)`.** It mirrors `openOrFocusTab`: the plugin names the instance key of the tab it wants to change and supplies a factory returning the new value. The alternatives were rejected deliberately — a live update handle held by the plugin would put host state in plugin hands across calls and require revocation on every close and disable, and an intent-returns-a-payload rule would tie every update to a client request and give openers and commands no way to change anything.

2. **Callable only from inside a guarded handler.** An update runs under the same 5000 ms per-call budget and failure boundary as every other capability (`src/plugins/host.ts`, `handlerTimeoutMs`; `src/plugins/invoke.ts`). A plugin that omits `updateTab` from its manifest and calls it anyway is a broken plugin: `restrictToDeclared` (`src/plugins/context.ts:32`) already replaces every undeclared capability with a thrower, and that path needs no new code — only a test proving it covers the new name.

3. **The factory may return a title as well as a payload.** They move together for the case that motivates this: a page tab that navigates changes its address and the name in the tab strip in one step, which is exactly what `navigatePageTab` does today (`src/tab/navigate.ts:14`, assigning `tab.page` and `tab.title` together).

4. **A returned title replaces whatever the tab's title currently is, including a user's rename.** `renameTabOp` (`src/tab/rename.ts:27`, `tab.title = trimmed`) and a pushed title write the same field, and the existing page tab already overwrites a user alias when it navigates. A factory that returns no title leaves the current title alone, so a plugin with nothing to say about naming never disturbs an alias. The title is not length-capped: creation-time titles are not capped either (`src/tab/creators.test.ts`, "retains a long filename as the complete tab title"), and `TAB_RENAME_MAX_LENGTH` governs user renames only.

5. **File references are fixed at creation.** An update cannot register a new file to serve. `registerFile` is available only inside the creation factory, which closes over `acceptingResources` and refuses late calls (`src/tab/openers.ts:53`, `'plugin tab resources are no longer available'`); growing the reference set over a tab's lifetime means the host must track and release additions on close, which neither blocked migration needs.

6. **The instance key never changes.** It is the tab's identity for reopening, profile capture (`src/profile/save-entries.ts`, `writePluginEntry`), and de-duplication, so an update addresses a tab by that key and cannot rewrite it. A plugin wanting a different identity opens a different tab.

7. **A tab that is gone makes the update a silent no-op.** A closed tab, an unknown instance key, or a plugin already disabled produces nothing — no throw, no note, no state emit — which is how `note` and `openOrFocusTab` already behave when their origin tab has disappeared (`src/plugins/context.ts:57-66`, the `isEnabled()` and origin-label guards).

8. **An invalid payload disables the plugin.** A result failing the plugin's own `isPayload` guard or `isJsonCompatible`, or an empty returned title, throws — crossing the failure boundary exactly as an invalid payload at creation does (`src/plugins/context.ts:74-77`). The existing rule stands: producing a value the plugin's own contract rejects means the plugin is broken, not that a caller got something wrong.

9. **`fixture-v1` stays frozen.** The frozen fixture declares four capabilities today (`src/plugins/fixture-v1/manifest.ts:15`) and is the definition of v1 compatibility, not a demonstration of every capability. It must keep passing `src/plugins/fixture-v1/compatibility.test.ts` unchanged — that unchanged pass is the evidence this addition is additive. New behavior is exercised by declarations built inside the tests that need them, the way `src/plugins/grouping.test.ts` and `src/plugins/teardown.test.ts` already construct a host from a test-local manifest and loader map.

10. **No wire or client change.** A plugin tab's envelope already rides inside the tab view on every state broadcast (`src/tab/view.ts:67-71`, the `plugin` field), and the client re-checks the payload against the plugin's own guard on every render (`web/src/plugins/registry.tsx:47-51`, `ValidatedPlugin`). Writing the tab and emitting `state: dirty` is the whole delivery path.

11. **Notification interest is declared statically.** A manifest may carry an optional list of host topics. Discovery reads it without importing plugin code, so the host knows which plugins care before any of them loads — the static-declaration rule from `ai/guidelines/plugins.md` §3, and an additive optional declaration field, so the API version still does not move.

12. **v1 ships exactly one topic: `schedules`.** It carries the aggregated schedule rows the host already computes (`src/schedule/views.ts:19`, `aggregatedScheduleView`), typed as `AggregatedScheduleView` from `src/protocol.ts:39` and re-exported through `src/plugins/api.ts` the way that module already re-exports wire types (`src/plugins/api.ts:113`). Each further topic is its own additive change with its own justification; a topic must be a named, already-coalesced signal, never a firehose.

13. **A notification reaches only a plugin that is already active and already owns at least one tab.** It never activates a dormant plugin, so a plugin nobody has used still costs nothing (`ai/guidelines/plugins.md` §6). A plugin with no open tabs has nothing to update, which makes the owns-a-tab test both the cheap gate and the correct one.

14. **The event carries the topic, its data slice, and the instance keys of that plugin's own open tabs.** The host computes that key set anyway to decide whether to deliver, so passing it costs nothing and leaves the plugin stateless — no per-plugin bookkeeping of which tabs it opened, and no stale keys to reason about.

15. **A notification handler is guarded, budgeted at 1000 ms, and its return value is ignored.** It is a notification, not a provider: it cannot influence any host outcome (`ai/guidelines/plugins.md` §5). Fan-out is concurrent with no ordering guarantee between plugins. A throw or a timeout disables that plugin exactly as any other guarded call does, and one slow plugin never stalls another.

16. **During a notification, `note` writes nowhere.** The capability object is built with an empty originating label, and `note` already no-ops when no tab matches its origin (`src/plugins/context.ts:59`). Background work must not append to a transcript the user did not point at it.

17. **Declaring a topic without supplying `notify` disables the plugin at activation.** A command claim with no handler is answered as a rejection because a command has a caller and a transcript to answer into; a notification has neither, so the mismatch is caught the first time the host holds the activation object and recorded as a reason the `plugins` command reports.

18. **No debouncing in v1, because every source is already coarse.** The `schedules` topic fires where the schedule manager already marks state dirty — add, remove, clear, and a tick that actually changed something (`src/schedule/manager.ts:23`, `:29`, `:86`, `:99`, `:130`) — and that tick runs at most once a second (`src/schedule/manager.ts:46`, `setInterval(… , 1000)`). The ceiling is therefore about one notification per topic per second, and it is deliberate: a future topic that can fire faster must coalesce at its own source rather than pushing that job into the dispatcher.

19. **The host holds the subscription, not the plugin.** One bus subscription serves every plugin, taken when the host is constructed and only if some declaration names a topic, and released in the host's existing `dispose`. This is what makes a plugin-held update handle unnecessary: there is no plugin-side object to revoke when a tab closes or a plugin is disabled.

## What already exists (reuse, don't rebuild)

| Concern | Where it already lives |
| --- | --- |
| Building the capability object; holding a plugin to its declared set | `src/plugins/context.ts:47` `createPluginContext`, `src/plugins/context.ts:32` `restrictToDeclared` |
| Validating a produced value: nonempty title, plugin guard, JSON compatibility | `src/plugins/context.ts:72-78` (the `openOrFocusTab` factory wrapper), `src/plugins/context.ts:14` `isJsonCompatible` |
| Finding a plugin tab by id plus instance key, then emitting state | `src/tab/openers.ts:33-40` (the existing-tab branch of `openPluginTab`) |
| Exposing a tab operation to the capability layer without reaching into tab internals | `src/tab/opening-state.ts:19` `openPluginTab`, reached as `managers.tab.openPluginTab` |
| Guarded invocation, per-call budget, rejection vs failure classification | `src/plugins/invoke.ts` `invokePlugin`, `src/plugins/host.ts` `runGuarded`/`invoke` |
| Disabling a plugin, recording the reason, closing the tabs it owns | `src/plugins/failure.ts`, `src/plugins/teardown.ts` `closePluginTabs` |
| Capability names as data, so an undeclared name is a compile error | `src/plugins/api.ts:5` `TabPluginCapabilityName`, `src/plugins/api.ts:18` the `CAPABILITIES` record |
| Delivering a changed payload to a mounted view without remounting it | `src/tab/view.ts` (plugin envelope), `web/src/plugins/PluginBody.tsx`, `web/src/plugins/PluginTabLayer.tsx` |
| A tab whose title and payload already change together in place | `src/tab/navigate.ts:9` `navigatePageTab` |
| Building a host from a test-local manifest and loader map | `src/plugins/grouping.test.ts`, `src/plugins/teardown.test.ts` |
| A typed pub/sub bus with per-listener error isolation and unsubscribe | `src/bus.ts` `MessageBus`, `BusChannels`, `messageBus` |
| The points at which the schedule set is already known to have changed | `src/schedule/manager.ts:23`, `:29`, `:86`, `:99`, `:130` (each already emitting `state: dirty`) |
| The aggregated schedule rows a `schedules` topic would carry | `src/schedule/views.ts:19` `aggregatedScheduleView`, `src/schedule/manager.ts:110` `aggregatedView()` |
| Re-exporting a wire type through the plugin API rather than letting a plugin import `../protocol.js` | `src/plugins/api.ts:113` (`PluginFailedRequest`, `PluginIntentRequest`, `PluginTabView`) |
| Recording why a plugin is disabled and reporting it to the user | `src/plugins/status.ts` `recordStatus`, `src/commands/plugins.ts` |

## Proposed changes

**The contract (`src/plugins/api.ts`).** Add `updateTab` to `TabPluginCapabilityName` and to the `CAPABILITIES` record — the record is keyed by the union precisely so adding one without the other fails to compile. Add the matching member to `TabPluginServerCapabilities`, taking an instance key and a factory returning the new tab value. Introduce a result type for that factory carrying a required payload and an optional title, deliberately distinct from `TabPluginPayload`, whose title is required and whose factory receives the `TabPluginResources` this one does not. `TAB_PLUGIN_API_VERSION` is unchanged, and the file is 121 lines, comfortably inside the 200-line limit.

**The capability (`src/plugins/context.ts`, 95 lines).** Implement `updateTab` beside `openOrFocusTab`, keeping the same shape: return early unless `isEnabled()`, then delegate to the tab manager, wrapping the plugin's factory so the payload is checked against `activation.isPayload` and `isJsonCompatible` and a supplied title is checked for emptiness before anything is written. The two factory wrappers now share their validation; extract that shared check into a small named helper in the same module rather than duplicating it, which also keeps the file short. Unlike `openOrFocusTab`, this capability does not require the originating tab to still exist — the update targets the plugin's own tab, not the transcript that asked for it.

**The tab-side write (`src/tab/openers.ts` 106 lines, `src/tab/opening-state.ts` 48 lines).** Add an update operation beside `openPluginTab` that finds the tab whose plugin id and instance key both match, returns without side effects when there is none, and otherwise runs the factory, replaces `payload` on the plugin record, replaces `title` when the factory returned one, and emits `messageBus.emit('state', { type: 'dirty' })`. It must not move focus, reorder tabs, or touch `fileRefs`, `sourceLabel`, `instanceKey`, or `schemaVersion`. `TabOpeningState` exposes it exactly as it exposes `openPluginTab`, so the capability reaches tabs only through the manager.

**The notification topic at its source (`src/bus.ts`, `src/schedule/manager.ts` 165 lines).** Add a `schedules` channel to `BusChannels` carrying a single `changed` event, and emit it beside each of the five existing `state: dirty` emits in the schedule manager. The event carries no data: the dispatcher reads the current rows from `managers.schedule.aggregatedView()` when it delivers, so a notification can never carry a stale snapshot, and a topic with no interested plugin costs one bus emit into an empty listener set.

**The declaration and the activation hook (`src/plugins/api.ts`).** Add an optional topic list to `TabPluginDeclaration` and a union type naming the topics v1 defines, with `schedules` its only member — as a record keyed by that union, matching how `CAPABILITIES` makes an unlisted name a compile error rather than a runtime surprise. Add an optional `notify` member to `TabPluginActivation` taking the event and the capability object, and a type for the event carrying its topic, its data, and the plugin's own open instance keys. Re-export `AggregatedScheduleView` here so a plugin types its handler without importing `../protocol.js`, which the plugin import boundary forbids (`eslint.plugin-boundaries.mjs`, the `src/plugins/*/**` rule).

**The dispatcher (`src/plugins/host.ts`, 227 lines — extract rather than extend).** The host is already at the file-size ceiling's edge, so notification delivery belongs in its own module beside it — a dispatcher the host constructs, subscribes once if any declaration names a topic, and disposes with everything else. On an event it walks the plugins declaring that topic, skips any that is disabled, not yet active, or owns no tab, builds the event's key set from the tabs it does own, and makes one guarded call per plugin through the existing `invokePlugin` path with the 1000 ms budget and an empty origin label. A plugin whose declaration names a topic but whose activation supplies no `notify` is disabled the first time the host validates its activation object, per decision 17.

**Documentation, which a test already enforces.** `src/plugins/documentation.test.ts` pins three facts against `TAB_PLUGIN_CAPABILITY_NAMES`, and all three fail until the docs move with the code: `documentation/developer-documentation/tab-plugins.md` must contain the sentence `The host supplies eight capabilities:` (the count word comes from that test's `COUNT_WORDS` table), a bullet beginning `` - `updateTab( ``, and a changelog sentence reading `eight server and five client capabilities.` The same file's fixture manifest block is pinned against `fixtureV1Manifest.capabilities`, so it must stay as it is — decision 9 keeps the fixture unchanged, which keeps that assertion satisfied. The reference also gains a notifications section: the one topic v1 defines, what its event carries, the delivery rules from decisions 13 to 18, and the budget. `ai/guidelines/plugins-tabs.md` states the server capability object has "exactly seven functions" and needs the same correction plus both new entries' rules. `product/specs/tab-plugins.md` gains a short subsection: a plugin may replace what one of its tabs shows, the tab keeps its place, identity, and focus when that happens, a stale target is ignored, a plugin that produces an invalid replacement is disabled like any other broken plugin, and a plugin may ask to be told when a named kind of host state changes so a view can keep up with it.

**Ordering.** Land the capability first and completely — contract, tab operation, capability, documents — since it is the write path the notification side calls into and it is independently useful (it unblocks the embedded browser tab on its own). The notification side follows in the same order: the bus channel and its emits, then the declaration and activation types, then the dispatcher, then the documents. Typecheck stays green at each point; the documentation test goes red the moment `TAB_PLUGIN_CAPABILITY_NAMES` grows and green again when the three strings above are in place, so that doc edit belongs in the same change as the capability rather than a follow-up.

## Tests

Server, colocated as `src/plugins/*.test.ts`, following `context.test.ts` and `host.test.ts` and building any new plugin declaration test-locally per decision 9:

- A plugin calling `updateTab` from an intent replaces the payload the next tab view carries, and leaves the tab's label, position, group, focus, instance key, schema version, source label, and file references untouched.
- A factory returning a title changes the tab's strip title, including over a title a user had renamed; one returning no title leaves the existing title in place.
- An update naming an instance key with no open tab, and an update from a plugin already disabled, are both no-ops: no state emit, no note, no failure, plugin still enabled.
- An update naming an instance key owned by a *different* plugin does nothing, so one plugin cannot write another's tab.
- A payload failing the plugin's own guard, a payload that is not JSON-compatible, and an empty returned title each disable the plugin with the recorded reason and close the tabs it owns.
- A plugin whose manifest omits `updateTab` and calls it anyway is disabled for using an undeclared capability.
- An update issued from an opener applies, so the capability is not intent-only. One non-intent handler is enough: `createPluginContext` builds the same object for every guarded call and branches on nothing about the handler kind.
- `src/plugins/fixture-v1/compatibility.test.ts` passes unchanged — the additive-change proof.
- `src/plugins/documentation.test.ts` passes with the new count, which it derives from `TAB_PLUGIN_CAPABILITY_NAMES` rather than a literal.

Notifications, in their own test file beside the dispatcher module:

- A plugin declaring `schedules` with an open tab receives one notification per bus event, carrying the current aggregated rows and the instance keys of its own tabs and no others.
- A plugin that declares the topic but owns no tab receives nothing, and — the lazy-loading guarantee — a declared-but-never-activated plugin is not imported by a notification: its loader is never called.
- A plugin that does not declare the topic receives nothing.
- A disabled plugin receives nothing, and a plugin disabled by one notification still receives no further ones.
- A `notify` handler that throws, and one that exceeds the 1000 ms budget, each disable that plugin and close its tabs, while a second plugin subscribed to the same topic still receives the same event.
- A handler's return value is ignored: returning a value, or a rejected promise's absence of one, changes nothing about the host.
- `note` called from inside a notification appends to no transcript.
- A declaration naming a topic whose activation supplies no `notify` is disabled at activation, with a reason naming the topic.
- Disposing the host unsubscribes: a bus event emitted afterwards reaches no plugin.
- End to end, at the level `grouping.test.ts` works: adding a schedule emits the topic, and a subscribed plugin's `notify` handler calling `updateTab` leaves the new rows in that tab's payload.

Client, colocated as `web/src/plugins/*.test.tsx`:

- A mounted plugin body re-renders with a payload that changed on a state broadcast without remounting the plugin's chunk — the property that keeps video playback and scroll position alive across an update. This is the only new client test: a payload failing the entry's guard is already covered at `web/src/plugins/PluginTabLayer.test.tsx:158-166`, which asserts the `pluginFailed` report carrying `'invalid plugin payload'`, and that path is unchanged here.

## Out of scope

- **A plugin subscribing to arbitrary host state**, and any topic beyond `schedules`. Each further topic is an additive change with its own justification; the raw state broadcast is never a topic.
- **A plugin emitting its own events**, or one plugin being notified about another's.
- **Registering new files to serve during a tab's life**, and any change to how file references are tracked or released.
- **Changing a tab's instance key, schema version, plugin id, focus, position, or group** through an update.
- **Queueing an update for a tab that might reopen later**, and replaying a missed notification to a plugin that activates afterwards.
- **Extending or re-freezing `fixture-v1`**, and any change to `TAB_PLUGIN_API_VERSION`, the client capability object, or the wire protocol.
- **Docking a plugin tab into a sidebar.** `web/src/Sidebar.tsx:110-121` renders docked bodies by hardcoded view kind (`files`, `notifications`, `schedules`), and the selection state at `:46` is typed to the same three and a plugin tab has no docked rendering path. The scheduling tab is a docked singleton, so it needs that as well as this plan — see Open questions.
- **The two blocked migrations themselves** — the embedded browser tab and the scheduling tab each keep their own backlog issue and their own plan. This plan removes the contract obstacle in front of both; it does not perform either migration.

## Open questions

- The scheduling tab is a docked singleton, and sidebar rendering still dispatches on a fixed set of view kinds (see Out of scope). That migration therefore needs a second enabling change — letting a plugin tab dock — which is a UI-shaped decision rather than a contract one and belongs in its own plan. Nothing in this plan is wasted on it: the schedules topic and `updateTab` are what that migration needs for its *data*, and docking is what it needs for its *placement*.

## Verification

Run `./scripts/run.mjs check-diff`; it must be clean, including `src/plugins/documentation.test.ts` and the frozen `src/plugins/fixture-v1/compatibility.test.ts`.

Manual check, the capability: open a video tab with `open <video>`, and from a scratch build in which the video plugin's intent handler calls `updateTab` with changed metadata, confirm the header shows the new values while playback continues uninterrupted and the tab keeps its position in the strip. Rename that tab first to confirm a returned title replaces the alias and an absent one preserves it. Then close the tab, issue the same update again, and confirm the app keeps running with the plugin still reported as active by the `plugins` command (`src/commands/plugins.ts`).

Manual check, notifications: with that same build declaring the `schedules` topic, add a schedule with `schedule` and confirm the plugin tab's payload picks up the new row without any user action in that tab, that removing the schedule does the same, and that a tick firing a recurring entry refreshes it at most once a second. Then close the plugin's tab and confirm the notifications stop arriving — `plugins` still reports it active, and the app's own schedules tab keeps updating as it always did.
