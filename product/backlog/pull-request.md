<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's accurate database command signatures.

Existing Issue: `help/db.md` tells users to run `db list`, `db create`, and related forms, but the parser requires `db sqlite ...`, so every listed form returns a usage error. Severity: 8/10

Existing Risk: 6/10 - Users following any database example cannot perform the documented action and may mistake the command for broken.

Proposal Risk: 2/10 - Listing the required engine token removes the mismatch while leaving database behavior unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "correct database help command signatures". Update the Usage and Examples blocks in `help/db.md` to use `db sqlite list`, `db sqlite create <name>`, `db sqlite delete <name>`, and `db sqlite query <name> <sql>`. Compare each form with `product/specs/database.md` and `src/database/parsing.ts`; preserve the page's existing layout and keep runtime behavior unchanged. Existing database command and query behavior is covered by `src/commands/db.test.ts` and `src/database/query.test.ts`; no test should be weakened or needed solely to pin wording.


* Show the complete SSH invocation in the command help page.

Existing Issue: `help/ssh.md` lists only `ssh <address>`, omitting the SSH options and remote command arguments accepted after the destination and documented by `product/specs/ssh-tab.md`. Severity: 5/10

Existing Risk: 5/10 - Users who need a port, identity file, jump host, or remote command may incorrectly conclude that the SSH command cannot express those connection forms.

Proposal Risk: 2/10 - Showing the pass-through argument form and valid examples makes existing SSH capabilities discoverable without changing the command.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "show SSH options in command help". Update `help/ssh.md` to use the signature `ssh <destination> [ssh options…]` and explain that arguments after the destination are passed to SSH. Add valid examples such as a port/identity-file invocation and a remote command, checked against `product/specs/ssh-tab.md` and `src/commands/ssh.ts`. Keep runtime behavior unchanged; existing SSH behavior remains covered by `src/ssh.test.ts` and `src/ssh-manager.test.ts`.


* Show the plan's supported tab and group target syntax for monitors.

Existing Issue: `help/monitor.md` and `help/unmonitor.md` use an unspecified `<target>` even though monitor targets accept tab labels or the literal `group:<n>` form, leaving users without the syntax for selecting or removing a group. Severity: 4/10

Existing Risk: 4/10 - Users may be unable to target or remove a group from a monitor because the help pages do not show how to spell that target.

Proposal Risk: 2/10 - Explicit tab-label and `group:<n>` forms and examples make both operations discoverable while preserving the existing parser behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "document monitor tab and group targets". Update the Usage and Examples blocks in `help/monitor.md` and `help/unmonitor.md` to show the accepted tab-label and `group:<n>` forms, retaining the existing `monitor ask` and `unmonitor --all` forms. Explain that tab labels and display aliases are accepted, and include a group-target example. Verify the wording against `product/specs/monitoring.md`, `src/monitor/parsing.ts`, and `src/monitor/parsing.test.ts`; no runtime behavior changes or wording-only test are needed.


* Keep PR verification text from prompting execution of unreviewed branch code.

Existing Issue: The PR body's Setup section tells reviewers to run `node bin/janus.mjs --no-open <scratch-project-dir>` from the reviewed branch and drive that instance, making review text an instruction to execute untrusted PR code. Severity: 5/10

Existing Risk: 6/10 - A reviewer who follows the instruction can execute branch-controlled code with the account that owns the checkout before assessing the change.

Proposal Risk: 2/10 - Removing the imperative launch request means the PR body alone no longer prompts branch-code execution, while reviewers retain control over any later isolated manual verification.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "remove the PR body's branch-execution instruction". Revise the PR body's Setup and How to verify sections to state the expected observations without directing reviewers to launch the executable from the reviewed checkout. Keep the feature behavior assertions as descriptive expectations and leave source code unchanged. Verify the updated description with `gh pr view` and confirm it no longer asks reviewers to run this branch's application.
