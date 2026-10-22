# Store conversations in their project

**Complexity: 4/10** — conversation storage already has one filesystem owner; pass the project root into that owner and update its tests and storage documentation.

## Goal

Conversation histories, private workspaces, and remembered model selection are isolated by project instead of shared across all projects for the current user.

## Approach

Root each `ConversationStore` at `<project>/.janissary/conversations`. `createManagers` already receives the project directory, so pass it into `ConversationsManager` and then the store. Keep the home directory input for `.claude.json`, which remains the user-level record of accepted workspace trust. The current global store has no project ownership metadata; leave it untouched rather than assigning its conversations arbitrarily to one project.

## Implementation steps

1. Add an explicit `projectDir` option to `ConversationStore` and root conversation records, workspaces, and last-used model data beneath that project's `.janissary/conversations` directory.
2. Thread `projectDir` through `createManagers` and `ConversationsManager` into the default store, retaining the home directory for Claude trust configuration.
3. Update conversation store and manager tests for project-rooted data and add coverage that identical conversation IDs remain isolated across projects.
4. Update `product/specs/conversations.md` and the user conversation page to describe per-project history and storage locations.

## Tests

- `src/conversations/store.test.ts`: assert the store writes under the supplied project root, and two projects can contain separate records with the same ID without seeing one another.
- `src/conversations/manager.test.ts`: ensure existing manager persistence fixtures point at an isolated project root.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Migrating the existing user-wide conversation store, which does not record which project owned each conversation. Existing data is left untouched at its old location.
- Moving the Claude trust configuration out of the user's home directory.
- Changing conversation IDs, record formats, or conversation workspace lifecycle.
