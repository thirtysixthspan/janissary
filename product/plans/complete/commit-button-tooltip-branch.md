# Commit-to-origin button tooltip names the target branch

Issue: update the tooltip of the commit to origin button in the file navigator to specify the
branch onto which the commit will go.

Complexity: 2/10

## Goal

The navigator header's Commit to origin button's tooltip currently reads "Commit changes to origin"
(and the committing/committed/failed variants). The navigator header already holds the branch name
(`branch` prop); pass it into `FileNavigatorCommitButton` and append it to each tooltip as the
target branch, e.g. `Commit changes to origin (branch main)` / `Commit changes to origin (branch
main): committing`.

## Approach

- `FileNavigatorCommitButton` gains a `branch?: string` prop; build each tooltip with the branch
  segment when present, unchanged otherwise.
- `FileNavigatorHeader` passes its existing `branch` prop through (`onCommit` is only set when
  `branch` exists, per `FileNavigatorTab`).
- Tests: extend `FileNavigatorCommitButton.test.tsx` (tooltip with and without branch) and the
  `FileNavigatorHeader` test wiring the pass-through.

## Out of scope

- The row menu's `Commit to origin` label and the commit popup copy (not tooltips).
- Other backlog issues.

## Spec / docs

`product/specs/file-navigator-tab.md` mentions the commit button's tooltip if at all — update the
sentence naming the tooltip if it does; user docs mention only behavior, update if it names the
tooltip.
