# Resolve subagent caller identity from persona role sessions

**Complexity: 3/10** — ~18 added lines across 3 production files, 5 behavioral requirements (p≈4.69); a bounded fallback in the caller-identity lookups with no new architecture.

## Problem

A persona whose declared role grants `subagent` looks fully configured in the roles tab, but every attempt from that persona fails with `Subagent: caller session is not available.` The persona's ACP session lives in the tab's `personaRoles` slot, while `AcpSessionManager.sessionIdentity` and `providerSessionId` — the two lookups `launchSubagent` uses to build the caller snapshot — read only the ask/tell `acpRoles` map. The persona slot also never records the provider session id the harness reports at handshake, so even a lookup taught to see the slot would have no id to return.

## Goal

When a persona prompt's reply issues a granted `subagent` command, the caller identity resolves from that persona's own session, so the subagent launches with the same caller metadata an ask or tell session provides. The ask/tell lookup keeps priority wherever such a session exists. An ACP-tool caller with no identity at all still fails loudly with the same error.

## Approach

1. `src/acp/persona-role-state.ts`: add an optional `providerId` to `PersonaRoleRuntime` so the slot holds the same provider id an ask/tell holder records.
2. `src/acp/persona-role-session.ts`: pass `onSessionStarted` into `connectAcp` and store the reported id on the slot, mirroring `AcpSessionManager.session`.
3. `src/acp/session-manager.ts`: when the ask/tell lookup yields no identity or provider id, fall back to the tab's current persona slot for that role. Keep the ask/tell path first and unchanged; guard the fallback with the same tab-runtime and closing checks.
4. `src/subagent/launch.ts`: no change — the existing unresolved-session error stays.

## Implementation steps

1. Add `providerId?: string` to `PersonaRoleRuntime`.
2. In `PersonaRoleSessionManager.session`, supply `onSessionStarted` to `connectAcp` and assign the reported id to the slot's `providerId`.
3. Import `existingPersonaRoleRuntime` in `AcpSessionManager`, add one private helper that returns the current persona slot for a label and role, and use it as the fallback in `sessionIdentity` and `providerSessionId`.
4. Add the regression test below and run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/acp/persona-role.test.ts`: grant `subagent` to a custom role, have `connectAcp` report a provider id, drive `promptPersonaRole`, and have the mocked core prompt resolve the caller identity the way the subagent launch does; assert both the internal identity and provider id come from the persona slot.
- `src/acp/run-prompt.test.ts` and `src/subagent/launch.test.ts`: keep passing unchanged.

## Spec updates

- `product/specs/subagent.md`: state that a persona role session can supply the caller role, internal identity and provider id captured at subagent launch, the same way an ask or tell session does.

## Documentation

- No help page or user-documentation page describes persona caller-identity resolution, so nothing to update.

## Out of scope

- No change to the ask/tell lookup order or behavior, the unresolved-session error, the canonical plan, the PR description, or the other backlog entries.
- No new module; `session-manager.ts` stays under the 200-line limit.
