<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle over-budget refusals that are discarded when the agent answers before a batch's follow-up queue drains.

Existing Issue: When a batch straddles the step cap, the loop queues a refusal for each over-budget command but a final answer to the first delivered follow-up calls finish, which clears the queue, so those refusals are never sent and the run ends as answered instead of capped. Severity: 7/10

Existing Risk: 6/10 - The agent never learns why its extra commands were skipped and may reissue them in a new prompt, while remote callers and telemetry receive an answered end reason for a run that actually hit the cap.

Proposal Risk: 3/10 - Draining the queue before terminating keeps the abort path intact but adds a termination condition a later edit could break, so the colocated loop tests must pin both the capped reason and the final-answer path.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2137 "deliver over-budget refusals even when the agent answers before the follow-up queue drains". In src/acp/loop.ts, track when a launched batch produced over-budget refusals and make the terminal transition wait until the result queue is empty before calling h.finished with the capped reason, without discarding still-pending follow-ups when a reply with no command arrives; keep finish idempotent and preserve the abort early-out and the answered path for a reply with no commands and no pending work. Add a colocated test in src/acp/loop.test.ts with a scripted session whose second reply is a final answer rather than the repeated batch the current over-budget test relies on, and assert that every over-budget command gets exactly one `ACP: step limit reached; command not run.` follow-up and that the last event is finished with the capped reason. Keep the existing over-budget, correction, and abort tests passing, and check the acp-run-end reason expectations in src/remote/serve-acp-loop.test.ts.


* Bring the agent-command functional spec in line with batch execution so it no longer documents single-command extraction and the old correction sentence.

Existing Issue: product/specs/agent-command.md still states that a run's command comes from the last closed labelled block, that zero or more than one command in a block draws the old "exactly one command inside a final fenced block" correction, and that a later unclosed block does not suppress the last closed one, all of which the delivered loop now does the opposite of. Severity: 6/10

Existing Risk: 6/10 - An agent or reader using that spec as the contract for agent runs will expect one command per reply and the old correction wording, and will misread parallel batches and whole-reply correction as regressions.

Proposal Risk: 2/10 - This is prose only with no behavior change; the residual risk is quoted strings drifting from the code, which a direct comparison against commandProtocolPrimer and CORRECTION_PROMPT catches.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2137 "update the agent-command spec to describe parallel command batches". Rewrite the local-task-execution paragraphs of product/specs/agent-command.md that describe labelled-block extraction to match the behavior in src/acp/loop.ts and src/acp/command-block.ts: every closed `janissary` block in a reply forms a batch whose commands run in parallel, each finished command gets its own `Output of` follow-up and tool entry, each command spends one step against maxToolTurns, an unclosed labelled block or any empty, multiple-command, or unowned block corrects the whole reply with the new sentence from CORRECTION_PROMPT, and a reply with no block is the final answer. Keep the quoted primer and correction text character-for-character identical to commandProtocolPrimer and CORRECTION_PROMPT, leave the scope-limited product/specs/acp.md untouched, and make no source changes. No colocated test covers these prose claims, so verify by comparing the strings directly with the code.


* Deliver over-budget refusals after the results of commands that ran, as the description's example shows, rather than ahead of them.

Existing Issue: In src/acp/loop.ts launchBatch pushes refusals for over-budget commands into the result queue at launch time while results of commands that actually run are queued only when their promises settle, so with asynchronous commands the refusal follow-ups are delivered before results that finished earlier. Severity: 4/10

Existing Risk: 5/10 - The agent reads that its commands were skipped before it sees the outputs it requested, contradicting the documented completion-order follow-ups and the over-budget behavior example, so it can act on an incomplete result set.

Proposal Risk: 2/10 - Enqueuing refusals through the same serialized pump keeps one delivery path; the main risk is a small ordering regression that a colocated asynchronous test catches.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2137 "enqueue over-budget refusals in completion order after executed-command results". In src/acp/loop.ts change launchBatch so an over-budget command is recorded as a pending refusal and enters the result queue through the same completion-order path as executed commands, for example once in-flight commands have settled, while keeping the exact `ACP: step limit reached; command not run.` text and the `Output of` follow-up block unchanged. Add a colocated test in src/acp/loop.test.ts using Promise.withResolvers where an in-budget command resolves before delivery, asserting the sent follow-ups place that result before the refusal; keep the existing over-budget, parallel-completion, and cap tests passing.


* Update the tool-table comment that still says extraction reads only the last closed labelled block.

Existing Issue: The resolution-strategy comment above createAcpToolTable in src/acp/tool-table.ts still says the extractor reads the command inside the last closed labelled block in the reply, while toolExtractor now collects every closed labelled block and gateCommand applies ownership to each one. Severity: 3/10

Existing Risk: 3/10 - A reader of src/acp/tool-table.ts will form the wrong mental model of extraction and may reintroduce last-block-only logic when changing ownership or gating.

Proposal Risk: 1/10 - This is a comment-only change with no behavior impact; the only risk is wording that still drifts from the code.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2137 "correct the stale extraction comment in the tool table". In src/acp/tool-table.ts rewrite the createAcpToolTable resolution-strategy comment so its extraction sentence states that every closed `janissary` block in a reply is collected in appearance order as one batch, each command is checked for granted-tool ownership, and any unowned block corrects the whole reply; leave the first-match gating explanation intact. No test covers comments, so verify by reading the comment against toolExtractor and extractCommandBlock, and make no behavior changes.


* Correct the pull request title so it describes the delivered feature rather than the plan-decomposition commit.

Existing Issue: The pull request is titled "docs: decompose ACP multi-tool-call plan into subplans", which describes only the branch's first planning commit, while the aggregate change implements the multi-command batch feature and removes the subplans. Severity: 3/10

Existing Risk: 3/10 - A reviewer triaging by title will treat a server-side feature with production code as a documentation-only plan refactor and judge it against the wrong expectations.

Proposal Risk: 1/10 - Changing only the title carries no code risk, and the description body already describes the feature accurately.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2137 "correct the pull request title to describe the ACP batch feature". Rename the pull request title to a conventional-commit title that reflects the delivered behavior, for example `feat(acp): run multiple command blocks in one reply in parallel`, so it matches the description body and the production diff; do not change the description body, any source file, or any other metadata. Verify by reading the new title against the changed files and commit subjects.
