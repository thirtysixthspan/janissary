# fix(tasks): re-review only when repairs change production code

**Complexity: 3/10** — ~25 added playbook lines, 2 task files, 7 requirements (p=4.73)

## Goal

The feature-building tasks repeat a pull request review after every repair round, even when the repairs only corrected the pull request description, documentation, or plans. Those re-reviews spend a full review pass to check text that a code review adds little to. The issue asks that "re-review cycles are only required to continue if there are changes to production code. changes to pr description, documentation or plans are not sufficient to trigger re-review." This fix makes every re-review cycle in the task playbooks continue only when the repairs since the last review changed production code.

## Requirements

1. In `build-a-feature.md`, a follow-up full review runs after a repair round only when the repairs changed production code: "re-review cycles are only required to continue if there are changes to production code".
2. In `build-a-complex-feature.md`, a focused subplan cycle's resolution review runs only when the repairs changed production code: "in build-a-feature.md, build-a-complex-feature.md and any other task with a re-review cycle".
3. In `build-a-complex-feature.md`, a follow-up full-PR review runs only when the repairs changed production code: "re-review cycles are only required to continue if there are changes to production code".
4. Changes to the pull request description alone never trigger a re-review: "changes to pr description ... are not sufficient to trigger re-review."
5. Changes to documentation alone never trigger a re-review: "changes to ... documentation ... are not sufficient to trigger re-review."
6. Changes to plans alone never trigger a re-review: "changes to ... plans are not sufficient to trigger re-review."
7. Each task decides mechanically, from the files the repair range changed, whether production code changed, so the decision does not depend on how a finding was classified.

## Design decisions

- Production code is defined by exclusion, so the check is a file-path test any project can apply: every file the repair range changed outside `./product/` (plans, specs, and backlogs, including `./product/backlog/pull-request.md`), `help/`, and `documentation/` is production code. The PR description is not in git at all, so it never appears. Tests count as production code changes, which keeps the rule conservative where a repair changes runtime-adjacent files.
- The repair range runs from the PR head recorded before the first repair of a round to the current PR head after the backlog drains, read with `git diff --name-only <recorded>..<current>`. `build-a-complex-feature.md` already records that SHA in Step 6 item 2 and Step 9 item 2; `build-a-feature.md` gains the same recording step.
- The existing description-only exception in `build-a-complex-feature.md` (classify entries, then check the range changed only fix plans and the backlog) is replaced by the production-code check. Its safeguard that `gh pr view <number> --json body` shows each requested description correction is kept, so a skipped re-review still proves the description repair landed.
- The behavioral test cycle in `build-a-complex-feature.md` Step 9 is not a review cycle and keeps retesting after every repair; only its wording that refers to the old description-only exception is updated.
- Each task restates the rule in full, because each runs in a fresh agent that reads only its own file.

## Preserved behavior

1. Behavior: the PR description statistics guideline remains stated in every description-writing playbook. Negative assertion: editing the build tasks must not remove or alter that guideline in any playbook it lists. Test: `scripts/pr-description-statistics-guideline.test.mjs` "is stated as a guideline in %s".

## Assumptions

1. `build-a-feature.md` is one of the two named tasks with a re-review cycle, at `ai/tasks/feature/build-a-feature.md:118` "If rework was required, after the backlog drains, review the full PR again."
2. `build-a-complex-feature.md` always runs a resolution review today, at `ai/tasks/feature/build-a-complex-feature.md:22` "Focused subplan cycles always run their resolution review."
3. No other task in `ai/tasks/` repeats a review: the only delegators of `review-pull-request.md` are the two build tasks, found by searching `ai/tasks/` for `review-pull-request`; `test-pull-request.md`, `work-pull-request-issue.md`, and `find-technical-debt.md` reference it only for its format and safety rules, for example `ai/tasks/feature/test-pull-request.md:208` "This is the format [`review-pull-request.md`](review-pull-request.md) Step 4 defines".
4. The spec describes the old cycle at `product/specs/pull-request-review.md:23` "After the backlog empties, the pull request is reviewed again."
5. The user documentation describes the old cycle at `documentation/user-documentation/workflows/pull-request-review.md:84` "Each finding is repaired one at a time, in file order, and the pull request is reviewed again."

## Existing functionality

1. The complex task already records the PR head before repairs as a range base: `ai/tasks/feature/build-a-complex-feature.md:84` "record the PR head SHA before any repair starts".
2. The complex task already checks a repair range's changed files before skipping a full review: `ai/tasks/feature/build-a-complex-feature.md:112` "confirm the repair range from the recorded head SHA to the current PR head changed only fix plans".
3. Task-wording tests pin playbook text with vitest under `scripts/`: `scripts/pr-description-statistics-guideline.test.mjs:30` "describe('the pull request description statistics guideline'".

## Implementation steps

1. `ai/tasks/feature/build-a-feature.md`: update the opening job paragraph and Step 8. In Step 8 item 2, record the PR head SHA (`gh pr view <number> --json headRefOid`) before the first repair. Rewrite item 3 so that, after the backlog drains, the orchestrator lists the repair range's changed files and runs another full review only when that list includes production code, defined as in the design decisions. Fold the deduplication clause into the same rule. Update Step 9's entry condition to match. Build command: `$janissary/scripts/run.mjs check-diff`.
2. `ai/tasks/feature/build-a-complex-feature.md`: update the opening summary, the orchestration rules (lines 21–23) with the production-code definition, Step 6 item 4–5 so the resolution review runs only when the repair range changed production code, Step 7's predecessor check, Step 9 items 2–3 so the full re-review is gated the same way (keeping the `gh pr view` description check for entries that requested description corrections), and the test cycle's "description-only" wording. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Add `scripts/re-review-production-code.test.mjs` pinning the rule's wording in both tasks. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Update `product/specs/pull-request-review.md` ("Review cycle after building a feature" and the complex-feature paragraph) and `documentation/user-documentation/workflows/pull-request-review.md` ("Reviews inside a feature build") to state that a re-review runs only when repairs changed production code. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change is to agent playbooks; no user interface surface changes.

## Tests

`scripts/re-review-production-code.test.mjs`, mirroring `scripts/pr-description-statistics-guideline.test.mjs`:

- Both build tasks state that a re-review runs only when the repair range changed production code (Requirements 1–3, 7).
- Both build tasks name `./product/`, `help/`, and `documentation/` as the paths whose changes alone do not count as production code, and say the PR description never counts (Requirements 4–6).
- `build-a-complex-feature.md` no longer says focused subplan cycles always run their resolution review (Requirement 2).

## Out of scope

- The behavioral test-and-repair cycle in `build-a-complex-feature.md` keeps retesting after every repair round.
- The first review in each cycle (the focused commit review, the first full review) always runs.
- `review-pull-request.md`, `work-pull-request-issue.md`, and `update-pull-request.md` are unchanged.
- Existing inaccuracies elsewhere in the user documentation and specs are not corrected.

## Verification

`$janissary/scripts/run.mjs check-diff`

Reading check: open `ai/tasks/feature/build-a-feature.md` Step 8 and confirm item 3 runs another full review only when `git diff --name-only` over the recorded repair range lists a file outside `./product/`, `help/`, and `documentation/`. Open `ai/tasks/feature/build-a-complex-feature.md` and confirm Step 6 item 4 and Step 9 item 3 apply the same test, the orchestration rules no longer say resolution reviews always run, and the test cycle still retests after every repair. A plan that still describes a description-only classification as the trigger, or that skips the resolution review unconditionally, was not changed correctly.
