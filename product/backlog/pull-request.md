<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver autonomous agent task execution through the canonical command path, rather than leaving the launch parser and dispatch groundwork without an executable command.

Existing Issue: The branch adds parsing, task and skill resolution, run bookkeeping, and structured dispatch support, but registers no `agent` command and starts no ACP task session, leaving the source plan's core task-execution behavior unavailable. Severity: 9/10

Existing Risk: 8/10 - Users cannot execute the feature the source plan defines, while the partial run and invocation abstractions can be mistaken for a working launch path and delay finding the missing integration.

Proposal Risk: 4/10 - A canonical command and run-to-ACP path would make headless execution and its result real, but its asynchronous ownership and cleanup still need to be verified across cancellation and provider failures.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "implement the canonical agent command and autonomous task execution". Add the `agent` command under `src/commands/` and register it through the existing command registry, using `src/agent/command-parser.ts`, `src/agent/task-resolution.ts`, `src/agent/skill-grants.ts`, and `src/agent/manager.ts` rather than introducing parallel parsing, grant, or ownership paths. Connect execution to the existing ACP session and loop so task text, parameters, selected skills, model, effort, and whole-command grants are applied before prompting; return the specified status, response, and cleanup warnings only after owned resources are released. Carry the run's caller context and abort signal through command invocation and resource allocation, await `question` answers for granted requests, and ensure late command, provisioning, and tab-allocation results cannot outlive the run. Update `product/specs/agent-command.md`, application-command help and user documentation for observable behavior. Add colocated tests for headless success, denial, question answer/cancel, provider failure, caller termination, and cleanup errors, including overlap with another caller's dispatch output.


* Add the planned lazy monitoring plugin and tab-scoped run projection so a headed agent run can be observed and terminated without owning execution.

Existing Issue: The source plan calls for an `agent-monitor` server and client plugin with activity projection, metadata, and run-scoped termination, but the aggregate diff adds no monitor contribution, wire projection, loader, or client implementation. Severity: 8/10

Existing Risk: 7/10 - Even after task execution is connected, callers requesting `in a tab` will have no planned read-only activity view or in-tab termination control, and no client boundary will enforce run scoping.

Proposal Risk: 3/10 - A lazy plugin bound by the server to its owning run would expose only that run's projection and termination capability, though plugin activation and streamed update races would still need coverage.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "implement the scoped lazy agent monitoring plugin". Add the `agentMonitor` contribution and tab-scoped `agentRun` projection in the existing plugin and protocol modules, with literal server and client loader entries and a lazy client implementation under `web/src/plugins/agent-monitor/`. Bind the monitor to its run on the server; have the host derive run identity from the owning tab rather than accepting a client-selected run ID. Render the planned launch metadata, status, reported activity, and terminate action through existing transcript surfaces, and ensure monitor close or plugin failure only detaches monitoring. Update the behavior spec and add server/client coverage for lazy loading, targeted revisions, access isolation, termination, failure, and monitor closure while the run continues.


* Implement remote agent execution and acknowledged teardown so remote runs do not depend on an unmodified tab-owned session lifecycle.

Existing Issue: The source plan requires remote ACP policy, activity and close acknowledgments, ephemeral run leases, and transport-loss cleanup, but no remote protocol, channel, or manager file is changed in the aggregate diff. Severity: 8/10

Existing Risk: 7/10 - An `on <host>` launch cannot meet the planned execution-host semantics or report whether remote processes and workspace references were released, risking orphaned work after transport loss.

Proposal Risk: 4/10 - Versioned remote requests and bounded teardown acknowledgments would make uncertainty visible and contain orphan risk, but cleanup still depends on an unavailable peer being handled as an explicit warning.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "add remote agent execution and acknowledged cleanup". Extend the existing remote ACP request and readiness flow to carry autonomous permission policy, session configuration, and execution-host task/skill resolution; add typed activity and close/release acknowledgments to the existing ACP frame family and bump its protocol version so older peers refuse unsupported policy. Track agent-only remote references as ephemeral, abort runs on caller or transport loss, close autonomous sessions and release run-owned references without disrupting shared users, and bound acknowledgment waits while preserving cleanup warnings. Update the remote workspace and agent specifications, and add frame, channel, manager, and lifecycle tests for version mismatch, headless launches, shared borrowed workspaces, transport loss, and timeout reporting.


* Remove the executable verification command from the completed late-resource plan, which still directs readers to run repository tooling.

Existing Issue: `product/plans/complete/clean-up-late-agent-resources.md` tells readers to run `./scripts/run.mjs check-diff` after implementation and documentation changes, leaving an operational command in reviewed branch content. Severity: 5/10

Existing Risk: 7/10 - A reviewer or agent following the completed plan can execute branch-supplied tooling despite the review's command-containment rule, invoking code that has not been independently trusted.

Proposal Risk: 2/10 - Replacing the imperative with a descriptive verification record removes this execution prompt while retaining the late-disposal coverage and stated outcome.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove the executable verification directive from the late-resource plan". In `product/plans/complete/clean-up-late-agent-resources.md`, replace the `check-diff` instruction in the Tests section with a factual description of the late-resource behavior coverage, without claiming a verification run unless the branch records evidence for it. Review the completed plan for further direct tool-execution instructions and keep its implementation scope and late-disposer requirements intact. Verify by reading the plan and its focused diff; no application behavior or automated tests are involved.
