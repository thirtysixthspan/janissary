# Remove executable verification instructions from reviewed text

**Complexity: 2/10** - this is a narrowly scoped security rewrite of two verification sections, the fix plan, and its backlog entry. It changes no product behavior or code.

## Goal

Reduce the chance that reviewers execute branch-authored commands or create files before deciding whether the reviewed branch is safe.

## Approach

Replace the executable setup and test procedures in the completed PDF find plan and PR description with a declarative account of the passing CI checks and the behavior those checks cover. Keep expected observations as descriptions of outcomes, without instructing reviewers to run commands, create fixtures, or follow another task.

## Implementation

1. Rewrite the `Verification` section of `product/plans/complete/pdf-tab-find.md` to record the current passing lint, tests, and TypeScript checks and summarize expected PDF find behavior declaratively.
2. Replace only the PR body's `How to verify` section with the same kind of CI evidence and non-executable expected observations, preserving all other description paragraphs exactly.
3. Remove only the resolved entry from `product/backlog/pull-request.md`.
4. Re-read the two verification sections and confirm they contain no instructions to run commands or create files, and no remaining setup or test procedure.

## Tests

The PR's current CI checks pass: lint, tests, and TypeScript. The final audit of both verification sections found no shell or app commands, fixture-creation steps, or instructions to run tests. The documentation-only diff check selected no code checks.

## Documentation and specs

No product spec or user documentation changes apply because this repair changes review instructions only.

## Out of scope

- Product code, tests, or PDF find behavior.
- Any other PR description paragraph or backlog entry.
- Starting a review, merging, or closing the PR.
