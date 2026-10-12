# Add manual launch-grammar steps to the agent command's How to verify

**Complexity: 1/10** — A description-only correction. No source, test, or behavior changes; the work is recording the steps and checking they hold on the app built from this branch.

## Goal

The pull request's **How to verify** section lists only test-suite coverage, so a reviewer has no manual step to run for the agent command's launch grammar. Add four manual steps to that section, each typed as one line into a shell tab's command bar, with the reply checked on screen beneath it.

## Decisions and dependencies

The steps are the generated steps recorded in the backlog entry, and they depend on the reply-display fix in `product/plans/complete/agent-result-shell-reply.md`, which landed in this branch. Before the description names them, the four steps are run against a fresh app built from the branch, so that the on-screen expectations are observed rather than assumed.

No spec changes: the behavior the steps describe is already in `product/specs/agent-command.md`. No help or user-documentation changes: the steps document a reviewer procedure, not a changed command.

The description edit is applied after the commit is pushed, as the playbook requires, so the pull request never describes work that is not on its branch.

## Existing code to reuse

| Existing mechanism | Verified reference | Reuse and required change |
| --- | --- | --- |
| Launch grammar errors | `src/agent/command-parser.ts` (`parseAgentCommand`) | Reused unchanged; the steps assert its messages. |
| Group and workspace checks before any run | `src/commands/agent.ts` (`runAgent`), `src/agent/workspace-execution.ts` (`prepareAgentWorkspace`) | Reused unchanged; the steps assert that no tab or clone results. |
| Shell reply display | `web/src/plugins/shell/useShellSubmit.ts` | Reused unchanged; the steps check the reply on screen. |

## Proposed changes

1. The pull request description, section **How to verify**: after its last paragraph and before **Additional test cases**, add a short paragraph and a numbered list of the four steps, each stating the typed line, the expected reply, and any expected side effect.
2. Apply the edit with `gh pr edit --body-file` after the push, preserving every other character of the body.

## Tests

No automated test applies to a description edit. The verification is the live run recorded in the report: the four steps are typed into a shell tab of a fresh app built from this branch, and each reply is checked on screen. The diff-scoped check is run for the commit and has no affected tests.

## Out of scope

- Steps that need a fresh clone, an ACP provider, or a monitor tab: those need credentials and network a manual check cannot assume, and the backlog entry states this limit.
- Changes to the test suites or to any code.
