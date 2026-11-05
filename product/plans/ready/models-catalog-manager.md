# Model catalog manager

**Complexity: 5/10** — this adds serialized persistence, concurrent refresh, cancellation, and cross-manager change signals around the provider primitives.

## Goal

Add the long-lived model catalog service that owns the effective catalog, serializes Delete and Refresh writes, and publishes successful changes immediately to core consumers.

## Decisions and dependencies

- Depends on the completed `product/plans/complete/models-catalog-records.md` and `product/plans/complete/models-provider-refresh-primitives.md` subplans.
- Construct `ModelCatalogManager` with the shared `Managers` object and `{ projectDir }`, following `ConversationsManager` in `src/conversations/manager.ts:38` (`constructor(private managers: Managers, options: ManagerOptions = {})`). Resolve an omitted project directory to `process.cwd()`, as `TabManager` does in `src/tab/manager.ts:49` (`constructor(managers, projectDir?)`).
- At construction, read the effective catalog once without emitting change events. Expose `modelsFor(harness: string): string[]`, `isKnownModel(harness: string, id: string): boolean`, `view(): { groups: ModelGroup[]; refreshing: boolean }`, synchronous `reload(): void`, `delete(harness: string, id: string): Promise<string | undefined>`, `refresh(): Promise<void>`, and `dispose(): void`.
- `modelsFor` returns ids whose records are not disabled; `isKnownModel` tests that same list. `view()` returns `{ groups: groupModelCatalog(catalog), refreshing }`, using the existing group shape from `src/models/groups.ts:5` (`ModelGroup`). Hidden records are omitted from the view there, while disabled visible records retain `disabled: true`. The later host-topic action calls `reload()` before returning `view()` for the `models` command.
- `delete(harness, id)` returns `no model "<harness> <id>"` unless the current record exists and is both visible and enabled. A valid Delete clones the catalog, sets both flags to `true` on that record, and writes the complete effective catalog to the latest `CatalogRead.overridePath` from `readCatalog` (`src/models/catalog-file.ts:66`). It never removes the record. A write failure returns no refusal string; the notification is the user's feedback.
- All Delete and post-fetch Refresh read/merge/write steps use one serialized promise chain. Each queued step waits for the previous promise to settle, even if that action failed, then calls `reload()` before its read-modify-write. `refresh()` also calls `reload()` at entry before launching providers, so a hand edit is applied even when no provider is reached. It starts all three existing provider functions concurrently with the same `AbortSignal`, waits for all outcomes, then joins the write chain and reloads again before merging. Thus a Delete queued while providers are fetching completes before the merge step, which preserves its flags on still-listed ids.
- Compare reload results structurally, including harness and record order and every record field. A changed reload replaces the in-memory catalog and emits `messageBus` `models:changed`, `conversations:changed`, and `state:dirty`; an unchanged reload emits nothing. Apply a candidate catalog in memory only after `writeCatalog` succeeds. If a write fails, leave the file and the post-reload catalog in effect, discard the candidate, and report the write error; a change discovered by the initial reload is still published.
- `refresh()` is single-flight: while one call is active, another call returns the active promise without starting more provider work or emitting another `refreshing` transition. Set `refreshing` before provider work and clear it in `finally`; emit `models:changed` on both transitions. After any successful write, also emit `models:changed`, even when the resulting catalog is structurally unchanged. Emit `conversations:changed` and `state:dirty` only when the catalog value changes.
- Use `mergeModelCatalog`'s `reachedHarnesses` as the write gate: when it is empty, do not write, but still report the `Models not refreshed:` summary. Otherwise write the merged catalog, then report `summarizeModelRefresh(merge, outcomes)`. If a write fails, report only `Could not write known-models.json at <path>.` through the same event, and do not publish the candidate catalog.
- Add `models-refresh` as an explicit notification event with a default-on `NotificationConfig.events.modelsRefresh` toggle. Follow the `system-schedule-fire` path in `src/notifications/index.ts`: honor the toggle while bypassing active-tab focus suppression, and keep the rule that the notifications tab cannot notify itself. Add its desktop-success alert default and make `notificationText` return the supplied detail unchanged. Attribute notices to the open `models` tab's label, or the literal `models` when that tab is closed.
- `dispose()` marks the manager disposed and aborts its active refresh. Check the abort/disposed state after providers settle and before the queued write, so an aborted refresh neither writes nor reports; clear `refreshing` once. Do not add a tab-plugin API version bump for the later additive topic.

