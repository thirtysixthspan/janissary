# Tear down a monitor when its reporting tab or all its tab targets close

**Complexity: 5/10** — isolated to `src/monitor-manager.ts`, root cause is well
understood, but covers three related behaviors plus a shared helper refactor.

## Goal

Three related bugs, all traced to one root cause in `MonitorManager`:

1. Closing a monitor's own reporting tab does not kill its ACP session — the
   connection is left dangling.
2. Closing every tab a monitor watches (its `kind: 'tab'` targets) stops the monitor's
   session but leaves its now-empty reporting tab open.
3. After closing a reporting tab, starting the same persona/owner combination again
   fails with `Already monitoring with persona "<name>".`

## Background (verified)

- `src/monitor-manager.ts:98-115` (`subscribe`)'s `tab:removed` listener only reacts
  when the removed tab is the monitor's **owner** (`handleOwnerClosed`) or one of its
  `kind: 'tab'` **targets** (`this.stop(..., { kind: 'tab', label })`). It never checks
  whether the removed tab is the monitor's **own reporting tab** — so closing that tab
  directly (its sidebar/tab-strip close, or the `close <label>` command) leaves `reg`
  (session, timer, subscriptions) alive in `this.monitors` forever.
- `src/monitor-window.ts:40-48` (`openMonitorTab`) and `src/monitor-manager.ts:53-84`
  (`start`) confirm the reporting tab's label is always `personaName` (in external
  mode) — `start()` passes `personaName` straight through, with no suffixing (the
  `allocateMonitorLabel` helper in `monitor-window.ts:24-30` exists but is not called
  anywhere in `monitor-manager.ts`). So `event.tabLabel === reg.persona.name` reliably
  identifies "this reg's own reporting tab was removed," for any external-mode `reg`.
- Because `openMonitorTab` reuses an existing tab by label regardless of which owner's
  monitor asks for it, two different owners can genuinely share one reporting tab (see
  the existing test `'keeps a reporting tab fed by another owner when one owner
  closes'`). `subscribe()` registers one bus listener **per `reg`**, so when a shared
  reporting tab is removed, every matching `reg`'s own listener fires independently —
  each stops itself. No cross-`reg` coordination is needed for that case.
- `src/monitor-manager.ts:53-55` (`start`) is the reopen-bug's proximate cause:
  `if (this.monitors.has(key)) return 'Already monitoring...'` — the stale `reg` from
  the un-torn-down reporting tab keeps that check permanently true. Fixing the teardown
  (point 1) fixes this for free.
