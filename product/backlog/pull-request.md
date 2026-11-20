<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* Correct the agent-command spec's claim that an unowned command corrects the whole reply, which agent runs do not do.

Existing Issue: The rewritten local-task-execution paragraph in product/specs/agent-command.md says a block whose command no granted tool owns makes the whole reply a correctable mistake that runs nothing, but agent runs extract with the raw extractCommandBlock in src/acp/drive-loop.ts and answer such commands individually with `Agent: command not permitted: <command>.` through gateCommand and runGrantedAgentCommand while the other commands in the batch still run. Severity: 4/10

Existing Risk: 3/10 - A contributor or test author relying on the spec expects the whole reply to be corrected with no command run, while the loop actually runs the rest of the batch and returns a per-command refusal, so tests and consumers built from the spec assert behavior the code does not have.

Proposal Risk: 1/10 - Rewriting the sentence to scope whole-reply ownership correction to core sessions and describe the agent-run per-command refusal makes the spec agree with the code and with its own earlier grant-refusal paragraph, with no runtime behavior or test changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2137 "correct the agent-command spec's unowned-command claim for agent runs". In product/specs/agent-command.md, revise the sentence in the rewritten extraction paragraph that lists a block whose command no granted tool owns among the bad blocks that correct the whole reply and run nothing. State that for agent runs a recognized but ungranted command such as `tab`, `subagent`, or `file glob` is extracted as an ordinary batch command and refused on its own with `Agent: command not permitted: <command>.` by gateAgentCommand in src/acp/tool-table.ts and runGrantedAgentCommand in src/agent/command-tools.ts, with the remaining commands in the batch continuing to run; whole-reply correction for an unowned command applies only to core sessions, where toolExtractor in src/acp/tool-table.ts checks granted-tool ownership and returns a mistake. Keep the unclosed, empty, and multiple-command cases described as whole-reply mistakes — those come from extractCommandBlock in src/acp/command-block.ts and apply to both snapshot kinds. Verify the paragraph against the agent-run wiring in src/agent/execute.ts, the snapshot-dependent extractor in src/acp/drive-loop.ts, and the grant-refusal sentences earlier in the same spec; no test edits are needed because no behavior changes.
