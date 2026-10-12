# Confine explicit installed task paths

**Complexity: 3/10** — The fix is a small root-validation change in the task resolver with focused path-confinement tests and one behavior-spec clarification.

## Goal

Keep explicit installed-task paths confined to the canonical Janissary installation, including when `ai/tasks` is symlinked outside it.

## Approach

Before an installed task root can authorize an explicit path, resolve both the installation and task root and confirm the task root remains inside the installation. A redirected root must not become trusted merely because the requested file is under its resolved destination. Workspace task paths remain independently allowed.

## Implementation steps

1. Validate the installed task root against the canonical installation root when constructing allowed roots for explicit task resolution.
2. Add regression cases for `$janissary/ai/tasks/...` and a direct explicit path under a redirected installed task root, ensuring neither returns the target contents.
3. Update the agent-command spec to state that explicit installed paths must remain inside the canonical installation as well as its task directory.
4. Remove this item from the PR backlog, promote this plan to complete, run `check-diff`, and publish a separate commit to PR #1672.

## Tests

- An installed `ai/tasks` symlink to an outside directory rejects both the `$janissary/ai/tasks/...` form and an explicit file path below the redirected root.
- Existing explicit workspace and valid installed paths, discovery-root escape, and outside-path tests continue to pass.

## Out of scope

Do not change workspace-relative explicit-path behavior, bare-task discovery, skill resolution, user documentation, or the PR description.
