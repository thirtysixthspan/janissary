# Revalidate deferred plugin allocations against agent run ownership

**Complexity: 8/10** — A deferred plugin callback can outlive its agent run, and admitted asynchronous host allocations must remain part of the run's awaited cleanup boundary.

## Goal

Prevent deferred plugin callbacks and their host capabilities from allocating tabs or editor resources after the owning agent run ends. Termination must await allocations already admitted before cleanup settles.

## Approach

Check run liveness before dispatching a ready callback and at each run-owned allocation capability. Agent runs admit allocations only while live, retain completion signals for admitted work, and wait for those signals before draining cleanup registrations. This keeps run identifiers internal and leaves calls without run ownership on their existing path.

## Implementation steps

1. Add an in-flight allocation boundary to `AgentRun` and `AgentRunManager`. Reject new allocations once termination starts, allow already-admitted allocations to register ownership, and await all admitted allocation completions before cleanup snapshots owned resources.
2. Revalidate run liveness before local and remote deferred ready handlers. Guard run-owned launch, plugin-tab, editor, and deferred claimed-file allocations and make late tab ownership registration fail closed.
3. Extend plugin launch tests for a callback that resumes after termination and one whose admitted allocation pauses across termination; assert late allocation is refused and cleanup waits for admitted allocation disposal.
4. Update `product/specs/agent-command.md` with the observable late-allocation and cleanup behavior.

## Tests

- Extend `src/plugins/launch-tab.test.ts` for callbacks resuming after run termination and allocations paused across termination.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step.

## Out of scope

Do not expose run IDs through plugin capabilities, wire data, or persisted payloads. Do not change ordinary plugin calls without a run owner or touch other PR backlog entries.
