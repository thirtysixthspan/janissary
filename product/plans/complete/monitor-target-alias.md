# Monitor command recognizes tab aliases

**Complexity: 3/10** — one resolution helper plus two call sites in the monitor manager, confined to `src/monitor/` and its tests.

## Goal

`monitor <persona> <target>` and `unmonitor <persona> <target>` take a tab as their target, but only match it by its raw internal `label`. `send <name>`, `queue <name>`, and (as of `tab-nav-picker-alias`) the nav picker all resolve a renamed tab's display alias (`tab.title`, set via `rename`) in addition to its label. `monitor`/`unmonitor` are the odd ones out: typing a tab's alias produces `No tab named "<alias>"` even though a tab with that alias is open. The monitor command should recognize tab aliases the same way `send`/`queue` already do.

## Approach

Add a shared resolution step in `src/monitor/targets.ts` that maps a tab-kind target's typed label to the matching tab's canonical `label`, matching case-insensitively against either `label` or `title` — mirroring `resolveTarget` in `src/commands/resolve-target.ts`. Group targets pass through unchanged. A target that matches nothing also passes through unchanged, so the existing `validateTargets`/`No tab named` error path is unaffected.

Call this resolver in `MonitorManager.start` (before `validateTargets`) and in `MonitorManager.stop` (before filtering `reg.targets` for the drop-one-target case), so both `monitor` and `unmonitor` recognize an alias typed in place of a label.

## Implementation steps

1. In `src/monitor/targets.ts`, add `resolveTargetAliases(tabs: Tab[], targets: MonitorTarget[]): MonitorTarget[]` — for each `kind: 'tab'` target, find a tab whose `label` or `title` matches the target's `label` case-insensitively; if found, replace the target with `{ kind: 'tab', label: <tab.label> }`; otherwise leave it unchanged. `kind: 'group'` targets pass through unchanged.
2. In `src/monitor/manager.ts`, in `start`, resolve `targets` through `resolveTargetAliases(this.managers.tab.tabs, targets)` when building `resolved` (inline mode's synthetic owner target does not need resolution).
3. In `src/monitor/manager.ts`, in `stop`, resolve the incoming `target` (when present) through `resolveTargetAliases(this.managers.tab.tabs, [target])[0]` before comparing it against `reg.targets`.

## Tests

Add to `src/monitor/targets.test.ts`:

- `resolveTargetAliases` replaces a tab target's typed alias with the matching tab's real label.
- `resolveTargetAliases` matches case-insensitively.
- `resolveTargetAliases` leaves a tab target unchanged when no tab matches (so `validateTargets` still reports it as missing).
- `resolveTargetAliases` leaves group targets unchanged.

Add to `src/monitor/manager.test.ts`:

- `start` with a target given as a renamed tab's alias resolves to that tab and starts monitoring it (not a "no tab named" error).
- `stop` with a target given as a renamed tab's alias removes that target from a multi-target monitor.

## Out of scope

- Tab-completion for `monitor`/`unmonitor` targets (`completeMonitorCommand`) — it already completes against `allLabels()`, unchanged by this fix; adding aliases to completion is a separate concern.
- Any change to `resolve-target.ts`, `send`, `queue`, `rename`, or the nav picker — already correct.
- Case sensitivity of group targets (`group:<n>`) — unaffected, no alias concept applies.

## Verification

- `./scripts/run.mjs check-diff` after implementation and after tests.
- Manual verification not possible in this environment (no running app); covered by the added unit tests.
