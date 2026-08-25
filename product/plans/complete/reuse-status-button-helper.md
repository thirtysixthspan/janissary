# Reuse the status-button helper for connection controls

**Complexity: 2/10** — four equivalent object literals become calls to an existing pure helper, with a focused test for that helper. No props, types, or behavior change.

## Goal

Keep the status-window-to-button-props mapping in its one existing definition.

## Approach

Replace each hand-built `connectionsButton` literal with `statusButton(hasContent, window)`. Preserve the harness tab's conditional omission and use the same helper for its schedule button. Add a direct unit test proving the helper preserves each handler and content flag.

## Implementation steps

1. Route the agent, inactive-agent, harness, and editor connection button mappings through `statusButton`.
2. Keep the harness `scheduleOnly` guard around the helper call so SSH harnesses continue to omit the connections button.

## Tests

- `web/src/status-button.test.ts` verifies `statusButton` returns the content flag and all three original window handlers.
- `./scripts/run.mjs check-diff` verifies affected client tests and typechecking.

## Out of scope

- Changing status-window behavior, button props, or connection-panel interactions.
