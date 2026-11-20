<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Update the agent user documentation that still teaches a bare final command line and treats fenced commands as examples

Existing Issue: The user-facing `agent` page still says a command is requested by ending a reply with `janissary <command>` and that a command-looking line inside a Markdown code fence is an example rather than a request, while the shipped extractor now runs the command from a closed `janissary` fenced block and treats a bare final line as the final answer. Severity: 6/10

Existing Risk: 5/10 - A user following the documentation writes a bare final line that is silently treated as the final answer with no command run, or puts a real command in a fenced block believing it is ignored; the fix plan's claim that no user-facing page documents the old rule also hides this gap from later reviewers.

Proposal Risk: 1/10 - The page would then agree with the primers, the two behaviour specs, and the extractor; the only residual risk is keeping the wording aligned with any later change to the label or block rule.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2127 "update the agent user documentation to the labelled command block rule". In documentation/user-documentation/advanced-agents/agent-command.md, rewrite the sentence just after the skill-grant example that says the agent asks to run one by ending a reply with `janissary <command>` to say it puts exactly one command in a final fenced block whose info string is exactly `janissary`, that prose may follow the block, and that no `janissary` prefix is required inside it. Rewrite the later run-results sentence beginning "The agent can request a granted command on the final nonempty reply line as `janissary <command>`" the same way. Replace the sentence stating that a final command-looking line inside a backtick or tilde Markdown fence is treated as an example with one stating that an unlabelled fence, or a fence with any other info string, is an example, while a closed `janissary` block is a real request; add that a later labelled block left unclosed does not suppress an earlier closed one, and that an unclosed labelled block asks for a correction only when no closed block exists. Keep every other paragraph, image, and link untouched. Verify by reading the page beside product/specs/agent-command.md and src/agent/command-tools.ts so the three descriptions agree; no code changes and no test updates are needed for documentation text.


* Correct the claim that an echoed command leaves no stray copy in the displayed reply

Existing Issue: The pull request description, both behaviour specs, and the plan's design decision say the matched block is removed so a command echoed twice leaves no stray copy and the transcript entry is the only remaining copy, but the loop removes only the single matched block span and its test explicitly expects an earlier duplicate block to remain displayed. Severity: 3/10

Existing Risk: 3/10 - A reader relying on the stated contract expects duplicate blocks to be suppressed and is surprised when an earlier copy stays visible; a future implementer may try to remove all copies and break the span-based removal that deliberately keeps unrelated prose.

Proposal Risk: 1/10 - The wording would describe the actual span-based behaviour with no change to extraction or display logic; the residual risk is only that the phrasing becomes over-specific about duplicate blocks.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2127 "correct the no-stray-copy claim about duplicate command blocks". Reconcile the claim with the behaviour pinned by the "removes only the final block when a command is echoed twice" case in src/acp/loop.test.ts: filterCommandFromDisplay in src/acp/loop.ts removes exactly the block span returned by extractCommandBlock in src/acp/command-block.ts, so an earlier identical block, or a command repeated in prose outside the block, stays in the displayed reply. Rewrite the "only copy left is the tool-transcript entry" sentence in the pull request description's "What" section and the "a command echoed twice leaves no stray copy" clauses in product/specs/acp.md and product/specs/agent-command.md to say the matched labelled block is removed while prose outside it is kept. Do not change filterCommandFromDisplay, add duplicate-block removal, or touch the extraction tests; the single-block display cases in src/acp/loop.test.ts must keep passing unchanged.
