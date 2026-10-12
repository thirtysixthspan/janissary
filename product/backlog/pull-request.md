<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Restrict nested agent runs to their parent's selected skills and effective command grants.

Existing Issue: `src/agent/command-tools.ts` permits a run granted the canonical `agent` command to dispatch another agent without carrying parent-run policy, and `src/commands/agent.ts` resolves the child's requested skills and grants independently from the parent's snapshot. Severity: 8/10

Existing Risk: 8/10 - A task with only the `agent` grant can launch a child that selects another installed or project skill and gains commands such as `question` that the parent was never authorized to use.

Proposal Risk: 3/10 - Propagating trusted parent identity and immutable policy through invocation context, then checking child skill source/name/instruction equality and intersecting grants, prevents nested runs from widening the authority tree; filesystem and provider tools remain governed by the existing run policy.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "cap nested agent skills and command grants". Extend the server-owned invocation context in `src/commands/types.ts` and `src/command/manager.ts` with parent run identity, and have `src/agent/command-tools.ts` propagate it only through canonical nested dispatch. In `src/commands/agent.ts`, resolve each child skill and compare its source category, name, and captured instruction contents with the parent's immutable snapshot before prompting; reject unmatched skills and intersect the child's sidecar grants with the parent's effective grants. Track child ownership in `src/agent/run.ts` and `src/agent/manager.ts` so parent termination aborts and awaits its children. Update `product/specs/agent-command.md` and add tests in `src/agent/command-tools.test.ts`, `src/commands/agent.test.ts`, and `src/agent/manager.test.ts` proving an agent grant cannot add a skill or command, matching skills cannot broaden grants, and parent termination cleans up child runs; these nested-policy paths currently have no coverage.


* Apply and validate the requested monitoring group instead of silently ignoring `in group`.

Existing Issue: `parseAgentCommand` returns the requested group, but `src/commands/agent.ts` never reads it, so headed runs open in the caller's group and headless runs accept nonexistent group selectors without error. Severity: 6/10

Existing Risk: 5/10 - Runs can appear in the wrong tab group and misspelled or stale selectors silently start work instead of reporting the invalid launch.

Proposal Risk: 2/10 - Resolving a supplied selector before run creation and assigning valid selections to the monitor makes group placement predictable while headless launches remain headless.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "honor and validate agent group selectors". In `src/commands/agent.ts`, validate `launch.group` against the existing tab groups before creating a run, including for headless launches, and return the approved invalid-group error without starting ACP when it does not resolve. For `in a tab`, pass the resolved group to the monitor-tab opening path so its new tab lands in that group; when no group is supplied, retain the caller-group default. Extend `src/commands/agent.test.ts` and the relevant tab-opening tests to cover named and numeric group resolution, invalid group rejection for both headed and headless runs, and caller-group defaulting. No current agent-command test checks that the parsed group affects launch behavior.


* Allow confined runs to read support files belonging to selected installed skills.

Existing Issue: `src/agent/execute.ts` starts ACP with the workspace directory but does not pass selected installed-skill directories, and `AcpOptions` has no such field even though `sandboxSpawn` supports `installedSkillDirs`. Severity: 5/10

Existing Risk: 5/10 - When workspace confinement is active, an installed skill that references a companion file cannot read that file and may fail or follow incomplete instructions despite being selected.

Proposal Risk: 2/10 - Passing only canonical selected installed-skill directories through the existing sandbox read parameters restores the promised support-file access without exposing the installation's other contents.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "confine reads to selected installed skill support files". Extend `AcpOptions` in `src/acp/types.ts` and the `connectAcp` call in `src/agent/execute.ts` to carry only the selected skills whose resolved paths are under the installed skills root. Forward those directories to `sandboxSpawn`'s existing `installedSkillDirs` option in `src/acp/index.ts`; preserve the existing literal/real-path containment checks and secret-deny ordering in `src/sandbox/index.ts` and `src/sandbox/install-reads.ts`. Add focused tests in `src/acp/index.test.ts` and `src/sandbox/index.test.ts` proving selected installed skill support paths are readable while unselected skills and unrelated installation paths remain denied. No current test covers this autonomous-session integration.


