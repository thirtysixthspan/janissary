# Schedule next-run time update in the status panel

**Complexity: 3/10** — add one import, one boolean tracker, and one emit call in `tick()`; one source file touched.

## Goal

After a scheduled event fires, the schedule window (StatusPanels) in the web UI updates to show the new next-run time instead of showing stale times from before the event fired.

## Background

`ScheduleManager.tick()` fires due entries every second. For recurring schedules, it reschedules the entry with a new `nextRun` computed by `computeNextRun()`. The updated schedule is stored in the `Map` and persisted. However, the state is **not** re-emitted to the web client after the schedule map is updated.

The state is emitted earlier in the call chain — when `fire()` dispatches the command to the tab (via `dispatchTo` → `tab.append()` → `messageBus.emit('state', { type: 'dirty' })`). This happens **before** `schedules.set()` updates the Map, so the emitted state contains the stale `nextRun`. For harness tabs, `ptk.input()` does not trigger any state emission at all, so the schedule panel never refreshes after a harness schedule fires.

## Approach

At the end of `tick()`, after all schedule updates have been applied to the `Map`, emit a `state.dirty` event so the controller rebuilds the tab view with current schedule data. Track whether any tab's schedule changed in this tick to avoid unnecessary emissions.

## Implementation steps

1. **Import `messageBus`** — add `import { messageBus } from './bus.js';` to `src/schedule-manager.ts`.
2. **Emit state after updates** — in `tick()`, track whether any schedule changed with a local boolean. After the loop, if anything changed, emit `messageBus.emit('state', { type: 'dirty' })`.
3. **Run `./scripts/run.mjs check-diff`**.

## Testing

- `src/schedule-manager.test.ts` — add tests that verify the state emission after a schedule fires:
  - A recurring schedule that fires should update `nextRun` and trigger a state event
  - A harness schedule that fires should trigger a state event after the PTY write
  - A tick with no due entries should not trigger a state event

## Out of scope

- Changing how `computeNextRun` calculates the next time.
- Modifying the `StatusPanels` web component.
- Persistence logic for schedules.

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: create a recurring schedule, wait for it to fire, observe the schedule window shows the updated next-run time.
