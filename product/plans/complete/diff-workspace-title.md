# Rename workspace diff tabs

**Complexity: 2/10** — local and remote workspace diff tabs share one title prefix. The implementation is a one-line title change with focused coverage and updates to the existing spec and user guide that name the current title.

## Goal

Label each workspace diff tab `diff: <workspace label>` while keeping the project-root diff tab titled `diff`.

## Approach

Change the prefix used for local and remote workspace diff titles. Keep the existing workspace identity and shared-tab behavior unchanged, and update the current title descriptions in the functional specs and user documentation.

## Implementation steps

1. Change the workspace diff title prefix and test the titles created by both local and remote workspace routes.
2. Update `product/specs/diff-tab.md`, `product/specs/sessions-tab.md`, and `documentation/user-documentation/tab-types/diff.md` to describe the new title.

## Tests

- `src/plugins/diff/activate.test.ts`: local and remote workspace diff routes create titles in the `diff: <workspace label>` form.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing how a workspace is selected or how two tabs sharing one workspace reuse its diff tab.
- Changing the project-root diff title or the `diff on <tab name>` command syntax.
- Updating help text, which documents command syntax but does not describe tab titles.
