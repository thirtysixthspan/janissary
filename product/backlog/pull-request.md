<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request title so it describes the delivered feature rather than the plan-decomposition commit.

Existing Issue: The pull request is titled "docs: decompose ACP multi-tool-call plan into subplans", which describes only the branch's first planning commit, while the aggregate change implements the multi-command batch feature and removes the subplans. Severity: 3/10

Existing Risk: 3/10 - A reviewer triaging by title will treat a server-side feature with production code as a documentation-only plan refactor and judge it against the wrong expectations.

Proposal Risk: 1/10 - Changing only the title carries no code risk, and the description body already describes the feature accurately.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2137 "correct the pull request title to describe the ACP batch feature". Rename the pull request title to a conventional-commit title that reflects the delivered behavior, for example `feat(acp): run multiple command blocks in one reply in parallel`, so it matches the description body and the production diff; do not change the description body, any source file, or any other metadata. Verify by reading the new title against the changed files and commit subjects.
