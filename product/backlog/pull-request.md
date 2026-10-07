<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description and docs to use the harness button's exact “Waiting for the workspace” tooltip.

Existing Issue: The harness button renders `Waiting for the workspace`, while the pull request description and the remote-server and tabs documentation say `Waiting for workspace`. Severity: 2/10

Existing Risk: 2/10 - Reviewers and users may search for or expect a tooltip string that the UI never displays.

Proposal Risk: 1/10 - Matching the description and docs to the rendered tooltip leaves no wording discrepancy, though the tooltip itself could still be changed later.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1581: align the workspace provisioning tooltip wording". In `product/specs/remote-server.md` and `documentation/user-documentation/getting-started/tabs.md`, change the remote harness tooltip text to the exact `Waiting for the workspace` string rendered by `web/src/harness/HarnessTab.tsx`. Update the matching sentence in PR #1581's Behavior examples section to the same exact string, preserving all other description text. Verify the three strings match, remove this entry from the PR backlog, run `./scripts/run.mjs check-diff` as required for the plan or text change, and push the resolved update on the PR's existing head branch. The harness provisioning test in `web/src/harness/HarnessTab.test.tsx` already asserts the exact tooltip and should remain unchanged.
