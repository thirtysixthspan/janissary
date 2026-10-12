# Propagate agent run ownership through deferred plugin launches

**Complexity: 6/10** — Trusted invocation metadata must survive the command adapter and later host-owned plugin work, with lifecycle coverage for asynchronous tab creation and teardown.

## Goal

Ensure tabs opened by a granted plugin command remain owned by its agent run even when a workspace-backed plugin tab's ready callback creates them after command dispatch has returned. Keep run identity internal to the host and await cleanup of every owned tab and its resources.

## Approach

Carry `CommandInvocationContext.runId` into the internal `PluginFailureOrigin` built by the plugin command adapter. Preserve that origin through guarded and deferred plugin calls so launch-ready callbacks pass the trusted identity to host-owned file/editor openers. Do not add run identity to any plugin capability or wire type. Reuse the existing tab incarnation checks and command/open cleanup mechanisms.

## Implementation steps

1. Pass the trusted invocation `runId` alongside `invocationId` in `src/plugins/command-adapter.ts` and add adapter coverage that proves both internal identifiers reach the host while neither is present in the plugin capabilities.
2. Add focused integration coverage for a run-owned plugin command that launches a workspace-backed plugin tab, then creates a second tab from its ready callback after dispatch has returned. Verify run cleanup closes both tabs, awaits their resource releases, and does not close an existing or recycled tab.
3. Update `product/specs/agent-command.md` to state that deferred plugin-launch tabs created by a granted command belong to that run and are closed with awaited resource cleanup.

## Tests

- Extend `src/plugins/adapters.test.ts` to assert generated plugin commands forward the trusted invocation identity to `runCommand`.
- Extend plugin launch tests with a granted command and a deferred ready callback that opens a second host-owned tab after initial dispatch. Finish the owning run and assert both run-created tabs close, cleanup waits for their asynchronous releases, and pre-existing/recycled tabs remain.
- Run the diff-scoped lint, typecheck, and related server tests after each implementation step.

## Out of scope

Do not expose run identifiers through the plugin API, client wire protocol, or persisted plugin payloads. Do not alter unrelated PR findings or change tab de-duplication/incarnation behavior.