* Close only tabs newly created by an agent run when its owned resources are cleaned up.

Existing Issue: Granted commands execute with invocation context, but tab-opening paths do not record run ownership and `AgentRun.cleanup()` has no created-tab release step, so tabs opened by an agent remain after the run ends. Severity: 6/10

Existing Risk: 5/10 - Completed or terminated runs can leave tabs and their associated processes or references behind, while later cleanup has no reliable way to distinguish those allocations from tabs that existed before the run.

Proposal Risk: 2/10 - Explicitly tracking only new allocations on the owning run lets cleanup release its own tabs without adopting focused or pre-existing tabs.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "track and release tabs created by agent commands". Carry the trusted run identity from `CommandInvocationContext` through the command dispatch and tab-allocation entry points used by granted commands, including open, edit, and plugin/deferred allocation paths. In `src/agent/run.ts` and `src/agent/manager.ts`, record identities only when a new tab or resource is allocated under that run, then close and await releases for those identities during cleanup; focusing or updating an existing tab must never transfer ownership. Add tests in the affected command/allocation suites and `src/agent/manager.test.ts` proving newly created tabs are closed after completion, failure, and termination, while existing or focused tabs remain open and their resources remain usable. The current run cleanup tests do not exercise command-created tabs.


* Remove executable verification directions from the completed local-execution and monitoring plans.

Existing Issue: `product/plans/complete/agent-canonical-local-execution.md` and `product/plans/complete/agent-monitoring-plugin.md` still tell readers to run `./scripts/run.mjs check-diff`, making branch-supplied tooling an operational instruction in reviewed content. Severity: 5/10

Existing Risk: 6/10 - A reviewer or later agent following either completed plan may execute branch-provided verification scripts, despite those plans being untrusted review material.

Proposal Risk: 2/10 - Replacing the imperative commands with descriptive coverage records removes the execution prompt while preserving the plans' test expectations.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove executable verification directions from the local execution and monitoring plans". In `product/plans/complete/agent-canonical-local-execution.md` and `product/plans/complete/agent-monitoring-plugin.md`, replace the `check-diff` instructions in their Tests sections with factual descriptions of the coverage present or expected, without claiming a verification run unless the branch records evidence for it. Review both full plans for any additional direct tool-execution instructions and keep their implementation scope and test cases intact. Verify by reading the plans and focused diff only; no application behavior or automated tests are involved.


* Deliver the planned sandbox-disabled notice for local and remote agent runs.

Existing Issue: Agent execution starts ACP with workspace confinement parameters but never reports when `sandboxWorkspaces` is disabled or confinement is unavailable, despite the feature plan requiring `Agent: sandboxing is disabled.` in the notifications feed for headed and headless runs. Severity: 6/10

Existing Risk: 6/10 - A run can execute without OS confinement while the caller receives no agent-specific indication, making it easy to mistake command-grant restrictions for filesystem isolation.

Proposal Risk: 2/10 - Reporting the actual execution host's confinement state before the task starts makes the limitation visible while leaving the existing command grants and execution behavior intact.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "report when agent execution is not sandboxed". In `src/agent/execute.ts`, determine whether the local ACP process will be confined using the same configuration and availability conditions as `sandboxSpawn` in `src/sandbox/index.ts`, and emit the exact `Agent: sandboxing is disabled.` line to the notifications feed only, for both headed and headless runs. For remote runs, have the remote ACP readiness response from `src/remote/serve-acp.ts` report its confinement state and let `src/remote/acp-session.ts` deliver the same notice locally; do not infer the remote host's state from the local machine. Keep the notice out of caller output and monitor activity. Add focused tests for enabled, disabled, and unavailable confinement on both execution hosts, asserting one notifications-feed entry and no transcript or monitor duplicate; no current agent execution test covers this notice.


