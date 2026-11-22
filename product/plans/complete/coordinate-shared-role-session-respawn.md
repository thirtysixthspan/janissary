# Coordinate shared role-session respawn across monitors on one owner

**Complexity: 3/10** — ~40 added lines, 3 production files, 4 requirements and 4 scenarios (p=4.71); a bounded coordination fix in two managers with no new architecture.

## Problem

`respawnMonitorSession` in `src/monitor/session.ts` closes the owner's `personaRoles` slot unconditionally, even when a second live monitor on that owner declared the same role and still uses the shared `AcpSession`. The sibling keeps its `reg.session` bound to the killed session; its next flush fails with an "ACP session closed." error and respawns again, killing the fresh session the first monitor just opened. Both monitors then stop producing suggestions and the tab fills with restart lines.

Separately, `PersonaRoleSessionManager.session` in `src/acp/persona-role-session.ts` assigns the caller's hook to the single `state.hooks` slot, so when several monitors share one role slot only the last monitor's connection-level death hook survives. A connection death therefore reaches one consumer instead of all of them.

`stopMonitor` in `src/monitor/stop.ts` already handles the mirror case correctly: it keeps the shared role session alive while another monitor on the owner uses the same role. Its survivor rule and each monitor's independent context reset must stay unchanged.

## Goal

When two monitors on one owner share a role slot and one of them respawns, the shared session is not torn down from under the sibling. If the slot's session is still alive, the failing monitor re-binds to it and resets only its own context. If the session really died, it is closed exactly once, one fresh session is primed, and every sibling registration is re-pointed to that fresh session so all monitors keep flushing. A connection-level death notifies every consumer registered on the slot, not just the most recent one.

## Approach

1. **`src/monitor/session.ts`**
   - Give `respawnMonitorSession` the live-monitor map (matching `stopMonitor`'s signature) so it can apply the same sibling check: another monitor, not this registration, on the same owner with the same persona role.
   - Reset the failing monitor's own `contextBytes`/`contextText` as today, independently of every sibling.
   - When a sibling exists and the role slot still holds a session, re-bind `reg.session` to that current shared session and return — no close, no kill, no second priming.
   - Otherwise close the slot once (falling back to killing the registration's session only when there is no slot to close), prime a fresh session through `openMonitorSession`, and, when siblings exist, re-point every sibling's `reg.session` to the freshly primed session.
2. **`src/acp/persona-role-session.ts`**
   - Keep a per-`${label}:${role}` list of consumer death hooks on the manager instead of letting `session()` overwrite a single hook.
   - Every `session()` call appends its hook; `state.hooks` becomes one composite that invokes every hook in the list, so the `died()` path — which already clears the slot before calling `state.hooks` — reaches all monitors sharing the slot while preserving the editor manager's existing hook-chain behavior.
   - Clear the hook list in `forget()` so a closed or replaced slot keeps no stale callbacks.

## Implementation steps

1. Add the monitors-map parameter and the sibling-aware close/re-bind/re-point logic to `respawnMonitorSession`; update its one caller in `src/monitor/live-monitors.ts` to pass the map.
2. Add the per-slot death-hook list to `PersonaRoleSessionManager`, append on `session()`, expose one composite through `state.hooks`, and clear it on `forget()`.
3. Add the tests below and run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/monitor/manager.test.ts`: start two monitors with the same role on one owner; trigger the connection-level death so the slot is forgotten, then fail one monitor's flush; assert the sibling registration tracks the fresh session (its next flush lands on the new session), both monitors keep flushing on the new session, and no session is killed twice.
- `src/monitor/session.test.ts`: update the existing `respawnMonitorSession` test for the new parameter and keep its close/reset/re-prime assertions intact.
- The existing stop, restart, respawn, and reset-context cases in `src/monitor/manager.test.ts` and `src/acp/persona-role-session.test.ts` keep passing unchanged.

## Spec updates

- `product/specs/monitoring.md`: extend the shared role-session paragraph to state that an error recovery on one of several monitors using one role leaves the shared session alive for the others when it is still usable, and when the session truly died, one fresh session is primed and every monitor on that role adopts it.

## Documentation

- No help page or user-documentation page describes the shared role-session respawn path, so nothing to update there.

## Out of scope

- `stopMonitor`'s survivor behavior and each monitor's independent context reset are unchanged.
- No change to the canonical plan, the PR description, or the other backlog entry.
- No change to the editor manager's hook chaining beyond what the composite `state.hooks` preserves.
