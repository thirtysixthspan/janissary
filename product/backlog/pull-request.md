<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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


* Correct the pull request description's claim that the full command will become available in later subplans, since this diff already registers and executes local tasks.

Existing Issue: The pull request body says the first implementation only adds parser and resolver groundwork and that the full command becomes available as later subplans land, while this aggregate diff registers `agent` and executes headless local ACP tasks. Severity: 4/10

Existing Risk: 4/10 - Reviewers and users relying on the pull request summary can miss the executable behavior and its limits, including that workspace, remote-host, and monitoring selectors are rejected.

Proposal Risk: 2/10 - A summary aligned with the shipped local execution path and its unsupported selectors would make the implemented surface and remaining work clear, though the command's actual behavior would be unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "correct the description of the implemented local agent command". Update only the description's “What” and behavior summary to state that the diff includes the canonical headless local `agent` command, awaited results and cleanup, and the currently unsupported remote-host, named-workspace, and tab-monitoring selectors. Keep its parser, resolver, skill-grant, and test details, but remove the claim that command execution will arrive only in later subplans. Verify the revised description against `src/commands/agent.ts`, `src/agent/execute.ts`, and `documentation/user-documentation/advanced-agents/agent-command.md` without changing implementation or plan files.


* Deliver the original plan's fresh-workspace isolation for local agent runs instead of executing against the caller's source directory.

Existing Issue: The original feature plan requires a fresh workspace by default and task/skill resolution from that provisioned workspace, but `src/commands/agent.ts` resolves from the caller's cwd and `src/agent/execute.ts` launches ACP in that same directory; the current spec and user guide also codify caller-directory execution. Severity: 8/10

Existing Risk: 8/10 - An autonomous run can modify or delete the caller's working tree and consume uncommitted task or skill files, while its sandbox only confines writes to that same source directory rather than an isolated clone.

Proposal Risk: 3/10 - Provisioning a disposable clone before resolution and running ACP inside it protects source files and makes task snapshots match the planned execution workspace, while sandbox configuration and provider behavior still govern activity within the clone.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "run local agent tasks in an isolated workspace". In `src/commands/agent.ts`, provision a fresh workspace by default through `WorkspaceManager.create`, await readiness before resolving task and skill files, and honor the planned borrowed-workspace selection only when its reference is tracked. Resolve snapshots against that execution workspace, pass its directory as both `cwd` and `workspaceDir` to `connectAcp` in `src/agent/execute.ts`, and register provisioning cancellation and workspace release with the run so failures and caller termination release resources before settling the result. Emit the specified sandbox-disabled notice to notifications when the isolated workspace cannot be confined. Update `product/specs/agent-command.md` and the agent command user guide to distinguish execution workspace from caller context. Extend `src/commands/agent.test.ts`, `src/agent/task-resolution.test.ts`, and workspace lifecycle tests to prove source edits are not used, task lookup uses the clone, and provisioning/cancellation/cleanup failures preserve the result and release references; no current test covers these integrated side effects.


* Restrict nested agent runs to their parent's selected skills and effective command grants.

Existing Issue: `src/agent/command-tools.ts` permits a run granted the canonical `agent` command to dispatch another agent without carrying parent-run policy, and `src/commands/agent.ts` resolves the child's requested skills and grants independently from the parent's snapshot. Severity: 8/10

Existing Risk: 8/10 - A task with only the `agent` grant can launch a child that selects another installed or project skill and gains commands such as `question` that the parent was never authorized to use.

Proposal Risk: 3/10 - Propagating trusted parent identity and immutable policy through invocation context, then checking child skill source/name/instruction equality and intersecting grants, prevents nested runs from widening the authority tree; filesystem and provider tools remain governed by the existing run policy.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "cap nested agent skills and command grants". Extend the server-owned invocation context in `src/commands/types.ts` and `src/command/manager.ts` with parent run identity, and have `src/agent/command-tools.ts` propagate it only through canonical nested dispatch. In `src/commands/agent.ts`, resolve each child skill and compare its source category, name, and captured instruction contents with the parent's immutable snapshot before prompting; reject unmatched skills and intersect the child's sidecar grants with the parent's effective grants. Track child ownership in `src/agent/run.ts` and `src/agent/manager.ts` so parent termination aborts and awaits its children. Update `product/specs/agent-command.md` and add tests in `src/agent/command-tools.test.ts`, `src/commands/agent.test.ts`, and `src/agent/manager.test.ts` proving an agent grant cannot add a skill or command, matching skills cannot broaden grants, and parent termination cleans up child runs; these nested-policy paths currently have no coverage.
