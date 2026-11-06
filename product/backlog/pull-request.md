<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request title to describe the implemented role grants and tell command.

Existing Issue: The PR title calls this `docs(plan): decompose role native commands and tell`, while its current body and 120-file diff describe and implement role command grants and the `tell` command. Severity: 3/10

Existing Risk: 3/10 - Readers scanning the pull request list can mistake a completed feature implementation for a plan-only documentation change.

Proposal Risk: 1/10 - A title that names the implemented feature makes the PR's scope clear, though the code and documentation remain as submitted.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1943 "align PR title with implemented role grants and tell feature". Update the pull request title to a Conventional Commit title that describes the shipped role-native command grants and tell command, matching the current PR body and aggregate diff. Leave the implementation and documentation unchanged for this description-only correction.
