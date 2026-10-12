# Await local ACP process-tree teardown

Complexity: 6/10

## Goal

Keep a local agent's owned ACP process tree from outliving cleanup or using a workspace after it is released, while ensuring teardown cannot block cleanup indefinitely.

## Approach

Make `connectAcp` spawn its owned local process in an isolated process group where supported. `shutdown()` sends a graceful signal to that owned group, waits for the leader and descendants to exit, escalates to a forceful signal after a bounded grace period, and rejects if shutdown still cannot be confirmed within its deadline. Preserve the synchronous `kill()` API for existing consumers. Register `shutdown()` as local agent cleanup so `AgentRun.cleanup()` awaits it before closing owned tabs and releasing the workspace. Existing cleanup warning collection retains shutdown errors without changing the agent outcome.

## Implementation steps

1. Add a focused process-tree shutdown helper and update local ACP shutdown to use bounded graceful termination and escalation while preserving prompt and permission behavior.
2. Register awaited local ACP shutdown in agent run cleanup, leaving remote release behavior unchanged.
3. Add real-process ACP coverage for observed child exit and focused bounded-shutdown escalation coverage, plus agent lifecycle coverage for cleanup ordering and warning retention.
4. Update the ACP behavior spec and remove only this resolved entry from the PR backlog.

## Tests

- `src/acp/index.test.ts` proves shutdown waits for observed child exit, shares concurrent calls, escalates from graceful to forceful termination, and rejects when process-tree exit cannot be confirmed before the deadline.
- `src/agent/execute.test.ts` proves workspace release follows awaited ACP teardown; `src/commands/agent.test.ts` proves teardown failure is retained as a warning without replacing the requested outcome.
- The listed ACP and agent lifecycle tests cover observed process-tree exit, concurrent shutdown, bounded escalation, timeout rejection, cleanup ordering, and warning retention.

## Specs / docs

Update `product/specs/acp.md` to describe local agent process-tree shutdown, bounded escalation, and uncertain cleanup reporting. Existing user documentation does not describe this internal cleanup behavior.

## Out of scope

Do not change remote ACP cleanup, prompt or permission behavior, other local ACP consumer policies, unrelated workspace lifecycle behavior, the PR description, or any other backlog entry.
