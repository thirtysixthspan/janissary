<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Give the agent command's How to verify section manual steps a reviewer can run

Existing Issue: The pull request's How to verify section lists only test-suite coverage and no manual step, so the launch-grammar replies cannot be checked by hand. Severity: 3/10

Existing Risk: 4/10 - Without runnable steps a reviewer can only exercise the change by an unplanned run, so an end-to-end defect such as the missing shell reply surfaces late or not at all.

Proposal Risk: 1/10 - Once the steps are in How to verify a reviewer can run the launch checks by hand; what remains uncovered is the launches that need a fresh clone and provider credentials, which a manual check of the parser cannot reach.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "Add runnable launch-grammar steps to the agent command's How to verify". Correction: add these generated steps to the description's How to verify, each typed as one line into a shell tab's command bar, with the reply checked on screen beneath it: `agent execute` shows "Agent: missing task after execute."; `agent in group nosuch execute x.md` shows `Agent: group "nosuch" does not exist.` and opens no tab; `agent in workspace nosuch execute x.md` shows `Agent: unknown workspace "nosuch".` and creates no workspace; `agent in a tab` shows "Agent: missing execute clause." and opens no monitor tab. Add them after the reply-display fix in the entry above, since until then the on-screen check fails for every one of them.
