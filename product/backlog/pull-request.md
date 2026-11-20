<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Update the tool-table resolution comment that still describes bare last-line extraction

Existing Issue: The comment above createAcpToolTable says extraction takes "the reply's last line that any tool recognizes", but after this diff extraction reads the command from the last closed labelled block, so the comment documents the bare-line contract this change removed. Severity: 2/10

Existing Risk: 3/10 - A future reader or change trusts the comment, keeps feeding bare command lines, and silently reintroduces the behavior the labelled-block protocol replaced.

Proposal Risk: 1/10 - A comment-only edit cannot change behavior, and the extraction assertions in src/acp/tool-table.test.ts and src/acp/command-block.test.ts pin the real contract.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2127 "correct the tool-table comment that still describes bare last-line extraction". Rewrite the extraction sentence in the resolution comment above createAcpToolTable in src/acp/tool-table.ts to state that the extractor reads the command inside the last closed labelled block and that extraction remains independent of table order, leaving the first-match running rule and the rest of the comment intact. No behavior changes; the existing extraction and gating tests must keep passing untouched.
