# Preserve terminated agent monitor status through cleanup

**Complexity: 3/10** — The bug is a status-ordering race between the monitor's termination capability and the command's cleanup transition.

## Goal

Keep a monitor-triggered termination visible as `Terminated` after execution returns and run cleanup finishes, while preserving completed and failed outcomes.

## Approach

Treat a run's latched outcome as authoritative for its projected terminal status. The agent command should enter `Cleaning up` only while no outcome has been latched, and `AgentRun` should not allow later status updates to overwrite a terminal projection.

## Implementation steps

1. Guard the cleanup status transition in `src/commands/agent.ts` and protect a latched terminal status in `src/agent/run.ts`.
2. Add an `src/commands/agent.test.ts` case that starts a headed run, terminates it through the monitor plugin capability while execution is pending, waits for cleanup, and checks the final monitor projection is `Terminated`.
3. Keep the existing completed and failed result assertions intact, and update `product/specs/agent-command.md` to describe the final monitor status.
4. Remove only the selected entry from `product/backlog/pull-request.md` and promote this plan to complete.

## Tests

- Terminate a pending headed run through `managers.plugins.intent` and assert the run's retained monitor projection is `Terminated` after the command settles.
- Preserve existing completed and failed command-result coverage.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step.

## Out of scope

Do not change monitor termination semantics, unrelated lifecycle paths, other backlog entries, or the pull request description.