- `src/monitor-manager.ts:204-217` (`stop`) already exhausts a monitor's `kind: 'tab'`
  targets correctly (`reg.targets = reg.targets.filter(...); if (reg.targets.length > 0)
  return true;`, falling through to full cleanup once empty) but never calls
  `closeMonitorTab` — the now-orphaned reporting tab is left open. `closeMonitorTab`
  (`src/monitor-window.ts:59-62`) is already idempotent (`findIndex` returns `-1` and
  it's a no-op if the tab is already gone), so it's safe to call unconditionally.
- `src/monitor-manager.ts:219-230` (`handleOwnerClosed`) already computes "is any other
  monitor still feeding this persona's reporting tab" (`stillFed`) before deciding to
  close it — that's the same logic `stop()`'s target-exhaustion path needs, so it's
  worth extracting into one shared private helper rather than duplicating it.
- **Group targets are out of scope for this fix**: the existing `tab:removed` handler
  only reacts to `kind: 'tab'` targets dropping out (the code comment "Only tab targets
  drop out; group targets persist" is deliberate — a group may gain new tabs later, so
  a currently-empty group isn't necessarily permanently empty). None of the three
  reported issues mention group-based monitors, and detecting "every tab that was ever
  in this group is now closed" would require new bookkeeping this fix doesn't need.

## Approach

1. Add a `tab:removed` branch in `subscribe()` for `!reg.inline && event.tabLabel ===
   reg.persona.name` (the reporting tab itself was removed) → call
   `this.stop(reg.owner, reg.persona.name)` with no target, forcing full cleanup
   regardless of remaining targets. This alone fixes bugs 1 and 3.
2. Extract a private `closeIfUnfed(personaName: string): void` helper (checks whether
   any remaining `!inline` monitor still has that persona name; if not, calls
   `closeMonitorTab`). Reuse it from `handleOwnerClosed` (replacing its current inline
   duplicate) and call it from `stop()`'s full-cleanup path when `!reg.inline`. This
   fixes bug 2, and is a no-op (nothing to find) for the reporting-tab-already-closed
   path from step 1.

## Implementation

1. **`src/monitor-manager.ts`** — add a private method:
   ```ts
   private closeIfUnfed(personaName: string): void {
     const stillFed = [...this.monitors.values()].some((r) => !r.inline && r.persona.name === personaName);
     if (!stillFed) closeMonitorTab(this.managers, personaName);
   }
   ```

2. **`src/monitor-manager.ts`**, `stop()` — call it at the end of the full-cleanup path:
   ```ts
   stop(owner: string, personaName: string, target?: MonitorTarget): boolean {
     const key = `${owner}:${personaName}`;
     const reg = this.monitors.get(key);
     if (!reg) return false;
     if (target && !reg.inline) {
       reg.targets = reg.targets.filter((t) => JSON.stringify(t) !== JSON.stringify(target));
       if (reg.targets.length > 0) return true;
     }
     for (const sub of reg.subs) sub.unsubscribe();
     clearInterval(reg.timer);
     reg.session.kill();
     this.monitors.delete(key);
     if (!reg.inline) this.closeIfUnfed(personaName);
     return true;
   }
   ```

3. **`src/monitor-manager.ts`**, `subscribe()` — add the reporting-tab-removed branch:
   ```ts
   messageBus.on('transcript', 'tab:removed', (event) => {
     if (event.type !== 'tab:removed') return;
     if (event.tabLabel === reg.owner) { this.handleOwnerClosed(reg.owner); return; }
     if (!reg.inline && event.tabLabel === reg.persona.name) { this.stop(reg.owner, reg.persona.name); return; }
     // Only tab targets drop out; group targets persist (the group may gain new tabs).
     if (reg.targets.some((t) => t.kind === 'tab' && t.label === event.tabLabel)) {
       this.stop(reg.owner, reg.persona.name, { kind: 'tab', label: event.tabLabel });
     }
   }),
   ```

4. **`src/monitor-manager.ts`**, `handleOwnerClosed()` — replace its inline `stillFed`
   check with the new helper:
   ```ts
   private handleOwnerClosed(owner: string): void {
     const personas = [...this.monitors.values()]
       .filter((reg) => reg.owner === owner && !reg.inline)
       .map((reg) => reg.persona.name);
     this.stopAll(owner);
     for (const name of personas) this.closeIfUnfed(name);
   }
   ```

## Tests

Add to `src/monitor-manager.test.ts` (mirroring the existing owner-closed tests'
`makeFakeManagers`/`fakeSpawnFactory`/`emitEntry` helpers):

- `'closing the reporting tab kills its session and stops feeding'` — start an
  external-mode monitor, emit `tab:removed` for the reporting tab's own label, and
  assert `sessions[0].kill` was called and `manager.list()` is empty.
- `'reopening the same owner/persona after its reporting tab closes succeeds'` —
  start, close the reporting tab (as above), then call `start` again with the same
  owner/persona and assert it returns `null` (not the "Already monitoring" error).
- `'closing every tab target closes the now-empty reporting tab'` — start an
  external-mode monitor with two `kind: 'tab'` targets, emit `tab:removed` for each
  target in turn, and assert the reporting tab is gone from `managers.tab.tabs` after
  the last one closes (extending the existing `stop kills the dedicated session...`
  coverage, which only checks session/list state, not the reporting tab itself).

## Verification

Manual: start an external-mode monitor (`monitor <persona> <target>`), close its
reporting tab directly, confirm the underlying ACP process ends (no lingering process)
and that re-running the same `monitor` command succeeds instead of erroring. Then start
a fresh monitor with a single tab target and close that target tab, confirming the
reporting tab closes automatically. Not runnable in this environment — note as
unverified manually.

## Out of scope

- Group-target exhaustion (closing every tab currently in a monitored group) — the
  existing "group targets persist" design is intentional and unrelated to the three
  reported issues.
- The `allocateMonitorLabel` helper in `monitor-window.ts` — dead code, unrelated to
  this fix; not called by `start()` today and not needed for it.
- Any other monitor issues in `work/issues.md` (metadata line, reset-context button,
  keyboard focus).
