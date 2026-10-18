# Tick-driven runscript list refresh
**Complexity: 4/10** — a host subscription that rebuilds the runscript rows on each scheduler tick and publishes only on change, gated so it reads nothing while no scripts tab is open, plus one new per-tick bus event.

## Goal

Build the runscript rows (name, system schedule count, editor-open flag) in one function. Publish a `runscripts` change signal from the scheduler's one-second tick, only when the rows differ from the last published set and only while a scripts tab is open. The topic source that delivers the signal to the plugin lands in `04-runscripts-topic-and-actions`.

## Design decisions and dependencies

This subplan depends on `01-runscript-file-operations` for `listRunscriptNames`.

- The tick is `ScheduleManager.tick` in `src/schedule/manager.ts`. `start()` drives it with `setInterval` every 1000 ms. The method emits a `changed` event only when a schedule changes, so it needs a per-tick event of its own. The change is one line at the end of `tick`: `messageBus.emit('schedules', { type: 'tick' })`. Rejected: a second interval timer, which the source plan rules out by asking for the scheduler's tick, and a callback list on `ScheduleManager`, because the message bus is the existing way these signals travel.
- `ScheduleManager` is at 198 code lines against the 200-line `max-lines` limit, where blank and comment lines do not count. The emission must stay one line. Any larger change belongs in a helper module.
- The refresh is a host subscription created in `subscribeHostChannels` (`src/plugins/host-channels.ts`). That function already owns the host's channel subscriptions and returns them, and `TabPluginHost.dispose` releases them. Rejected: putting the refresh on `Managers`. That would add a manager, a dispose-order entry, and a creation step for a single subscription.
- The source plan says the refresh "starts" with the first scripts tab and "stops" with the last. The plugin API has no tab-close hook, and this subplan does not add one. The subscription exists from startup, and it does work only while an open tab has `plugin.id === 'scripts'`. On a tick with no such tab, it clears its last-published rows and returns before any file access. It is the same as starting and stopping in effect. A disabled plugin also needs no special case, because the host closes that plugin's tabs. Rejected: a refresh that reads the directory for the whole session, which the source plan rejects.
- On each tick with an open scripts tab, the refresh builds the rows through `readRunscriptRows`, which the topic read in `04` also uses. It compares them with the last published rows, element by element over name, schedule count, and open flag. It emits `runscripts` `changed` only on a difference.
- Rows are sorted by name using the catalog's order (`localeCompare`), so a deterministic comparison is possible.
- A failed listing, such as a symlinked `.janissary`, is treated as an empty list, the same policy `cachedRunscripts` uses. The tick handler must not throw. A throwing bus listener is caught by the bus and written to stderr, but the refresh should not depend on that.
- The schedule count for a row is the number of entries in `managers.systemSchedule.list()` whose `script` equals the row's name.
- The open flag is true when some open tab has an editor path equal to `<launch directory>/.janissary/scripts/<name>.rs`, the same path `readRunscript` returns.
- The row and payload types (`RunscriptRowView` with `name`, `schedules`, and `open`, and `RunscriptsView` as `{ rows }`) live in a new `src/protocol/runscripts.ts`, which follows `src/protocol/schedule.ts`. `src/protocol.ts` re-exports them in one line, as it does for the schedule views.
- `cachedRunscripts` in `src/state/listings.ts` is not reused. Its one-second TTL would add up to a second of lag on top of the tick, and its catch-all hides failures.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Scheduler tick | `src/schedule/manager.ts` (`ScheduleManager.tick`, `start`) | One line added to `tick`. |
| Message bus and its channel map | `src/bus.ts` (`messageBus`, `ScheduleEvent`, `BusChannels`) | `ScheduleEvent` gains a `tick` variant. A `runscripts` channel is added. |
| Host channel subscriptions | `src/plugins/host-channels.ts` (`subscribeHostChannels`) | One more subscription in the returned array. |
| Subscription type | `src/bus.ts` (`Subscription`) | Returned by the refresh. |
| System schedule list | `src/schedule/system/manager.ts` (`list`) | Read for schedule counts. |
| Open tabs and editor paths | `src/tab/types.ts` (`Tab.editor`, `Tab.plugin`), `src/tab/open-editor-tab.ts` | Read for the open flag and the gate. |
| Runscript listing | `src/schedule/system/runscript-files.ts` (`listRunscriptNames`, from `01`) | Read on each gated tick. |
| Cached catalog | `src/state/listings.ts` (`cachedRunscripts`) | Not used (see above). |

