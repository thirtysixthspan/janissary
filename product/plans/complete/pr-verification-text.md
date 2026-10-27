# Keep PR verification text from prompting execution of unreviewed branch code

**Complexity: 1/10** — the fix changes only the PR description and records the completed work; feature behavior and source files stay untouched.

## Goal

Revise PR #1799's Setup and How to verify sections so they describe the expected verification context and feature observations without directing reviewers to launch or execute the application from the reviewed checkout. Preserve every existing feature behavior assertion.

## Approach

Replace the setup command with a declarative description of the expected isolated test context. Rewrite each verification case as an expected observation, retaining the existing command inputs, outputs, exact messages, and coverage for normal and edge-case behavior. Apply the PR body change only after the plan and backlog update have been pushed to the recorded head branch.

## Implementation steps

1. Prepare a complete replacement for the Setup and How to verify sections that contains no instruction to run the reviewed checkout's application.
2. Promote this plan to `product/plans/complete/` and remove only the selected entry from `product/backlog/pull-request.md`.
3. Run `$janissary/scripts/run.mjs check-diff`, commit the plan and backlog change, and push it to the PR's existing head branch.
4. Read the latest PR body, update only Setup and How to verify while preserving all other text, then confirm the PR remains open and the body no longer asks reviewers to execute the branch application.

## Tests

No feature behavior or source files change, so no code tests are added. Verify all existing behavior assertions remain represented in the revised description, run `$janissary/scripts/run.mjs check-diff`, and inspect the saved PR body and final GitHub body after the push.

## Out of scope

- Changing application source, tests, specs, user documentation, or feature behavior.
- Revising any PR-description text outside Setup and How to verify.
- Merging or closing PR #1799.
