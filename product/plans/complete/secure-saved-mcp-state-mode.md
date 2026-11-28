# Keep the saved MCP credential private

**Complexity: 3/10** — About 39 added lines across two production files and four test scenarios (p=4.61).

## Goal

Ensure the MCP listener only reuses a credential after its saved state has owner-only permissions. Keep those permissions when the server writes or replaces state.

## Requirements

1. “Enforce private permissions for valid MCP state before starting the listener.”
2. “Ensure an atomic replacement stays private.”
3. “Keep the configured port and token stable.”
4. Surface a startup failure if private permissions cannot be applied to valid state.

## Design decisions

- Read and secure the same open file descriptor before binding the listener. Change its permission bits only after its contents have been validated.
- Give private state writes an atomic writer entry point that publishes a file with mode 0600. Reuse the existing replacement and cleanup logic.
- Give a permission change failure a reason that names the file and filesystem error in the same startup notice as other MCP state failures.

## Preserved behavior

1. Invalid JSON still receives the invalid state diagnostic, and the file is not rewritten. The test `names the state file and the remedy when it is not valid JSON` in `src/mcp/manager.test.ts` covers it.
2. An explicit create mode still applies only to new files written through the general atomic writer. The test `applies a create mode only when the target does not exist yet` in `src/atomic-write.test.ts` rejects changing the mode on replacement.
3. A configured port still overrides the saved one without persisting the override. The test `uses mcpPort instead of the saved port without writing it back` in `src/mcp/manager.test.ts` checks this.

## Assumptions

1. `src/mcp/manager.ts:62` passes `STATE_MODE` for new credentials, establishing 0600 as the intended mode.

## Existing functionality

1. `src/mcp/manager.ts:47` uses `loadState` to validate state before starting a listener.
2. `src/atomic-write.ts:15` publishes the staged file with `renameSync(temporary, file)`.

## Implementation steps

1. Add a private atomic writer with an exclusively created temporary file and an explicit mode through its open descriptor. Share the existing rename and cleanup, retaining the general writer's current mode rules. Use the private writer in `saveState`. Secure valid saved state in `loadState` before the listener can bind, and retain the invalid and unreadable diagnostics. Run `$janissary/scripts/run.mjs check-diff`.
2. Extend the manager and atomic writer tests and update the server behavior in `product/specs/mcp-server.md`. Run `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The existing `mcp` command and failure notification show the reason when the server cannot secure an existing credential.

## Tests

1. In `src/mcp/manager.test.ts`, start from saved port and token state with wider permissions. Confirm private mode is in place before startup completes and the same port, token, and file contents are used (requirements 1 and 3).
2. Extend the token-only restart case to loosen its saved permissions first. After a reachable port is saved, confirm the original token is retained and the replacement is private (requirements 1, 2, and 3).
3. Simulate a permission change failure and verify it produces the precise failure notice, leaves the file intact, and keeps the server down (requirement 4).
4. In `src/atomic-write.test.ts`, replace a file whose mode was wider with the private API and confirm the new file and contents are correct (requirement 2).

## Out of scope

Token rotation, credential storage location, and changes to permission policy for other saved state.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Start Janissary in a scratch project and run `mcp` to record the port. Stop that instance, run `chmod 644 .janissary/mcp.json` inside the scratch project, and restart it. The `mcp` command should show the same running port and `ls -l .janissary/mcp.json` should show `-rw-------`. A different port, a startup failure on an owned file, or wider permissions indicates a regression.
