# Agent command launch orchestration

## Complexity

6/10. The refactor spans the command adapter and the agent feature, with several lifecycle exits and both local and remote target selection, but existing integration tests already cover most outcomes.

## Goal

Keep `src/commands/agent.ts` focused on parsing, invoking, and reporting. Put launch orchestration in the agent feature, choose the local or remote execution target in one function, and settle every created run through one helper that collects cleanup warnings.

## Approach

Add an agent launch entry point that receives the parsed launch and canonical command names from the command layer. Keep command-list lookup in `src/commands/agent.ts`, where its existing registry import belongs. Extract local-versus-remote target selection, monitor-tab creation, and run settlement into focused agent modules. Move the agent-specific invocation-context helper into the agent feature so the command adapter does not own launch support logic.

Preserve current launch results and resource ownership. In particular, do not create a run or local workspace when remote target resolution is cancelled; let the existing remote resolver release its provisional connection, and retain the existing result shape for that pre-run failure.

## Implementation steps

1. Add `src/agent/launch-target.ts` to return either a local target with an optional workspace name or a remote target with its channel, host, workspace lease, and source tab. Reuse `resolveRemoteAgentTarget` and `inheritRemoteAgentTarget` and preserve the current workspace validation.
2. Add `src/agent/settle-run.ts` to choose the registered manager finish path or the run's own finish path, catch cleanup failures, and return their warning messages.
3. Move monitor-tab creation and the agent invocation-context helper into `src/agent/`.
4. Move run creation, workspace provisioning, task snapshot resolution, monitor creation, execution, and final result settlement into `src/agent/launch.ts`. Keep command names supplied by the command adapter so the agent feature does not import the command registry.
5. Reduce `src/commands/agent.ts` to parse the command, invoke the agent launch entry point, and append the formatted result.

## Tests

Keep the existing assertions in `src/commands/agent.test.ts` passing for local and remote launches, workspace provisioning and cleanup, monitor creation and failure, nested runs, and cleanup warnings. Add a case that aborts while an explicit remote target is waiting for readiness and verifies no agent run or local workspace is created and the remote provisional connection is released. Run `$janissary/scripts/run.mjs check-diff` after each implementation step.

## Spec and public documentation

Update `product/specs/agent-command.md` to clarify that target-resolution cancellation does not start a run and that acquired run resources are released on settlement. No public documentation changes are needed because the refactor does not change the behavior already documented.

## Out of scope

Do not change launch grammar, target-selection policy, cancellation result wording/status, cleanup ordering, monitor presentation, command output, or task and skill resolution. Do not resolve any other technical-debt item.