## Proposed changes

- In `src/schedule/manager.ts`, the `tick` method emits `{ type: 'tick' }` on the `schedules` channel after its existing work. One line.
- In `src/bus.ts`, `ScheduleEvent` becomes a union of `changed` and `tick`, and `BusChannels` gains `runscripts` with a `{ type: 'changed' }` event.
- In `src/protocol/runscripts.ts` (new), define `RunscriptRowView` and `RunscriptsView`. In `src/protocol.ts`, add one re-export line.
- In `src/schedule/system/runscript-rows.ts` (new), define `readRunscriptRows(managers)`, which returns a `RunscriptsView`. It lists names with `listRunscriptNames`, counts system schedules per name, sets each open flag, sorts by name, and returns an empty view when the listing fails. Put the pure part in a separate function that takes names and two lookup functions, so the rules can be tested without fake managers.
- In `src/schedule/system/runscript-refresh.ts` (new), define `createRunscriptRefresh(managers, publish)`, which returns an object with `tick()` and `dispose()`. It keeps the last-published rows in a closure and clears them when no scripts tab is open. The `publish` argument defaults to emitting `runscripts` `changed`, so tests can inject a spy. Also define `subscribeRunscriptRefresh(managers)`, which subscribes to the `schedules` `tick` event, calls the refresh's `tick`, and returns a `Subscription` whose `unsubscribe` calls `dispose`.
- In `src/plugins/host-channels.ts`, add `subscribeRunscriptRefresh(managers)` to the subscriptions it returns.

## Tests

- In `src/schedule/system/runscript-refresh.test.ts` (new), using a temporary project directory and a fake managers object for tabs and system schedules:
  - With no scripts tab open, a tick reads nothing and publishes nothing. A spy on `listRunscriptNames` or a file that is never read shows it.
  - The first tick with a scripts tab open publishes when at least one runscript exists, and publishes nothing when none exist.
  - A new file found on a tick publishes once. The next tick with no change publishes nothing.
  - A removed file publishes.
  - A change in a row's system schedule count publishes. A change in its open flag publishes.
  - After the last scripts tab closes, the next tick publishes nothing and clears the stored rows. Reopening publishes the current set again.
  - A symlinked `.janissary` produces an empty list and does not throw from `tick`.
  - After `dispose`, further ticks publish nothing.
  - `subscribeRunscriptRefresh` is driven by `messageBus.emit('schedules', { type: 'tick' })`, and unsubscribing stops that.
- In `src/schedule/system/runscript-rows.test.ts` (new): rows come back sorted by name; counts match only entries whose `script` equals the name; the open flag matches an editor tab on the same absolute path and not on a different file; the listing failure returns an empty view.
- In `src/schedule/manager.test.ts` (existing): one tick emits a `tick` event once, and an existing `changed` emission still happens exactly when it did before.

## Verification

Run `./scripts/run.mjs check-diff`. Confirm with `./scripts/run.mjs lint-files` that `src/schedule/manager.ts` stays within the 200-code-line limit. Confirm that `src/schedule/system/runscript-refresh.ts` performs no file access while no scripts tab is open.

## Out of scope

- The `runscripts` topic source, its action module, and the plugin. Those are in `04` and `05`. Until 04 lands, the `runscripts` channel has no listener, which is harmless.
- Any change to the tick interval, to firing, or to the way `ScheduleManager` fires entries.
- A file watcher, and any refresh that runs with no scripts tab open.
