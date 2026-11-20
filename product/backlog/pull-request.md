<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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
