# Document the no-code Verification accommodation in PR 2165's description

**Complexity: 1/10** — description-only change: 0 production lines, 0 production files edited, 0 behavioral requirements, scenarios, or new units (p=1.578).

## Goal

PR 2165's body frames the change purely as centralizing plan section lists and never mentions that the repair also redefined the plan template's Verification requirement into a running-app form and a reading-based form for no-code plans, or that a fix plan records that repair. The goal is to add one short paragraph to the body's "What" section so a reader learns that the Verification requirement is redefined by plan surface, that `$janissary/scripts/run.mjs check-diff` is never sufficient on its own, and that the accommodation is recorded in fix plan `product/plans/complete/plan-template-verification-no-running-app.md`. No guidance file, source file, spec, or other part of the description changes.

## Design decisions

- The correction is confined to the PR body's "What" section. The "Behavior examples", "Screenshots", and "How to verify" sections stay byte-for-byte as their author wrote them.
- The single new paragraph is inserted at the end of "What", immediately before the `## Behavior examples` heading.
- No change-set statistics — commit or file counts, line counts, or commit SHAs — appear in the added paragraph.
- `gh pr edit` replaces the body wholesale, so the full revised body is written to `./temp/pr-body.md` from a fresh read of the current body with only the new paragraph inserted, then applied with `--body-file`. This preserves every other paragraph exactly.
- The fix plan is written to `product/plans/complete/` and the resolved entry removed from `product/backlog/pull-request.md` as task mechanics only. No file under `ai/`, `src/`, or `product/` changes beyond those two mechanics.
- The commit and push land before the description edit, so the live PR body never describes work that is not yet on the branch. The PR stays OPEN and is not merged, closed, or replaced.

## Assumptions

- PR 2165 is OPEN with head branch `feature/plan-template-guideline`, recorded via `gh pr view` before the edit.
- The current body's "What" section ends with the paragraph beginning "The complexity line stays the single documented phase-specific exception", followed by `## Behavior examples`. Read and confirmed.
- `ai/guidelines/plan-template.md`, "Verification" defines both surface-based forms and states that `check-diff` alone is never sufficient. Read and confirmed.
- `ai/tasks/planning/improve-plan.md`, Step 3 "Missing verification" names both manual-check forms and defers the definition to the template. Read and confirmed.
- The fix plan `product/plans/complete/plan-template-verification-no-running-app.md` exists on this branch and is the record of the repair. Read and confirmed.

## Requirements

- The "What" section gains one short paragraph naming both Verification forms: a running-app end-to-end check for plans that change application behavior, and a reading-based check naming the files to read and the consistency claims to confirm for no-code plans.
- The paragraph states that `$janissary/scripts/run.mjs check-diff` is never sufficient on its own.
- The paragraph names `product/plans/complete/plan-template-verification-no-running-app.md` as where the accommodation is recorded.
- "Behavior examples", "Screenshots", and "How to verify" remain unchanged, and no change-set statistics appear in the added text.
- No file under `ai/`, `src/`, or `product/` changes beyond the fix plan and the backlog entry removal.

## What already exists (reuse, don't rebuild)

| Concern | Where it already lives |
| --- | --- |
| The two-form Verification rule and the `check-diff` insufficiency statement | `ai/guidelines/plan-template.md`, "Verification" |
| The aligned verification instruction | `ai/tasks/planning/improve-plan.md`, Step 3 "Missing verification" |
| The record of the no-code accommodation | `product/plans/complete/plan-template-verification-no-running-app.md` |
| The current PR body being amended | `gh pr view <reference> --json body` |
| The mechanics for the plan and backlog entry | `ai/tasks/feature/work-pull-request-issue.md`, Steps 2, 7, and 8 |

## Implementation steps

1. Re-read the live body with `gh pr view <reference> --json body` and write the full body to `./temp/pr-body.md`, inserting one new paragraph at the end of "What" immediately before `## Behavior examples`.
2. Write this plan to `./product/plans/draft/pr-description-no-code-verification.md`, rate it with `ai/tasks/planning/rate-plan-complexity-quantitative.md`, and move it to `./product/plans/ready/`.
3. Promote the plan to `./product/plans/complete/` and remove the resolved entry whole from `./product/backlog/pull-request.md`, restoring the exact master comment-and-heading skeleton because this was its only entry.
4. Run `$janissary/scripts/run.mjs check-diff`; it should be clean as no application code changed.
5. Commit the plan and backlog change with a Conventional Commit subject and body, then push to `feature/plan-template-guideline`.
6. After the push succeeds, apply the description correction with `gh pr edit 2165 --body-file ./temp/pr-body.md`.
7. Confirm the PR is still OPEN and its `headRefOid` matches `git rev-parse HEAD`.

## Tests

No application behavior, source, or configuration changes, so no unit tests are introduced; the `src/**/*.test.ts` and `web/src/**/*.test.tsx` conventions do not apply. Correctness is checked with `$janissary/scripts/run.mjs check-diff` and the reading checks in Verification.

## Out of scope

- Edits to any file under `ai/`, `src/`, or `product/` other than the fix plan and the backlog entry removal.
- Changes to the "Behavior examples", "Screenshots", or "How to verify" sections of the PR body.
- Change-set statistics in the added paragraph, or any change to the PR title, state, or branch.
- Merging, closing, or replacing the pull request, or force-pushing the branch.

## Verification

- `$janissary/scripts/run.mjs check-diff` — a clean run confirms no lint, typecheck, or test regression; no application code changed.
- Manual: read the updated body with `gh pr view <reference> --json body` beside the aggregate diff and the referenced files; confirm the "What" section now names both Verification forms, states that `check-diff` is never sufficient on its own, and cites `product/plans/complete/plan-template-verification-no-running-app.md`.
- Manual: confirm "Behavior examples", "Screenshots", and "How to verify" are unchanged and no change-set statistics were introduced.
- Manual: confirm the PR is still OPEN, its head branch is `feature/plan-template-guideline`, and its `headRefOid` matches `git rev-parse HEAD`.
