# Clarify tell reset versus ask close routes

**Complexity: 1/10** — clarifies one ACP spec sentence without changing command or connection behavior.

## Goal

Make the ACP spec distinguish tell-specific reset from generic connection close actions, which still close only the ask session.

## Approach

- In `product/specs/acp.md`, update the reset summary so `tell reset` is identified as the action that closes the tell role. State that the connection tab's **Close session** and `connections close acp:<name>` continue to close only ask until role-aware connection routing is delivered.
- Keep all runtime behavior unchanged. `src/plugins/connections-topic-actions.ts` routes core record close actions to role `ask`, and `src/connection/close.ts` calls `managers.acp.close(label)` without a role, which defaults to ask.
- Preserve the exact ask and tell reset wording already covered by `src/commands/ask-reset.test.ts` and `src/commands/tell-reset.test.ts`.

## Tests

- No new tests are needed; this is a documentation-only correction and existing command reset tests cover the unchanged behavior.
- Run `./scripts/run.mjs check-diff` and `git diff --check` after the spec edit.

## Out of scope

- Adding tell-specific close routes to connection actions or changing connection identifiers; role-aware connection routing remains in the later connection-identity work.
- Changing either reset command or its runtime behavior.
