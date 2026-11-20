<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's preserved leading-slash agent command behavior instead of gutting the test that covered it

Existing Issue: The agent test named for stripping a leading slash now feeds a labelled block whose content has no leading slash, and the shared extractor does not recognize a leading-slash command inside a block, so that previously supported behavior is neither exercised nor delivered. Severity: 5/10

Existing Risk: 4/10 - An agent that writes `/file read a.md` inside a labelled block, which the retired extractor accepted and the gate still normalizes, now gets a correction prompt instead of a workspace read.

Proposal Risk: 2/10 - Normalizing one leading slash before the command-start check is localized and the gate already strips it, so the surrounding agent gating and frame assertions stay unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2127 "preserve leading-slash agent commands in labelled blocks". In src/remote/serve-acp-loop.test.ts restore the "strips a leading slash from an agent file read before reading the workspace" fixture to a labelled block whose content is `/file read a.md`, keeping its frame and step-count assertions unchanged. In src/acp/command-block.ts strip one leading `/` from a candidate line before the nativeCommandName check in isCommandStart so a leading-slash command inside a labelled block is recognized as one command, leaving the returned command text unchanged so gateAgentCommand continues to normalize it. Verify the agent run reports a workspace step with command `file read a.md` and that src/acp/command-block.test.ts, src/acp/tool-table.test.ts, and the rest of src/remote/serve-acp-loop.test.ts keep passing; the core path and allowQuestion behavior must not move.


* Update the tool-table resolution comment that still describes bare last-line extraction

Existing Issue: The comment above createAcpToolTable says extraction takes "the reply's last line that any tool recognizes", but after this diff extraction reads the command from the last closed labelled block, so the comment documents the bare-line contract this change removed. Severity: 2/10

Existing Risk: 3/10 - A future reader or change trusts the comment, keeps feeding bare command lines, and silently reintroduces the behavior the labelled-block protocol replaced.

Proposal Risk: 1/10 - A comment-only edit cannot change behavior, and the extraction assertions in src/acp/tool-table.test.ts and src/acp/command-block.test.ts pin the real contract.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2127 "correct the tool-table comment that still describes bare last-line extraction". Rewrite the extraction sentence in the resolution comment above createAcpToolTable in src/acp/tool-table.ts to state that the extractor reads the command inside the last closed labelled block and that extraction remains independent of table order, leaving the first-match running rule and the rest of the comment intact. No behavior changes; the existing extraction and gating tests must keep passing untouched.
