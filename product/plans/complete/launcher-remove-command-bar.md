# Launcher: remove the command bar

**Complexity: 3/10** — remove the launcher's typed command input and its command-bar declaration while retaining click-to-run command rows and their reply area.

## Goal

Remove the command bar from the launcher sidebar.

## Approach

Delete the launcher's command-bar component, typed-line state and key handling. Stop declaring that launcher tabs host the command bar and remove picker interception that depends on it. Keep command-row dispatch, Configure, and the rail's reply feedback.

## Implementation steps

1. Remove command-bar UI and typed-line behavior from the launcher; simplify its command action helper and manifest declaration.
2. Update launcher tests to assert the command bar is absent and command rows still dispatch and show replies.
3. Update the launcher functional spec to describe the command rail without a typed command bar.
4. Promote this plan and remove the completed backlog entry.

## Tests

- Verify no launcher command input renders.
- Verify command rows still dispatch, report errors, and open configured commands.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Removing the command rail or its configured commands.
- Changing the separate command bars hosted by shell tabs.