## Existing code to reuse

| Need | Existing code |
| --- | --- |
| Serialized write queue pattern | `queue`, `settle`, and the queued read-modify-write in `src/plugins/roles/activate.ts:41-104` |
| Effective catalog reads and atomic writes | `readCatalog` and `writeCatalog` in `src/models/catalog-file.ts:66,86`; `writeCatalog` uses `atomicWriteFile`, which throws without replacing the target on failure (`src/atomic-write.ts:8`) |
| Provider outcomes and merge reporting | `fetchOpenCodeModels`, `fetchCodexModels`, and `fetchAnthropicModels` in `src/models/providers/`; `mergeModelCatalog` and `summarizeModelRefresh` in `src/models/merge.ts` and `src/models/groups.ts` |
| Manager registration and teardown order | `Managers`, `MANAGER_DISPOSE_ORDER` in `src/managers.ts`, and `createManagers` in `src/controller/create-managers.ts` |
| Notification dispatch, focus rules, and formatting | `notify`, `EXPLICIT_EVENTS`, the `system-schedule-fire` toggle path, and `notificationText` in `src/notifications/index.ts` and `src/notifications/format.ts`; defaults in `src/notifications/alert-defaults.ts` |

## Proposed changes

1. Add `ModelCatalogManager` in `src/models/manager.ts`, keeping it below 200 nonblank, noncomment lines. Implement the API and state transitions above. Use injectable provider functions and a `writeCatalog` seam in manager options so tests can supply deferred outcomes and write failures without invoking CLIs or the network; follow the `ConversationManager` options pattern. Do not shorten comments or compact code to meet the limit.
2. Register the manager as `managers.models` in `src/managers.ts` and `src/controller/create-managers.ts`, after the tab and notification managers exist. Add it next to `conversations` in `MANAGER_DISPOSE_ORDER`. Add a typed `{ type: 'changed' }` models event in `src/bus.ts` beside `conversations`.
3. Add `models-refresh` to `NotificationEventType`, `EXPLICIT_EVENTS`, and `NotificationConfig.events` as `modelsRefresh`, defaulting to `true`. In `shouldNotify`, check this toggle like `system-schedule-fire` while preserving explicit focus bypass and notifications-tab self suppression. Set its alert default to `{ desktop: true, sound: 'success' }` and pass its detail through `notificationText`. Add focused assertions in `src/notifications/index.test.ts`, `src/notifications/format.test.ts`, and config tests for explicit classification, default-on and disabled-toggle behavior, focus bypass, alert default, and verbatim formatting.
4. Add `src/models/manager.test.ts` using temporary project directories and injected providers/writer. Cover bundled seeding on Delete, replacement of a broken override, refusal of unknown/hidden/disabled Delete requests, hand-edited reload and no-change suppression, disabled lookups, concurrent single-flight calls, a Delete that completes during provider fetch and remains disabled after merge, no write plus a `Models not refreshed:` notice when `reachedHarnesses` is empty, a successful refresh notice from `summarizeModelRefresh`, thrown-write preservation and the exact write-error notice, every required bus emission, and disposal during a deferred refresh with no write or notice. Assert catalog change notifications separately from the `models:changed` refresh-state and successful-write notifications.
5. Update `product/specs/notifications.md` with `models-refresh`, its explicit/focus behavior, and alert default. Do not create `product/specs/models-tab.md` in this subplan; the later documentation-integration subplan owns that full user-facing spec. The host topic, tab UI, and other consumers are implemented by their dependent subplans.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation change. Manager tests must inject provider outcomes and write failures; they must not contact provider services. Manually verify that a hand-edited override is visible after `reload()`, and that deleting one model followed by a refresh preserves its flags when the provider still reports it.

## Out of scope

- Migrating existing model consumers off `src/harness/models.ts`; that compatibility layer stays until the consumer subplan.
- Host topic and plugin actions, models tab UI, roles-tab changes, and public help pages.
