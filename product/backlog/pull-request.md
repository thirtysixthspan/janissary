<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Update the agent-command spec's stale claim that an agent requests a command on its final reply line.

Existing Issue: product/specs/agent-command.md still states that the agent requests a Janissary command on its final nonempty reply line as `janissary <command>`, immediately above the paragraph this pull request rewrote to say the command comes from a labelled fenced block. Severity: 6/10

Existing Risk: 6/10 - The behaviour spec contradicts itself, so a reader implementing or checking the agent path can follow the stale sentence and reintroduce the bare-line rule this pull request is removing.

Proposal Risk: 2/10 - The spec line becomes consistent with the code and the paragraph below it; the only residual risk is a wording mismatch with the primer, which a direct comparison against src/agent/command-tools.ts resolves.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2127 "update the agent-command spec's stale bare-final-line claim". Replace that sentence with a statement that the agent puts exactly one command in a final fenced block whose info string is exactly `janissary`, that prose may follow the block and no `janissary` prefix is required inside it, matching the rewritten agent primer in src/agent/command-tools.ts and the block-rule paragraph already in the same spec. Leave the rest of the paragraph about question grants, denials, and subagent refusals intact. No code change is needed: the agent-path extractor in src/acp/command-block.ts and its tests already implement this rule, so keep them passing untouched.


* Make the labelled-block extractor use the last closed block when a later labelled block is left unclosed.

Existing Issue: Candidate selection in src/acp/command-block.ts overwrites the candidate at every labelled opening fence, so a valid closed labelled block followed by an unclosed one reports a zero-command mistake instead of running the earlier closed block, although the plan says the host reads only the last closed block and an unclosed block is not a candidate. Severity: 4/10

Existing Risk: 4/10 - A reply whose final labelled block is truncated or left open makes the loop ask for a correction instead of running the valid command it already emitted, so a recoverable reply is treated as malformed.

Proposal Risk: 2/10 - Selecting confirmed closed blocks preserves the correction behavior for replies with no closed block; the added state is one flag and the existing extractor tests pin every other branch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2127 "make the labelled-block extractor use the last closed block when a later block is unclosed". In findCandidate in src/acp/command-block.ts, keep the candidate only for labelled fences that actually close: record the block when its closing fence is found rather than replacing the candidate at every opening, and track separately whether a labelled fence remains open at the end of the reply. In extractCommandBlock, return mistake with zero commands only when an unclosed labelled fence exists and no closed candidate was found; otherwise return the result for the last closed candidate. Add a case to src/acp/command-block.test.ts with a valid closed block followed by an unclosed labelled block, expecting kind 'one' with the first block's command and span, and keep the existing unclosed-block-alone case expecting mistake with zero commands. Leave the loop's three-variant handling in src/acp/loop.ts and the span-based display removal untouched.
