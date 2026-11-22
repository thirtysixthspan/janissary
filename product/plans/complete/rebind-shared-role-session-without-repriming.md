# Re-bind a shared-role session respawn without re-priming

**Complexity: 2/10** — 5 added lines in 1 production file, 4 requirements, 3 scenarios (p=3.91); a single guarded early return in one function.

## Problem

`respawnMonitorSession` in `src/monitor/session.ts` computes `keepShared` for the case where a sibling monitor on the same owner still uses the same role and the persona role slot still holds a live session, but it does not act on that flag as a skip: it always falls through to `openMonitorSession`, which posts the persona body, suggestion format, and trust framing again. Even when the shared session is healthy and only one monitor hit a prompt error, the full priming prompt is duplicated into the conversation every monitor on that role shares, growing its context and degrading its suggestions.

The canonical `coordinate-shared-role-session-respawn` plan already promised that the live-slot case re-binds "with no close, no kill, no second priming," and `product/specs/monitoring.md` already describes re-binding without closing — the implementation simply never delivered the no-re-prime part.

## Goal

When a monitor respawns while a sibling on the same owner still holds a live session for the same role, the failing monitor re-binds to the current shared session and returns without posting another priming prompt. When no sibling holds the role or the slot's session is gone, the existing behavior is untouched: close the slot once (kill the registration's session as fallback), prime a fresh session, and re-point every sibling to it.

## Approach

1. **`src/monitor/session.ts`** — in `respawnMonitorSession`, immediately after computing `keepShared`, add a guard for the kept case: assign `reg.session` from the `state` obtained through `existingPersonaRoleRuntime`/`tabRuntime`, clear `reg.inFlight` (the failed flush still owns the slot, and skipping `openMonitorSession` means no re-prime settles it), and return before `openMonitorSession`. Narrow on `state?.session` in the guard so the assignment is type-safe.
2. Leave the per-registration `contextBytes`/`contextText` reset where it is at the top of the function, so each monitor still discards only its own accumulated context.
3. Leave the not-kept path — the `close`/`kill`, the `openMonitorSession` call, and the sibling re-point loop — byte-for-byte unchanged.

## Implementation steps

1. Add the early re-bind-and-return guard to `respawnMonitorSession` in `src/monitor/session.ts`.
2. Add the re-bind test in `src/monitor/session.test.ts` below, then run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/monitor/session.test.ts`: prime one monitor so the role slot holds a live session, put it and a second same-owner/same-role registration in the monitors map, call `respawnMonitorSession` on the second registration, and assert `promptPersonaRole` is still at one call (no re-prime) and that its `reg.session` is the session in the role slot. Keep the existing close/reset/re-prime test unchanged.
- The shared-role respawn and re-bind cases in `src/monitor/manager.test.ts` keep passing unchanged.

## Spec updates

- `product/specs/monitoring.md`: the "Role-backed sessions" paragraph already describes re-binding a still-usable shared session without closing it; confirm the wording still matches after the guard and change nothing if it does.

## Documentation

- No help page or user-documentation page describes this recovery detail, so nothing to update.

## Out of scope

- No change to the not-kept close/kill/prime/re-point path.
- No change to the canonical plan, the PR description, or the other backlog entry.
