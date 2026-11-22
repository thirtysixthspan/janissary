# Release the shared role slot when a monitor stops

**Complexity: 2/10** — one production file (`src/monitor/stop.ts`, ~7 added lines) changes how the full-stop path ends a session; 3 behavioral requirements and 3 test scenarios drive p=3.81.

`stopMonitor` ended a monitor by calling `reg.session.kill()` directly. Since monitors now run on the shared persona-role session in the owner tab's runtime (`personaRoles[role].session`), killing the session left the slot holding a dead session. A later `monitor` for the same persona and role on that tab reused the killed session through `PersonaRoleSessionManager.session()`, so prompts failed with "ACP session closed." until the tab was closed. `respawnMonitorSession` already closes through the owner; the stop path did not.

## Goal

Stopping a monitor forgets its role session from the owner tab's runtime state, so starting that persona again on the same tab primes a fresh session. Two monitors on one owner that share a role share one session: stopping one must not tear down the session the other still uses. Dropping a single target and closing a reporting tab keep their current behavior.

## Approach

1. In the full-stop path of `stopMonitor`, after unsubscribing and clearing the timer, decide whether another live monitor on the same owner declares the same role.
2. When none does, call `managers.personaRoleSessions.close(reg.owner, reg.persona.role)` instead of `reg.session.kill()`; this kills the session and forgets the runtime slot. When a sibling monitor still uses the role, leave the session untouched for it.
3. The decision is made before the registration is deleted from the map, comparing every other registration by owner and `persona.role`. A short comment records why the slot is left alive.

The early returns for dropping one of several targets and the `closeIfUnfed` reporting-tab teardown are unchanged; they never reach the session-ending code.

## Implementation steps

1. Replace the direct `reg.session.kill()` in `src/monitor/stop.ts` with the conditional close through `managers.personaRoleSessions`.
2. Update `src/monitor/stop.test.ts` so its fixture supplies a `personaRoleSessions.close` that kills the matching registration's session and gives the persona a role; add a test pinning the shared-slot case and keep the existing stop tests passing.
3. Add the restart-fresh-session test to `src/monitor/manager.test.ts`.
4. Update `product/specs/monitoring.md` lifecycle section to describe slot release and the shared-slot survivor.
5. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

In `src/monitor/manager.test.ts`:

- New: start a monitor, stop it, start the same persona again on the same owner; assert a fresh session is primed with the suggestion format.
- Existing: stop, reset, and respawn tests continue to pass.

In `src/monitor/stop.test.ts`:

- New: two monitors on one owner with the same role; stopping one leaves the shared session alive for the other and does not close the slot.
- Existing: full-stop, target-drop, and reporting-tab teardown tests continue to pass.

## Out of scope

- The respawn path in `src/monitor/session.ts`, which already closes through the owner and retains its own fallback kill.
- Launcher and persona files.
- Reporting-tab teardown and target-drop behavior, which are unchanged.

Spec: `product/specs/monitoring.md` lifecycle section gains one sentence on releasing the shared role slot on stop and keeping it for a surviving same-role monitor on the same owner.