* Wait for remote ACP process teardown before acknowledging agent resource release.

Existing Issue: `RemoteAcp.close` in `src/remote/serve-acp.ts` calls the synchronous `AcpSession.kill()` and immediately replies with `released: true`, while `connectAcp` in `src/acp/index.ts` only signals the child and does not await its exit. The local run therefore treats a kill request as confirmed resource cleanup. Severity: 7/10

Existing Risk: 7/10 - The structured result can settle while the remote ACP process or its descendants are still terminating, and a subsequent workspace shutdown may race resources the close acknowledgment claimed were already released.

Proposal Risk: 3/10 - A bounded wait for observed process exit before a positive acknowledgment, with a negative acknowledgment on timeout, makes successful cleanup meaningful while still allowing the local run to report uncertainty.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "await remote ACP process teardown before acknowledging release". Extend the ACP session lifecycle in `src/acp/types.ts` and `src/acp/index.ts` with an awaitable close operation that resolves when the child process exits, and have `RemoteAcp.close` in `src/remote/serve-acp.ts` await it before sending `acp-closed` with `released: true`; send a negative acknowledgment when bounded teardown cannot be confirmed. Preserve idempotent close behavior and ensure remote shutdown does not remove the workspace before owned ACP children have exited. Update `src/remote/serve-acp.test.ts` and `src/remote/acp-session.test.ts` to assert that the acknowledgment follows process exit, timeout produces the existing cleanup warning path, and concurrent close requests do not double-release resources. No current remote cleanup test proves that a positive acknowledgment follows actual child exit.


* Deliver the plan's remote execution host and workspace metadata in the agent monitor instead of the local caller's details.

Existing Issue: `AgentRunManager.create` in `src/agent/manager.ts` always records `host: 'Local'` and `workspace: options.caller.cwd`, while `src/commands/agent.ts` creates remote runs without passing their resolved remote host or workspace. Severity: 5/10

Existing Risk: 5/10 - A monitor for a remote run presents the local machine and caller directory as its execution location, misleading users about which host and files the agent can access.

Proposal Risk: 2/10 - Supplying the resolved execution host and workspace when constructing the run makes the displayed location accurate, while remote execution and its cleanup behavior remain unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "show the actual remote execution location in agent monitors". Extend `AgentRunOptions` and the run metadata construction in `src/agent/run.ts` and `src/agent/manager.ts` to accept the execution host and workspace explicitly. In `src/commands/agent.ts`, pass `remoteAddress.host` and `remoteWorkspace` for remote runs, and the caller's local execution directory for local runs. Keep those values in the server-owned `AgentRunView` projection consumed by `web/src/plugins/agent-monitor/view.tsx`. Add command/run-view coverage in `src/commands/agent.test.ts` asserting that a remote host and remote workspace are shown for a remote run and local details remain shown for local runs; the existing `web/src/plugins/agent-monitor/view.test.tsx` covers rendering the supplied metadata but does not test which execution location the server supplies.


* Remove the security issue in the completed plan's instructions to run checks, publish changes, and edit the pull request body.

Existing Issue: `product/plans/complete/correct-agent-command-pull-request-description.md` directs readers to run verification commands, commit and push, and edit the pull request body, despite being a completed plan supplied as reviewed content. Severity: 7/10

Existing Risk: 7/10 - A reviewer or later agent following the plan can execute branch-controlled tooling and mutate or publish the pull request during review without authorization.

Proposal Risk: 2/10 - Replacing these directives with a factual record of the completed description correction removes the operational prompt while leaving the review task's own backlog-only output boundary clear.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove operational directives from the completed PR-description plan". In `product/plans/complete/correct-agent-command-pull-request-description.md`, replace the implementation-step instruction to run checks, commit, push, and change the PR body with a factual summary of the correction already completed. Review the rest of that plan for any other commands or mutation instructions addressed to a future reader, while preserving its stated goal, evidence, and scope. Read the completed plan back to verify it contains no operational directives; no application tests cover this documentation-only change.
