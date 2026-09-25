# Carry a tab's schedule on every persisted-state write

## Complexity

3/10 — one method in `TabManager` gains a default, five call sites drop an extra they no longer need, and the tab manager tests gain two cases plus a `get` on their schedule-manager mock. No new modules.

## Goal

A tab's schedule lives in `ScheduleManager`'s label-keyed map, not on the tab. `buildAgentStateFromTab` in `src/tab/agent-state.ts` assembles the persisted snapshot from the tab plus an optional `extra`, and `saveAgentState` replaces the whole state file with it. So any write whose caller forgets `{ schedule }` erases the persisted schedule. Five call sites pass it by hand. The other twenty-odd persists (shell finish, PTY exit, queue edits, rename, reorder, editor retarget, profile placement, ACP) do not.

The everyday failure: a scheduled `shell …` fires, the schedule tick persists the schedule, and the shell's finish callback rewrites the state file without it. Quitting and relaunching with `--relaunch` then loses the schedule that `product/specs/scheduling.md` says survives relaunch.

## Approach

`TabManager.buildAgentState` in `src/tab/manager.ts` defaults the field from the schedule manager before applying the caller's extra:

```ts
buildAgentStateFromTab(tab, { schedule: this.managers.schedule.get(tab.label), ...extra })
```

`extra` stays last, so the three writes inside `src/schedule/manager.ts` (`tick`, `cancel`, `clearAll`, which pass the post-change `next` or `[]`) still win. `ScheduleManager.get` returns `undefined` for a tab with no schedule, so an unscheduled tab's file keeps the same shape it has today.

With the default in place, the `{ schedule: … }` extras in `src/controller/events.ts`, `src/agent/communication-manager.ts`, `src/commands/schedule.ts`, and `src/profile/entry-openers.ts` are redundant and are removed. `entry-openers.ts` calls `managers.schedule.set` immediately before its persist whenever `state.schedule` is set, and a freshly created tab has no schedule otherwise, so the default yields the same value.

The `tab.view !== 'harness'` exclusion that the schedule writers apply stays exactly as it is. This change only decides what a write contains, not which tabs are written.

Moving the schedule onto the tab record (architecture principle 2) was considered and left out. It would touch every schedule reader and the view builders, and the persistence bug is fixed without it.

## Implementation

1. In `src/tab/manager.ts`, change `buildAgentState` to pass `{ schedule: this.managers.schedule.get(tab.label), ...extra }` to `buildAgentStateFromTab`.
2. Add `get: vi.fn()` to the schedule mock in `makeManagers` in `src/tab/manager.test.ts`, since `buildAgentState` now reads it (the editor-retarget cases persist through it).
3. Remove the redundant `{ schedule: … }` extras in `src/controller/events.ts`, `src/agent/communication-manager.ts`, `src/commands/schedule.ts`, and `src/profile/entry-openers.ts`.
4. Run `./scripts/run.mjs check-diff` after each step; fix any other test whose hand-built managers now need a schedule `get`. Three did: the fixtures in `src/command/manager.test.ts` (the mocked-module drain case), `src/editor/rename.test.ts`, and `src/shell/manager.test.ts` each gain `managers.schedule = { get: vi.fn() }`. Their assertions are unchanged.

## Tests

- **`src/tab/manager.test.ts`**: a schedule registered with the schedule manager appears in `buildAgentState(tab)` with no extra; an explicit `extra.schedule` overrides it; a tab with no schedule gets `schedule: undefined`.
- **`src/tab/manager.test.ts`**: a non-schedule persist (an `enqueue`, which saves through `persistQueue`) of a scheduled tab writes the schedule to `saveAgentState`, pinning that the everyday write no longer drops it.
- `src/schedule/manager.test.ts`, `src/commands/schedule.test.ts`, `src/controller/events` tests, and the profile tests must pass unchanged.

## Out of scope

- Moving the schedule onto the tab record.
- The harness-tab exclusion in the schedule writers.
- Any change to what `saveAgentState` writes or how rehydration restores schedules.

## Documentation and specification impact

`product/specs/scheduling.md` already promises that a tab's schedule survives relaunch. The spec gains a sentence stating that every write of a tab's saved state carries its current schedule. No `help.md` or user documentation change: the documented behavior is unchanged; this makes the code match it.
