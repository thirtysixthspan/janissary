<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the ACP spec's claim that an unclosed labelled block always produces the correction sentence.

Existing Issue: product/specs/acp.md states unconditionally that "an unclosed labelled block counts as zero commands and produces the correction sentence", but extractCommandBlock returns the last closed labelled block when one exists, so a reply with a closed block followed by an unclosed one runs the command and sends no correction. Severity: 3/10

Existing Risk: 4/10 - A contributor following the ACP spec reintroduces the bug where a trailing unclosed block suppresses an earlier closed block, regressing the last-closed-wins behavior and silently dropping a command the agent already emitted.

Proposal Risk: 2/10 - The change is one spec sentence aligned with a qualifier already present in a sibling spec and a passing test; the only residual risk is a wording mismatch that review catches.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2127 "correct the ACP spec's unclosed-labelled-block claim". In product/specs/acp.md, in the tool-table paragraph that begins "The tools are declared once in src/acp/tool-table.ts", rewrite the clause "an unclosed labelled block counts as zero commands and produces the correction sentence" so it matches the qualifier already present in product/specs/agent-command.md — that an unclosed labelled block counts as zero commands and asks for a correction only when no closed labelled block exists, and that a later labelled block left unclosed does not suppress the last closed block. The behavior is pinned by extractCommandBlock in src/acp/command-block.ts (it returns the last closed candidate when one exists) and by the "runs the last closed labelled block when a later labelled block is left unclosed" case in src/acp/command-block.test.ts. Change no code or tests and leave the rest of the paragraph byte-for-byte intact.
