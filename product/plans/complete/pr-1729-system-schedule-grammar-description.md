# PR 1729: correct the system-schedule grammar status

**Complexity: 2/10** — verify the shipped grammar implementation, correct two named PR-body sections, and remove one backlog entry.

## Goal

Make PR #1729's overview and verification guidance accurately state that commit `0ddf685e` delivers system schedule grammar, command routing, profile isolation, and grammar-aware completion, while the schedules UI and browser E2E work remain planned.

## Approach

Update only the body overview and “How to verify” statements that incorrectly describe the grammar as planned or unshipped. Reconcile surrounding claims so the broader plan's scope and acceptance scenarios remain intact and distinguish shipped behavior from future UI and browser E2E work. Preserve the PR title and every unrelated body paragraph exactly.

The cited parser, command router, profile schedule handling, and completion module already implement the named behavior. This repair changes no product behavior, so source, tests, specs, and public documentation need no edits.

## Implementation steps

1. Promote this plan to `product/plans/ready/` before preparing the description correction.
2. Remove only the selected entry from `product/backlog/pull-request.md`, restoring the comment-and-heading skeleton when empty.
3. Run the required diff-scoped check and publish the completed plan and backlog update to the existing PR head branch.
4. After the push, reread the live PR body and revise only the named overview and verification claims, preserving all other text and the title exactly.
5. Confirm the PR remains open and its head matches the pushed branch.

## Tests

No new tests. Verify the correction against `src/schedule/index.ts`, `src/commands/schedule.ts`, `src/profile/harness-schedule.ts`, and `src/completion/system-schedule.ts`. Run `./scripts/run.mjs check-diff` for the plan and backlog edits.

## Out of scope

- Changing implementation, tests, functional specs, or user documentation.
- Rewriting broader feature scope or acceptance scenarios in the PR body.
- Claiming the schedules UI or browser E2E work has shipped.
- Editing the PR title or any unrelated description text.
- Merging or closing the PR.
