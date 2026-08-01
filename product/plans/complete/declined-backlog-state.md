# Add a declined state to every backlog

**Complexity: 2/10** — extends an existing markdown template and updates the documentation that describes its headings; no new runtime subsystem is required.

## Goal

Make `declined` a standard backlog state. Existing projects should expose the state in every standard backlog file, and `janus init` should seed it in every new backlog file so the workflow can record work that was considered and intentionally rejected.

## Approach

- Extend `backlogFileContent` in `src/project-init.ts` with an empty `## declined` section after `## deferred`.
- Add the same section to the six standard backlog files under `product/backlog/` while preserving all existing entries.
- Update the `janus init` CLI spec and the user documentation for project creation and product development so their examples and descriptions name all four states.
- Keep `janus init` idempotent: existing backlog files remain untouched when the command runs again.

## Implementation steps

1. Update the scaffold template and its tests in `src/project-init.ts` and `src/project-init.test.ts`.
2. Add `## declined` to the standard backlog files in `product/backlog/`.
3. Update `product/specs/cli.md`, `documentation/user-documentation/workflows/creating-a-new-project.md`, and `documentation/user-documentation/workflows/product-development.md` to describe the four-state structure.
4. Move this plan to `product/plans/complete/` and remove the resolved issue entry from `product/backlog/issues.md`.

## Tests

- Extend the scaffold test to require `## declined` in each seeded backlog file.
- Run `./scripts/run.mjs check-diff` after each implementation step and verify the existing idempotency test still protects user-authored backlog content.

## Spec updates

- `product/specs/cli.md`: document `ready`, `development`, `deferred`, and `declined` in every backlog file created by `janus init`.

## Docs

- `documentation/user-documentation/workflows/creating-a-new-project.md`: describe the four-state structure in freshly seeded files.
- `documentation/user-documentation/workflows/product-development.md`: show and explain `declined` alongside the existing states.
- `help.md`: no update is needed because it does not document `janus init` or backlog states.

## Out of scope

- Changing existing backlog entries or moving any work item between states.
- Adding runtime commands or UI for moving backlog entries.
- Updating unrelated documentation that does not describe backlog structure or `janus init`.
