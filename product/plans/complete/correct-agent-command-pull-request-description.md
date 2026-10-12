# Correct the agent command pull request description

**Complexity: 2/10** — no source, test, or spec changes. The work corrects the pull request's description after publishing a plan and removing its recorded backlog entry.

## Goal

Describe the implemented canonical local `agent` command and its awaited result and cleanup behavior, without claiming that execution is deferred to later subplans.

## Approach

Update only the relevant paragraphs in the PR body's "What" and "Behavior examples" sections. Preserve its parser, task and skill resolution, grant, test, and file-change details. Keep all other body text unchanged.

The backlog proposal says remote-host, named-workspace, and tab-monitoring selectors are unsupported. That does not match this branch: `src/commands/agent.ts` routes established remote workspaces and opens a monitor for `in a tab`, and the user guide documents both. Do not repeat that incorrect claim in the description. The local path resolves against the caller's current working directory and `executeAgentRun` awaits the task result before run cleanup.

## Implementation steps

1. Correct the local execution summary and remove the behavior-summary claim that command execution arrives in later subplans.
2. Promote this plan to complete and remove only the selected entry from `product/backlog/pull-request.md`.
3. Run the diff-scoped checks, commit and push to PR #1672, then apply the body correction while preserving every unrelated paragraph.

## Tests

None. No code or behavior changes. Verify the claims against `src/commands/agent.ts`, `src/agent/execute.ts`, and `documentation/user-documentation/advanced-agents/agent-command.md`, then read back the edited PR body.

## Out of scope

- Source code, tests, specs, and user documentation.
- Any PR body text outside the named "What" and "Behavior examples" paragraphs, the title, and other backlog entries.
- Describing supported remote-host, named-workspace, or monitoring selectors as unsupported.
