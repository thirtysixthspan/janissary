# Correct the fresh-mode run-creation-refusal claim in the agent specs

**Complexity: 1/10** — spec-only prose correction with no production code, requirements, test scenarios, or new units counted (p=1.578); no PR description edit.

## Goal

Separate the run-creation refusal from the failures that settle a Failed durable record in the two agent specs, so each spec matches the verified code path: a refused `manager.create` yields a failed launch result with no clone and no durable record, because no run exists to settle; the "settle the record failed with the original error and no fabricated prompt" behavior belongs only to failures that occur after the run exists.

## Approach

In the fresh branch of `startLocalAgentRun` (`src/agent/workspace-execution.ts`), `prepareFreshAgentWorkspace` builds an inert handle and predetermined clone directory but creates no clone and publishes no run. `createLocalAgentRun` calls `managers.agent.create`; if it refuses, the catch cancels the handle and rethrows before any run or record exists. In `launchAgent` (`src/agent/launch.ts`) the outer catch calls `finishRunAfterError(run, ...)`, and because `run` is still `undefined` it returns `agentFailure(error)` without settling a record. Failures that occur after creation — a synchronous workspace refusal, a thrown create/preflight error, and an asynchronous clone rejection — reach `finishRunAfterError` with a real run and do settle the record failed.

The two spec sentences that currently group all of these cases together are corrected to reflect this split. No source code changes.

## Implementation steps

1. In `product/specs/agent-command.md`, rewrite the sentence in the "Durable run records" section that lists "a synchronous workspace refusal, a thrown preflight error, an asynchronous clone rejection, and a run-creation refusal" as each settling the record failed. Keep the first three as the record-settling failures and split the run-creation refusal into its own sentence stating it is propagated as a failed launch result with no clone and no durable record created — the run and its record are never published, so there is no record to settle.
2. In `product/specs/subagent.md`, rewrite the "Workspace ownership" sentence that groups "a workspace refusal, a clone failure, or a run-creation refusal" as settling the record failed. Keep the workspace refusal and clone failure as the record-settling cases and separate the run-creation refusal as a failed launch result with no clone and no record, leaving nothing to settle. Preserve the final lease-removal-warning clause.
3. Run `check-diff` (spec-only change; expected to have nothing scoped to lint, typecheck, or tests).

## Tests

None — no code changed. `src/agent/workspace-execution.test.ts`'s "starts no clone when manager creation rejects" case already pins that a refused `manager.create` starts no clone, and the fresh-mode record cases pin that a created run publishes its record synchronously; the corrected prose only describes that existing behavior.

## Out of scope

- Any change to `startLocalAgentRun`, `createLocalAgentRun`, `finishRunAfterError`, or `prepareFreshAgentWorkspace` — the code already behaves as the corrected specs describe.
- The pull request's title and body — no description correction is called for.
- Help pages and user documentation — none describe this internal launch contract.
