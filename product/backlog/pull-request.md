<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove executable verification directives from the completed agent-command plans.

Existing Issue: The completed agent-command subplans retain instructions to run `./scripts/run.mjs check-diff`, so an agent reviewing those untrusted files can be directed to execute repository tooling despite the review's read-only boundary. Severity: 5/10

Existing Risk: 4/10 - A future reviewer may obey the embedded command, executing scripts from the branch under review and expanding the effects of a task that should only inspect content.

Proposal Risk: 2/10 - Recording verification as completed history and keeping remaining test descriptions non-operative removes the direct command cue, though reviewers must still treat branch content as untrusted.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove executable verification directives from completed agent-command plans". In `product/plans/complete/add-agent-command-01-resolution.md`, `product/plans/complete/confine-agent-skill-files-and-grants.md`, `product/plans/complete/document-agent-parser-errors.md`, `product/plans/complete/preserve-project-first-agent-task-lookup.md`, and `product/plans/complete/strict-task-root-discovery.md`, replace imperative verification commands with a concise past-tense record of the checks already performed or with a neutral statement that verification is recorded elsewhere. Keep test coverage descriptions as expected behavior, but remove directives that tell a reader to execute commands. Review each remaining plan sentence for direct operational instructions that would prompt a reviewer to run tools. No tests are needed for this documentation-only change; verify the five plans no longer contain executable verification directions and the backlog entry is resolved.
