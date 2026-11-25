# docs(tasks): number the complex-feature PR update before the full-PR review

**Complexity: 1/10** — no production code, 0 files, 6 documentation requirements (p=2.95)

## Goal

`ai/tasks/feature/build-a-complex-feature.md` numbers "Review and resolve the full pull request" as Step 8 and "Update the pull request" as Step 9, yet Step 9 says to run the update "before the full-PR review", Step 8 opens with "After the canonical plan and PR description match the completed feature", and the preamble says update, then review. An orchestrator has to infer the real order from three signals. Renumber the two sections and rewrite their preconditions so the step numbers, the preconditions, and the preamble all state one order: update first, then the full-PR review, then the test/repair/update cycle.

## Requirements

1. The update section comes first in numbering: "Renumber the sections or rewrite the precondition so there is one unambiguous order." `## Step 8 — Update the pull request` precedes `## Step 9 — Review and resolve the full pull request`.
2. The update section's opening states its precondition (every subplan's focused review cycle and Step 7's coverage check are complete) instead of the forward-looking "before the full-PR review" phrase.
3. The full-PR review section's opening names Step 8 as the step that brings the canonical plan and PR description in line with the completed feature.
4. The "Test, repair, and update again" subsection sits after the full-PR review section, since it runs after both the initial update and the full-PR review.
5. Every in-file cross-reference to Step 8 or Step 9 points at the renamed sections: the orchestration rule about description-only full-PR reviews, Step 4 override 3, Step 8's "resolve it before beginning the full-PR review" sentence, the test cycle's opening, and Step 10's "return to Step 9's test/repair cycle".
6. The functional spec `product/specs/pull-request-review.md` states explicitly that the pull request is updated before the aggregate review.

## Design decisions

- Renumber rather than only rewriting the precondition: the issue offers both, and numbering that matches execution order is the signal an orchestrator reads first.
- Keep "Test, repair, and update again" as a `###` subsection of the full-PR review step (now Step 9), so Step 10's existing phrase "Step 9's test/repair cycle" stays accurate without inventing a new step number.
- No step is added or removed, so Steps 0–7 and Step 10 keep their numbers and the Step 10 report shape is unchanged.

## Preserved behavior

None found

## Assumptions

1. The intended order is update, then full-PR review: the preamble says "update the canonical plan and pull request, then review the full pull request" at `ai/tasks/feature/build-a-complex-feature.md:3`.
2. The update section already says it runs first: "Delegate `ai/tasks/feature/update-pull-request.md` to a fresh subagent with the recorded PR number before the full-PR review" at `ai/tasks/feature/build-a-complex-feature.md:113`.
3. The review section already assumes the update ran: "After the canonical plan and PR description match the completed feature:" at `ai/tasks/feature/build-a-complex-feature.md:102`.
4. No other task file, script, or test references these step numbers: `grep -rn "build-a-complex-feature"` finds only `CHANGELOG.md`, `product/backlog/`, and the task's own invocation line.
5. The spec already implies the order: "Once every subplan has completed this cycle and the canonical plan and pull-request description match the finished feature, the aggregate pull request is reviewed" at `product/specs/pull-request-review.md:33`.

## Existing functionality

1. The update-before-review ordering is already carried by `orchestration rules` bullet "After every subplan and its focused review/repair cycle is complete, consolidate the canonical plan and update the PR description. Then review the full PR." at `ai/tasks/feature/build-a-complex-feature.md:23`.

## Implementation steps

1. In `ai/tasks/feature/build-a-complex-feature.md`, move the current `## Step 9 — Update the pull request` section body (its first two paragraphs) above the full-PR review section and retitle it `## Step 8 — Update the pull request`. Rewrite its opening so it states its precondition: after Step 7 completes, delegate the update; this update runs before the full-PR review in Step 9. Change its last sentence's "before beginning the full-PR review" to name Step 9.
2. Retitle the current `## Step 8 — Review and resolve the full pull request` as `## Step 9 — Review and resolve the full pull request` and rewrite its opening line to "After Step 8's update has made the canonical plan and PR description match the completed feature:".
3. Place the `### Test, repair, and update again` subsection after the full-PR review section's blocked-review paragraph, and rewrite its opening to "After the initial update in Step 8 and the full-PR review above complete".
4. Update the remaining cross-references: the orchestration rule "A full-PR review in Step 8" becomes Step 9; Step 4 override 3's "reviews and updates the full PR in Steps 8 and 9" becomes "updates and reviews the full PR in Steps 8 and 9"; the test cycle's final-update item now points its "update safeguards described above" at Step 8, since the update section no longer sits directly above it. Step 10's "return to Step 9's test/repair cycle" stays correct.
5. In `product/specs/pull-request-review.md`, rewrite the sentence "Once every subplan has completed this cycle and the canonical plan and pull-request description match the finished feature, the aggregate pull request is reviewed." so it states that the pull request is first updated so the canonical plan and description match the finished feature, and then the aggregate pull request is reviewed.

Build command after each step: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change touches a task playbook and a spec; it has no user interface surface.

## Tests

This plan changes no application behavior and introduces no code, so no tests are added. `$janissary/scripts/run.mjs check-diff` confirms no regression.

## Out of scope

- Rewording any other step of `build-a-complex-feature.md`, or changing the workflow's actual order.
- Persisting orchestrator state to files (tracked separately in `product/backlog/features.md`).
- `documentation/user-documentation/workflows/pull-request-review.md`, which describes the workflow at a level that does not name step numbers and does not contradict the order.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff`; it must pass.
2. Read `ai/tasks/feature/build-a-complex-feature.md`. Confirm that `## Step 8 — Update the pull request` appears before `## Step 9 — Review and resolve the full pull request`, that `### Test, repair, and update again` follows the Step 9 section, that no sentence says the update runs "before the full-PR review" without naming Step 9, and that every "Step 8" mention refers to the update and every "Step 9" mention refers to the full-PR review or its test/repair cycle. Any "full-PR review in Step 8" phrase left behind means the change was not made correctly.
3. Read `product/specs/pull-request-review.md` under "Staged reviews for complex features" and confirm it says the pull request is updated before the aggregate review.
