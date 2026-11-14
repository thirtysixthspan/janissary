# Name the two updated user-documentation pages in the PR description

**Complexity: 1/10** — description-only: 0 production lines, 0 files, 4 requirements (p=2.71)

## Issue

PR #2001's closing inventory names the updated specs (`acp.md`, `agent-command.md`, `application-commands.md`, `remote-server.md`, `roles.md`, and `tab-completion.md`) and help pages (`file.md`, `commands.md`, `ask.md`, `tell.md`, and `roles.md`), but it omits the two user-documentation pages the branch also changes: `documentation/user-documentation/tab-types/roles.md` and `documentation/user-documentation/advanced-agents/acp-agent.md`. Both pages now describe the new ask capability, the thirteen-command vocabulary, and that a granted `file glob` runs in the workspace on the host running the agent. A reviewer who uses the inventory as the list of documentation to check skips both pages, so a wording error there ships unreviewed.

## Approach

Change only the pull request description. Confirm the two pages against the branch first: `git diff master HEAD -- documentation/user-documentation/tab-types/roles.md documentation/user-documentation/advanced-agents/acp-agent.md` shows the ask capability sentences, the twelve-to-thirteen command count in `roles.md`, and the granted `file glob` host paragraph plus the typed-command list in `acp-agent.md`. `product/plans/complete/file-glob.md`'s "Help, specs, and user documentation" section names the same two pages with the same behavior.

Take the exact replacement text from the reviewed backlog entry: after the `Help updated:` sentence in the paragraph that begins `The plan is product/plans/complete/file-glob.md.`, add `User documentation updated: tab-types/roles.md and advanced-agents/acp-agent.md.` Keep every other paragraph byte-for-byte unchanged and add no change-set statistics. The description is a live GitHub artifact, so apply it with `gh pr edit --body-file` only after the push.

## Implementation

1. Read the current PR body with `gh pr view 2001 --json body`.
2. In the paragraph that begins `The plan is product/plans/complete/file-glob.md.`, after the `Help updated:` sentence, add exactly `User documentation updated: tab-types/roles.md and advanced-agents/acp-agent.md.`
3. Leave every other paragraph byte-for-byte unchanged and add no change-set statistics.
4. Write the full revised body to `./temp/pr-body.md` and apply it with `gh pr edit 2001 --body-file ./temp/pr-body.md` after the push, never before. Do not touch the title.

## Tests

None: no code, test, spec, help, or documentation changes. The two pages and their behavior are already covered by the branch; this work item only names them in the description.

## Out of scope

- Changing any code, test, spec, help, or user-documentation file.
- Any other paragraph of the description, including the specs and help inventory.
- Changing the PR title or adding change-set statistics.
