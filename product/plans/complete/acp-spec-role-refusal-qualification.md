# Qualify the ACP role-refusal rule against the per-call availability gate

**Complexity: 1/10** — documentation only. One spec section; no behavior change.

Issue: `product/specs/acp.md` says an included-owner command the role did not grant returns the role refusal without noting that a disabled or agent-off command returns the disabled refusal first. That contradicts the section's own per-call gate paragraph and the ordering implemented in `src/acp/tool-table.ts`.

## Goal

Make the "Autonomous tool loop" section describe one consistent ordering: the prompt-built allow-list filters by availability, the per-call gate re-reads settings and refuses a disabled or agent-off command with `Command is disabled: <command>.`, and only an enabled command with agent access on can reach the role-grant refusal.

## Approach

- Clarify the prompt-build sentence: the allow-list is built for each prompt, while the per-call gate re-reads current settings before each emitted command runs.
- Qualify the role-refusal sentence: it applies only to a command that is enabled and has agent access on; a disabled or agent-off command returns `Command is disabled: <command>.` before the role check.

## Implementation steps

1. `product/specs/acp.md` — in "Autonomous tool loop", revise the sentence beginning "Availability is read when each prompt is built" and the sentence beginning "A known command from an included tool owner that the role did not grant".

## Tests

No new tests. The behavior is already pinned by `src/acp/tool-table.test.ts` (disabled refusal before the role refusal, the same refusal for an agent-off granted command, and the exact role refusal for an enabled but ungranted command) and by `src/acp/manager.test.ts` (settings re-reads and mid-prompt revocation). A documentation-only change cannot affect runtime behavior; `check-diff` confirms the suite still passes.

## Out of scope

- Code and test changes.
- `help/tell.md` and `documentation/user-documentation/advanced-agents/acp-agent.md`: both mention the role refusal but neither claims it runs before the availability check, so neither is wrong.

## Verification

Read "Autonomous tool loop" against `src/acp/tool-table.ts` and `src/acp/run-prompt.ts` and confirm no sentence implies the role check runs before the availability check. Run `$janissary/scripts/run.mjs check-diff`.
