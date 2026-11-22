# Correct the stale MonitorManager session comment

**Complexity: 1/10** — one comment block in one production file changes, with no behavioral requirements, scenarios, or new units (p=2.75).

## Goal

`MonitorManager`'s class comment still describes each monitor as a dedicated, tool-less ACP session primed with its persona. Since monitors were moved onto shared role-backed sessions, that description is wrong and could mislead a reader about a monitor's tool boundary. This fix rewrites the comment so it matches how monitors actually launch today.

## Requirements

1. The `MonitorManager` class comment must no longer call a monitor session "dedicated" or "tool-less".
2. The comment must state that a monitor drives one role-configured core ACP session per owner tab and role.
3. The comment must state that this session is shared between monitor requests and the tab's editor persona requests through the same core pipeline `ask` and `tell` use.
4. The comment must state that the session's model and command grants come from the persona's declared role and its configured fallback entries, not a persona tool allowlist.
5. The comment must keep describing the unchanged 30-second batched flush and inline/external suggestion routing.

## Design decisions

- **Comment-only change.** Nothing in the launch path changes; only the documentation above the class does.
- **Reuse the spec's and editor owner's vocabulary.** Mirror the "Role-backed sessions" section of `product/specs/monitoring.md` and the editor owner comment in `src/editor/acp-manager.ts` so the three descriptions agree.
- **Keep the operational half of the comment.** The buffer/flush/suggestion lines are still accurate and stay byte-for-byte unchanged.

## Assumptions

1. `src/monitor/session.ts` primes each monitor through `promptPersonaRole`, which routes to `managers.personaRoleSessions.session(label, role, ...)`, the shared core pipeline (`src/monitor/session.ts:33`, `src/acp/persona-role.ts:59`).
2. The editor owner comment describes the same role-keyed sessions as living on the tab runtime's `personaRoles` record created by the shared core role entry (`src/editor/acp-manager.ts:11-16`).
3. The "Role-backed sessions" spec section says monitors use the role's command grants through the same tool loop as `ask` and `tell`, with no persona-specific tool allowlist (`product/specs/monitoring.md:68-70`).

## Existing functionality

1. The shared persona-role session manager that keys sessions by label and role — `managers.personaRoleSessions.session(label, role, ...)` (`src/acp/persona-role.ts:59`).
2. The role settings and fallback-entry ordering that decide the model and command grants — `knownRoleSettings`/`attemptOrder` (`src/acp/ask-role.ts`).
3. The monitor's 30-second batched flush and inline/external suggestion routing, already described in the rest of the comment and unchanged by this fix.

## Implementation steps

1. In `src/monitor/manager.ts`, replace the first two lines of the `MonitorManager` class comment (the "Owns all live monitors..." / "dedicated, tool-less ACP session..." lines) with wording that names one role-configured core ACP session per owner tab and role, notes it is shared with the tab's editor persona requests through the same core pipeline `ask` and `tell` use, and states that its model and command grants come from the persona's declared role and its configured fallback entries rather than a persona tool allowlist.
2. Leave the remaining comment lines (buffer/flush timing and inline vs. external suggestion routing) untouched.
3. Run `$janissary/scripts/run.mjs check-diff`; the tree stays green.

## User interface

No UI surface changes. This edit touches only a source comment.

## Tests

No new tests. The change adds no code and alters no behavior; the existing monitor tests cover the launch and session paths the comment describes. `check-diff` must stay green.

## Out of scope

- Any change to the monitor launch path, `promptPersonaRole`, or the persona-role session manager.
- Changes to `product/specs/monitoring.md` or `src/editor/acp-manager.ts`; those files already describe current behavior and are referenced only for consistency.
- Behavior, tests, and documentation beyond this one comment.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` and confirm lint, typecheck, and tests all pass with no diff-scoped failures.
- Manual reading check: read `src/monitor/manager.ts:21-27`, `src/editor/acp-manager.ts:11-16`, and `product/specs/monitoring.md:68-70` together. Confirm the manager comment no longer says "dedicated" or "tool-less", names the shared role-configured core session per tab and role, mentions editor requests sharing it, credits the role's grants and fallback instead of a persona allowlist, and agrees with the editor owner comment and the spec's Role-backed sessions section. A lingering "dedicated" or "tool-less" phrase, or wording implying a fixed deny-all policy, would show the change was not made correctly.
