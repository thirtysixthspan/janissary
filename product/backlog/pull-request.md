<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Resolve and borrow an explicitly named local workspace for an agent run.

Existing Issue: The launch grammar accepts `in workspace <label>`, but `src/commands/agent.ts` only uses that value to select a remote tab/workspace; local execution in `src/agent/workspace-execution.ts` borrows the caller's current directory only when it is already tracked and otherwise creates a fresh workspace. A local caller therefore cannot select another existing tracked workspace by label. Severity: 6/10

Existing Risk: 5/10 - Users can request an existing local workspace and still get a fresh clone or a remote-workspace error, so the task may run against different files and state than the selector names.

Proposal Risk: 2/10 - Resolving the named workspace through the workspace manager and retaining a run-owned reference makes local selection explicit while preserving the default fresh-workspace behavior and shared users' leases.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "support explicitly named local workspaces for agent runs". Update `src/commands/agent.ts` and `src/agent/workspace-execution.ts` so a local `in workspace <label>` resolves the named existing tracked workspace instead of being interpreted only as a remote tab label or ignored in favor of a fresh workspace. Acquire and release exactly one run-owned workspace reference through `WorkspaceManager`, reject a missing or untracked selection before starting ACP, and preserve the caller's captured context for Janissary command dispatch. Keep the default fresh workspace and the remote-host/workspace resolution paths unchanged. Add coverage in `src/commands/agent.test.ts`, `src/agent/execute.test.ts`, and workspace manager tests for successful named local borrowing, unknown/untracked labels, preservation of other holders' references, and cleanup on completion, failure, and termination. Update `product/specs/agent-command.md` and the agent command user guide to distinguish a named local workspace from a remote execution target.
