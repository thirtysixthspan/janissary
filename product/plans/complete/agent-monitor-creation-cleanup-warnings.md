# Preserve cleanup warnings when agent monitor creation fails

**Complexity: 3/10** — The failure is confined to the headed-monitor launch catch path and can reuse the existing cleanup warning format.

## Goal

When creating a monitor fails, keep that failure as the agent result while reporting any cleanup failures caused by finishing the run.

## Approach

Replace the discarded `Promise.allSettled` result in the monitor creation failure path with a direct awaited finish. Convert any rejection or aggregate cleanup errors to warning strings and return them alongside `agentFailure` for the original monitor error.

## Implementation steps

1. Update the monitor creation failure path in `src/commands/agent.ts` to retain cleanup failures without replacing the monitor creation error.
2. Add a test in `src/commands/agent.test.ts` where monitor allocation and workspace release both fail, asserting the original failed response and cleanup warning.
3. Update `product/specs/agent-command.md` to specify the headed monitor failure result and cleanup warning behavior.
4. Remove only this resolved entry from the PR backlog and promote this plan to complete.

## Tests

- Force `openPluginTab` to fail while the run's workspace release rejects; assert a failed result with the original monitor error and workspace removal warning.
- Run `$janissary/scripts/run.mjs check-diff` after the implementation, test, and spec changes.

## Out of scope

Do not change the behavior or tests for the other PR backlog entry, agent termination status, unrelated cleanup paths, or the PR description.
