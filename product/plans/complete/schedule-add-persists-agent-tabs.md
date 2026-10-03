# Persist a non-harness tab's schedule from ScheduleManager.add

**Complexity: 2/10** — one private helper, one call from `add`, three test cases. No behavior change for any caller that exists today; this closes a gap in a method that would otherwise carry it silently.

## Problem

`add` wrote to the in-memory map and announced the change, but never persisted. Two paths persist an agent tab's schedule — `tick` on any tick that changes the list, and the `schedule` command after its `set` — so an entry appended by `add` on an agent tab reached the state file only when some later, unrelated schedule change happened to make a tick write it.

Every `add` call site today is a harness tab, whose schedules are memory-only by design, so nothing reaches the bug. That is exactly what makes it worth closing: the next non-harness caller inherits a method whose contract silently differs from the command path beside it.

## Approach

One private helper, mirroring what `tick` and the `schedule` command already do:

```
private persist(label: string, entries: ScheduleEntry[]): void {
  const tab = this.managers.tab.byLabel(label);
  if (!tab) return;
  this.managers.tab.persist(this.managers.tab.buildAgentState(tab, { schedule: entries }));
}
```

`TabManager.persist` routes through `persistAgentState`, which applies the agent-only rule and refuses a closed tab — so the harness case and the gone-tab case are both handled by the code this calls, with no second condition here. A harness tab costs one `buildAgentState` call and one no-op persist, which is what `cancel` already costs.

## Tests

Three cases in `src/schedule/manager.test.ts`, on the existing `withRealTabManager` fixture that runs the real `TabManager.persist` path with `saveAgentState` spied:

1. an agent tab's state file is written, carrying the new entry in its `schedule`;
2. a harness tab's add writes no state file;
3. an add for a tab that has since closed writes nothing.

The `saveAgentState` spy is restored in an `afterEach` for this block: `vi.spyOn` returns the same mock for an already-spied method, so a case that leaves it installed hands its call history to the next case asserting on it. Three pre-existing cases in `ScheduleManager cancel` fail without that restore — which is the trap worth writing down.

## Spec

None. No user-visible behavior changes: nothing today calls `add` for a tab whose schedule is persisted, and `product/specs/scheduling.md`'s account of what persists and what does not is unchanged.

## Verification

`./scripts/run.mjs check-diff`. To see the gap closing, remove the `persist` call and watch case 1 fail with `saveAgentState` never called.