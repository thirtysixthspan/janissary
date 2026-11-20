<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the claim that an echoed command leaves no stray copy in the displayed reply

Existing Issue: The pull request description, both behaviour specs, and the plan's design decision say the matched block is removed so a command echoed twice leaves no stray copy and the transcript entry is the only remaining copy, but the loop removes only the single matched block span and its test explicitly expects an earlier duplicate block to remain displayed. Severity: 3/10

Existing Risk: 3/10 - A reader relying on the stated contract expects duplicate blocks to be suppressed and is surprised when an earlier copy stays visible; a future implementer may try to remove all copies and break the span-based removal that deliberately keeps unrelated prose.

Proposal Risk: 1/10 - The wording would describe the actual span-based behaviour with no change to extraction or display logic; the residual risk is only that the phrasing becomes over-specific about duplicate blocks.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2127 "correct the no-stray-copy claim about duplicate command blocks". Reconcile the claim with the behaviour pinned by the "removes only the final block when a command is echoed twice" case in src/acp/loop.test.ts: filterCommandFromDisplay in src/acp/loop.ts removes exactly the block span returned by extractCommandBlock in src/acp/command-block.ts, so an earlier identical block, or a command repeated in prose outside the block, stays in the displayed reply. Rewrite the "only copy left is the tool-transcript entry" sentence in the pull request description's "What" section and the "a command echoed twice leaves no stray copy" clauses in product/specs/acp.md and product/specs/agent-command.md to say the matched labelled block is removed while prose outside it is kept. Do not change filterCommandFromDisplay, add duplicate-block removal, or touch the extraction tests; the single-block display cases in src/acp/loop.test.ts must keep passing unchanged.
