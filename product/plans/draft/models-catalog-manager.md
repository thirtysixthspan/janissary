# Model catalog manager

**Complexity: 5/10** — this adds serialized persistence, concurrent refresh, cancellation, and cross-manager change signals around the provider primitives.

## Goal

Add the long-lived model catalog service that owns the effective catalog, serializes Delete and Refresh writes, and publishes successful changes immediately to core consumers.

## Decisions and dependencies

- Depends on `models-catalog-records.md` and `models-provider-refresh-primitives.md`.
- The manager reads the catalog at construction and exposes `modelsFor`, `isKnownModel`, `view`, `reload`, `delete`, `refresh`, and `dispose` with the contracts in the canonical source plan.
- `modelsFor(harness)` and `isKnownModel(harness, id)` exclude disabled records; `view()` returns the visible groups plus `refreshing`. Delete is allowed only for a visible enabled record, otherwise it returns `no model "<harness> <id>"`.
- Each queued write begins with a reload. Delete and refresh share one promise chain; refresh fetches providers concurrently and merges only after fetching completes, so a Delete during fetch is preserved.
- Every `refreshing` transition emits the typed `models:changed` signal so open topic clients repaint the spinner; a successful write also emits it. A catalog change additionally emits `conversations:changed` and `state:dirty`. Failed writes keep the old file and in-memory catalog and send the specified `models-refresh` notification.
- If no provider was reached, Refresh does not write. When a write fails, report `Could not write known-models.json at <path>.` through the same event. Refresh notices are attributed to the open models tab's label, or `models` if no models tab is open.
- Refresh is single-flight. Disposal aborts the active request; an aborted refresh neither writes nor reports. Do not add an API version bump for the additive notification event.

## Existing code to reuse

| Need | Existing code |
| --- | --- |
| Serialized write queue pattern | `queue` and `settle` in `src/plugins/roles/activate.ts` |
| Atomic catalog writes and provider primitives | `src/models/catalog-file.ts` and `src/models/` provider modules |
| Manager registration and teardown order | `src/managers.ts` and `src/controller/create-managers.ts` |
| Notification dispatch and formatting | `notify` in `src/notifications/index.ts`, plus `src/notifications/alert-defaults.ts` and `format.ts` |

## Proposed changes

1. Add `ModelCatalogManager` in `src/models/manager.ts`, constructed with the project directory. Implement reload, lookup, visible view, Delete validation and write, single-flight Refresh, queued merge/write, notifications, message-bus emissions, and abort-on-dispose. Re-read at the start of each queued Delete or Refresh and before the models tab command later reads its view; when a re-read changes the catalog, publish it to all current consumers.
2. Register it as `managers.models`, create it with the project directory, and place it beside `conversations` in `MANAGER_DISPOSE_ORDER`. Add a typed `{ type: 'changed' }` models bus event.
3. Add the `models-refresh` notification event, enabled by default, configured as `{ desktop: true, sound: 'success' }`, passed through notification formatting, and exempt from focus suppression so a refresh started from the models tab is still reported.
4. Add `src/models/manager.test.ts` for override seeding from the bundled catalog, broken-override replacement, refusal for unknown/hidden/disabled Delete requests, hand-edit reload and no-change suppression, disabled lookups, single-flight refresh, Delete during refresh, no write when no harness was reached, failed-write preservation and exact notice, all change emissions, and abort-on-dispose with no report. Add focused notification tests for toggle, default, formatting, and focus bypass.
5. Update `product/specs/notifications.md` with the event, alert default, and focus-suppression behavior. Record the manager's catalog and write guarantees in the new `product/specs/models-tab.md` only if that spec is introduced here; otherwise leave its detailed user behavior to the models-tab subplan.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation change. Tests must inject provider outcomes and filesystem failures; they must not contact provider services.

## Out of scope

- Migrating existing model consumers off `src/harness/models.ts`; that compatibility layer stays until the consumer subplan.
- Host topic and plugin actions, models tab UI, roles-tab changes, and public help pages.
