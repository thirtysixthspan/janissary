<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the specs' claim that a fresh-mode run-creation refusal settles a failed durable record.

Existing Issue: Both updated specs group a run-creation refusal with the failures that "settle the record failed with the original error and no fabricated prompt", but a rejected manager.create throws before any run or durable record exists, so no record is settled in that case. Severity: 3/10

Existing Risk: 4/10 - A later launcher built from this contract may expect a Failed durable record after a creation refusal and produce a missing or dangling receipt when no record was ever created.

Proposal Risk: 1/10 - This is a prose-only change that makes the spec match the existing code path; the only residual risk is a future edit reintroducing the claim, which a spec review would catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "correct the specs' claim that a run-creation refusal settles a failed record". In product/specs/agent-command.md and product/specs/subagent.md, separate the run-creation-refusal clause from the list of failures that settle a Failed record: state that a refused manager.create is propagated as a failed launch result with no clone and no durable record created (the run and its record are never published), while reserving "settle the record failed with the original error and no fabricated prompt" for the failures that occur after the run exists — synchronous workspace refusal, a thrown create/preflight error, and an asynchronous clone rejection. Verify against the fresh branch of startLocalAgentRun in src/agent/workspace-execution.ts, where createLocalAgentRun throws and the inert handle is cancelled before any run exists, and against finishRunAfterError in src/agent/launch.ts, which returns agentFailure with an undefined run and settles no record.
