# Keep the browser PR description current as follow-ups land

**Complexity: 2/10** - this changes only PR #975's GitHub description and records the completed work locally. No product behavior changes.

## Issue

PR #975's **Review follow-ups** section says twelve findings are fixed and six remain. Later commits completed four more findings, so that arithmetic and the supporting table and test inventory no longer describe the branch. The description is the first review surface a merger sees, so it should report durable facts instead of a count that expires whenever the backlog changes.

## Approach

Rewrite the follow-up introduction so it points to the completed plans and the branch backlog without hard-coded totals. Add rows for the completed `--no-workspace` confinement correction, frame-filter source cleanup, stale launch-comment cleanup, and Playwright path coverage. Add the missing Playwright path suite to the test inventory. Preserve the behavioral description, verification caveats, and file inventory that still match the branch.

## Implementation

1. Update PR #975's **Review follow-ups** introduction and table from the current GitHub body.
2. Add `playwright-paths.test.ts` to the new server test inventory using its current case count.
3. Re-read the rendered body and compare every added item with its completed plan and branch file.
4. Remove only this resolved entry from `product/backlog/pull-request.md`.

## Tests

There is no executable product change. Run `./scripts/run.mjs check-diff` for the local plan and backlog edit. Verify the GitHub body directly after the update, confirm the stale twelve/six sentence is absent, and confirm the four added follow-up rows and Playwright path suite are present.

## Documentation

The pull request description is the affected documentation. No product spec or user documentation changes because behavior is unchanged.

## Out of scope

- Rewriting behavioral sections that still match the implementation.
- Claiming that the follow-up table is exhaustive while this backlog is still being drained.
- Resolving any other backlog entry in the same commit.
