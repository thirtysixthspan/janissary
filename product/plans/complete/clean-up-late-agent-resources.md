# Clean up late agent resources

**Complexity: 3/10** — the change is isolated to run resource registration and its lifecycle tests.

## Goal

Dispose a resource immediately when its registration arrives after the agent run has ended, while still rejecting the registration and preventing disposer failures from reopening or changing the settled run outcome.

## Approach

Keep `addResource`'s existing ended-run error. Before throwing it, invoke the supplied disposer once and contain both synchronous throws and asynchronous rejections. A run whose cleanup has already settled cannot retroactively report a later disposer failure; preserving the registration error and settled cleanup result keeps error reporting deterministic.

## Implementation steps

1. Update `AgentRun.addResource` to invoke and contain the disposer for late resources before rejecting registration.
2. Extend `src/agent/manager.test.ts` to prove late asynchronous disposal runs exactly once and rejection is contained, while the registration still throws the existing error.
3. Update `product/specs/agent-command.md` to describe late-resource disposal and error behavior.

## Tests

- Late registration remains rejected with `Agent run has already ended.`.
- The late disposer runs exactly once, including when it returns a rejecting promise.
- A late disposer rejection is contained and does not change the already-settled finish result.
- Existing cleanup-failure coverage continues to prove every registered resource is attempted and failures are reported.
- The `AgentRunManager` tests cover rejected late registration, one-time disposal, contained asynchronous disposer failures, and preservation of the settled run outcome.

## Out of scope

- Changing the run outcome or manager removal behavior.
- Aggregating failures from a late disposer into a cleanup promise that may already have settled.
- Changing cleanup ordering or workspace-release semantics.
