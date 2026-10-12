<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's deadline exemption for monitor-triggered run cleanup.

Existing Issue: The `terminateAgentRun` capability awaits `AgentRunManager.finish` inside the plugin handler's five-second deadline, although run cleanup can include a five-second ACP shutdown plus other awaited resource releases. Severity: 6/10

Existing Risk: 6/10 - A slow but valid cleanup can time out and disable the monitor plugin before termination finishes, closing the monitor and losing its final projection.

Proposal Risk: 2/10 - Exempting host-owned cleanup from the plugin handler clock preserves the monitor during slow termination while the run's own bounded cleanup and warning behavior still limit the underlying lifecycle.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "exempt monitor termination cleanup from the plugin deadline". In `src/plugins/context.ts`, run the `managers.agent.finish` promise inside the existing `deadline.exempt` mechanism when `terminateAgentRun` is called, while retaining the current monitor-tab binding and missing-run rejection checks. Preserve the five-second budget for plugin-owned work and keep core cleanup's own ACP and remote-release bounds. Add coverage in `src/plugins/dispatch-deadline.test.ts` or `src/plugins/host.test.ts` where monitor termination takes longer than the plugin handler timeout but eventually settles without disabling the plugin or closing its monitor; retain the existing timeout coverage for plugin-owned handlers and the agent lifecycle tests for cleanup warnings.
