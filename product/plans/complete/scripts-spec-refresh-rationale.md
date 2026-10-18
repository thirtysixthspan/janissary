# Scripts spec: state the refresh gate's reason from what the host supports

**Complexity: 2/10** — a documentation correction to one paragraph of the scripts spec. No code, test, or config changes. Most of the work is checking each host fact the paragraph relies on.

## Goal

The scripts spec explains why the runscript refresh is a tick gate rather than a start and stop lifecycle. It says the plugin API has no hook for a tab closing, and that the refresh therefore cannot learn that the last tab has closed. The host supports neither claim. Restate the paragraph with the reasons the code supports. The gate itself stays as it is.

## Verified facts

- **The host sees a tab close.** `src/tab/cleanup.ts:43` emits a `tab:removed` event on the `transcript` channel while a tab closes. `src/bus.ts:128-133` types it and `src/bus.ts:190` carries it on that channel. Host-side code can subscribe to it. The refresh already subscribes host-side to the scheduler tick (`src/schedule/system/runscript-refresh.ts:50`), so a host-side start and stop was possible. The comment at `src/tab/cleanup.ts:10-12` says closing the last non-docked tab exits the app instead of reaching this walk, so that one close emits nothing, which is harmless during shutdown.
- **The plugin side does not see its own last close.** `TabPluginActivation` (`src/plugins/api.ts:424-456`) has no tab-close member. The `tabs` topic exists (`src/plugins/api-topics.ts:23-24`, `src/plugins/topics.ts:176-185`), but `src/plugins/notifications.ts:30-35` delivers only to active subscribers, and `:40-43` drops any plugin that owns no open tab. The scripts plugin therefore never hears about its last close. The entry's claim that the tabs topic reports closes to plugins holds only while a plugin still owns a tab.
- **Dispose is not a close signal.** A plugin's `dispose` runs when the plugin is disabled (`src/plugins/host.ts:215`, via `disposeActivation` at `:219-224`) or when the host shuts down (`src/plugins/host.ts:134`). The two pre-active paths, `src/plugins/start-activation.ts:24-25` and `src/plugins/activate.ts:136-137`, dispose only an activation that never became active. The spec's sentence on this holds.
- **The gate.** `src/schedule/system/runscript-refresh.ts:31-36` returns early and clears the stored rows when no tab that `listens` admits is open. `:42-44` sets the disposed flag. The tick subscription is taken in `src/plugins/host-channels.ts:43-46` only when some declaration lists `runscripts`, and it is released with the host (`src/plugins/host.ts:133`).
- **The activation does not drive the refresh.** `src/plugins/scripts/activate.ts` sends `ensureDirectory` and opens the tab on `command`. Its `notify` only updates the tab payload. Neither path starts or stops the refresh.
- **Rows change without a scripts-tab event.** `src/schedule/system/runscript-rows.ts:25` and `:32` read system schedules for each row's count, and `:35` checks every open tab for the open flag. `src/schedule/manager.ts:71-75` starts a one-second interval, and `:186` emits the `schedules` `tick` on every tick (`src/bus.ts:150-153`). The tick already runs whether or not a scripts tab is open.
- **Tests.** `src/schedule/system/runscript-refresh.test.ts` pins the admit and clear behavior (lines 56-105), dispose (lines 215-234), and the tick subscription (lines 237-265).

## Approach

Keep the decision, and keep the paragraph's first sentence verbatim. Replace the other sentences with the three reasons the host supports:

1. A lifecycle driven from the plugin side cannot see the last close, because a plugin stops hearing about tabs once it owns none, and dispose is not a close signal.
2. The host can see the close through `tab:removed`, so a host-side lifecycle was possible. The gate is a choice, not a host limit.
3. The gate is kept because the tick runs regardless, for system schedule counts and editor open flags that change without scripts-tab events. The gate reads the open tabs on that same tick. A start and stop pair would add a subscription taken with the first tab and released with the last, which the gate does not need.

The sentence about the subscription existing only when a declaration lists `runscripts` (line 21) and the state-broadcast upgrade path (line 25) do not depend on the wrong claim, so they stay unchanged.

## Implementation steps

1. Edit the paragraph in `product/specs/scripts-tab.md` that begins "The refresh is a gate". Keep its first sentence. Replace the rest with the corrected reasons. No other line of the spec changes.
2. The entry's proposal also asked for a note that the completed plan's activate-level start and stop test was replaced. That note is left out. The change is scoped to the reason paragraph, and `product/plans/complete/scripts-tab.md` stays the historical record.
3. Remove the resolved entry from `product/backlog/pull-request.md` and restore the master skeleton with `git checkout master -- product/backlog/pull-request.md`.
4. Run the docs tests and check-diff.

## Tests

No new tests. The change is prose only. Run `src/commands.test.ts` and `src/plugins/documentation.test.ts` directly and read the output.

## Out of scope

- Any change to the gate, the refresh, the `tabs` topic, the plugin API, or the tab-close path. Behavior does not change.
- Other documentation. The spec is the only file this correction edits.
- A plugin-API close hook. The gate is kept, so no API change is needed.
