# Deduplicate per-slot persona role death hooks

**Complexity: 3/10** — ~12 added lines across 2 production files, 5 behavioral requirements and 6 scenarios (p=4.59); a bounded map swap with no new module.

## Problem

`PersonaRoleSessionManager.session` appends the caller's hook to a per-slot array on every call. Every `promptPersonaRole` call — one per editor suggestion, monitor prime, or respawn — adds another closure that the connection-death path later walks. A long-lived persona connection accumulates one hook per request even though all those hooks act on the same role slot and the same current prompt. `forget()` clears the array on death, close, tab release, and disposal, so the growth is bounded only by the connection's lifetime, not by its consumers.

## Goal

A repeated prompt from the same persona on one role slot replaces that consumer's death hook instead of adding another, so a slot holds at most one hook per consumer. Distinct consumers sharing a slot — several monitors, or a monitor alongside an editor persona — keep one hook each, and a connection-level death still reaches every one of them exactly once. Death, close, tab release, and disposal still clear the slot's hooks.

## Approach

1. `src/acp/persona-role-session.ts`: key the per-slot death hooks by consumer identity instead of storing a plain array. A repeated identity overwrites its entry; callers with no explicit identity fall back to the hook object itself, so direct callers that pass distinct hooks stay distinct. Keep the composite `state.hooks` that walks the current entries, and keep `forget()` dropping the whole slot on every teardown path.
2. `src/acp/persona-role.ts`: pass the persona name already received as the caller argument into `session`, so repeated prompts from one persona collapse to one hook while two personas declaring the same role remain separate consumers.
3. No change to the death path, `EditorAcpManager`, monitor session coordination, or the role slot state shape.

## Implementation steps

1. Change `deathHooks` in `PersonaRoleSessionManager` from an array-valued map to a map of identity-to-hook maps, with `string | PersonaRoleHooks` as the identity type.
2. Add an optional `caller` parameter to `session`; register under `caller ?? hooks`, rebuild the composite `state.hooks` over the map's values, and leave session creation and identity numbering untouched.
3. Pass `persona` as that argument from `promptPersonaRole`.
4. Leave `forget()` deleting the slot key on close, death, tab release, and disposal.
5. Run `$janissary/scripts/run.mjs check-diff` after the source changes.

## Tests

- `src/acp/persona-role.test.ts`: keep the existing multi-consumer death test's two single-notification assertions, giving its two direct `session` calls distinct caller identities; add a case where the same caller calls `session` twice and only the replacement hook fires; add a case where two personas sharing a slot keep separate hooks and both fire once.
- `src/monitor/manager.test.ts`, `src/editor-suggest/death-notice.test.ts`, `src/monitor/session.test.ts`, and `src/editor/acp-manager.test.ts`: keep passing unchanged, preserving their single-notification assertions and shared-role respawn behavior.

## Spec updates

- `product/specs/monitoring.md`: state that repeated requests on one role connection do not multiply death notices or add work to the death path, while each consumer sharing the role still gets exactly one notice.

## Documentation

- No help page or user-documentation page describes per-request death registration, so nothing to update.

## Out of scope

- No change to the canonical plan, the PR description, or the other backlog entries.
- No new module; `persona-role-session.ts` stays under the 200-line limit.
- No change to connection death semantics, notification text, or monitor respawn coordination.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each step and after the tests. Never run `npm run check`.
