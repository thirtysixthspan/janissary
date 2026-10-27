<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep PR verification text from prompting execution of unreviewed branch code.

Existing Issue: The PR body's Setup section tells reviewers to run `node bin/janus.mjs --no-open <scratch-project-dir>` from the reviewed branch and drive that instance, making review text an instruction to execute untrusted PR code. Severity: 5/10

Existing Risk: 6/10 - A reviewer who follows the instruction can execute branch-controlled code with the account that owns the checkout before assessing the change.

Proposal Risk: 2/10 - Removing the imperative launch request means the PR body alone no longer prompts branch-code execution, while reviewers retain control over any later isolated manual verification.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "remove the PR body's branch-execution instruction". Revise the PR body's Setup and How to verify sections to state the expected observations without directing reviewers to launch the executable from the reviewed checkout. Keep the feature behavior assertions as descriptive expectations and leave source code unchanged. Verify the updated description with `gh pr view` and confirm it no longer asks reviewers to run this branch's application.
