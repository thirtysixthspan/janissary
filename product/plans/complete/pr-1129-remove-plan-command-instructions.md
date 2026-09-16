# PR 1129 — remove executable plan instructions

Complexity: 2/10

## Goal

The selection-layer plans include executable shell and GitHub CLI directions, so branch content can be mistaken for instructions by an automation with repository or GitHub privileges.

## Approach

Replace command invocations with declarative outcomes while preserving each plan's goal, design, implementation record, and verification criteria.

## Implementation steps

1. Rewrite the documentation follow-up plan's PR-body update as a recorded outcome instead of a GitHub CLI instruction.
2. Replace the main feature plan's command-form verification block with a statement of the required verification result.
3. Replace the Escape-scoping plan's command-form check reference with a verification outcome.

## Tests

- Inspect the affected plans to confirm they retain their implementation and verification intent without command invocations.

## Out of scope

- Changing product behavior, source code, tests, or the pull request body.
- Rewriting unrelated plans outside this PR's selection-layer work.
