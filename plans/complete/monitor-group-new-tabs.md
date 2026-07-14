# Lock in: monitoring a group picks up new tabs joining that group

**Complexity: 2/10** — investigation found the described behavior already works; the fix is a
regression test that locks it in (currently untested) plus a spec clarification (currently
silent on this point), not a code change.

## Goal

"When monitoring a group, new tabs opened in the group should be monitored as well." Verify this
is true today, and if so, add coverage so a future change can't silently regress it, and make the
spec say so explicitly.

## Investigation (verified)

Traced group-target resolution end to end in `src/monitor/`:

- `src/monitor/targets.ts`'s `resolveTargetTabs` and `matchesTargets` both take the live `tabs`
  array as a parameter and filter/check `t.group === target.group` fresh on every call — they
  cache nothing. The file's own top comment states the design intent: group targets are resolved
  at event time, so group membership stays dynamic.
- `src/monitor/manager.ts`'s `start()` calls `seedEntries(this.managers.tab.tabs, resolved)`
  **once**, but only to prime the buffer with each target's *pre-existing* transcript history
  (matches `specs/monitoring.md:21`) — it is not the ongoing watch mechanism.
- The ongoing watch is the `transcript`/`entry:appended` bus subscription in `manager.ts`'s
  `subscribe()`, which calls `matchesTargets(this.managers.tab.tabs, reg.targets, event.tabLabel)`
  fresh on every event — always against the *current* live tabs array, not a snapshot from
  `start()` time.
- The 30s `flush()` additionally re-resolves harness/editor-view targets via
  `resolveTargetTabs(managers.tab.tabs, targets)` in `harness-feed.ts`/`editor-feed.ts` — same
  live-array pattern, every flush.
- `TabManager.tabs` is a plain mutable field reassigned whenever a tab is added; every monitor
  read goes through `this.managers.tab.tabs` at call time, so reassignment doesn't create
  staleness.
- A new tab spawned from a tab already in group N inherits `group: N` via
  `src/tab/creators.ts`'s `const group = creator?.group ?? 1` (creator = the active tab at
  creation time) — so it satisfies a `{kind:'group', group:N}` target as soon as it exists.
- Confirmed empirically with a throwaway test (discarded, not part of this fix): started a
  `MonitorManager` on `{kind:'group', group:2}` against two tabs, then — *after* `start()` had
  already run — added a third tab with `group:2` directly to the live `managers.tab.tabs` array
  and emitted a transcript entry from it. It was correctly buffered and included in the next
  flush's prompt, on the first try, with no code changes.

**Conclusion:** the described behavior is already correct — group-target matching is resolved
fresh on every event and every flush, not snapshotted at monitor-start time. Nothing in
`src/monitor/manager.test.ts` exercises this specific sequence though: the existing `'group
targets match tabs by group number'` test only emits from tabs that were already in the array
*before* `manager.start()` was called; no test adds a tab to the array *after* starting the
monitor and confirms it gets fed. `specs/monitoring.md:21` documents what a monitor receives at
start (full existing transcript of targets and group members) but is silent on tabs joining a
group afterward.

## Approach

Add the missing regression coverage and the missing spec sentence — no source changes.

## Implementation steps

1. **`src/monitor/manager.test.ts`** — one new test, placed after the existing `'group targets
   match tabs by group number'` test, following the same fixture/helper conventions
   (`makeFakeManagers`, `fakeSpawnFactory`, `emitEntry`, `FLUSH_MS`):
   ```ts
   it('a tab created after start and joining the monitored group is picked up', () => {
     const { managers } = makeFakeManagers([janus, agent2]);
     const { spawn, sessions } = fakeSpawnFactory();
     const manager = new MonitorManager(managers, spawn, FLUSH_MS);
     manager.start('janus', 'assistant', [{ kind: 'group', group: 2 }]);

     const agent3 = { ...makeTab('agent3', '#eee'), group: 2, groupColor: '#bbb' };
     managers.tab.tabs = [...managers.tab.tabs, agent3];

     emitEntry(agent3, 'echo', 'z');
     vi.advanceTimersByTime(FLUSH_MS);
     expect(sessions[0].prompts[1]).toContain('agent3');
   });
   ```

2. **`specs/monitoring.md`** — extend the "Transcript access" section (line 21) to state the
   ongoing behavior, not just the at-start seed:
   ```
   Group membership is re-checked continuously, not just at start: a tab created later that joins
   a monitored group (by inheriting that group from its creator) is included from that point on,
   without restarting the monitor.
   ```

## Tests

Covered in Implementation step 1 — the one new `manager.test.ts` case is the whole test surface
for this fix.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks, and runs the
  affected server tests.
- Manual: not verifiable in this environment (no interactive session to spawn real ACP sessions
  and profiles); the new automated test exercises the exact live-array re-resolution path
  described.

## Out of scope

- Any change to `src/monitor/targets.ts`, `src/monitor/manager.ts`, `harness-feed.ts`, or
  `editor-feed.ts` — investigation found no defect; only a test/spec gap.
- The reporting tab's displayed target string (`formatTargets`, e.g. `"group:3"`) — it already
  shows the static target spec, not an expanded tab list, so there's nothing to update there when
  membership changes.
- The other remaining issue in `work/issues.md` (recovering the Chrome extension implementation)
  — unrelated, not touched here.
