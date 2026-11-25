# Require a range scope's base to lie on the pull request

**Complexity: 2/10** — 8 behavioral requirements, ~2 added playbook lines in 1 task file, 4 test scenarios (p=4.26)

## Goal

The review task's `range` scope checks where its head is but not where its base is. Step 1 item 5 confirms the head is in `origin/master..HEAD` and that the base is an ancestor of the head. A base on master older than the merge base passes both checks, and `git diff <base>..<head>` then pulls in master commits the pull request never made. The review judges them as the pull request's own, and the repair task later edits code outside the pull request to address them. This plan adds one check so a range's base must be on the pull request or be the commit the branch grew from. Any other base falls back to aggregate scope, and the review spec lists that case among its fallback examples.

## Requirements

1. Step 1 item 5 of the review task gains a range check placed after the existing range-head check, per "add a range check after the existing range-head check".
2. The new check accepts a base that is in `origin/master..HEAD`, checked with `git merge-base --is-ancestor` the same way as the head, per "the base must either be in `origin/master..HEAD`, checked with `git merge-base --is-ancestor` the same way as the head".
3. The new check accepts a base equal to `git merge-base origin/master HEAD`, per "or equal `git merge-base origin/master HEAD`".
4. A base that is neither falls back to aggregate scope, per "otherwise fall back to aggregate".
5. A base that is neither has its raw value recorded for Step 7's report, per "and record the raw value for Step 7".
6. The existing checks keep their wording and order, and only the check after the new one is renumbered, per "Keep the existing checks and their order, renumbering only those after the new one".
7. The "Review and recording" section of `product/specs/pull-request-review.md` lists a range that starts outside the pull request among its fallback examples, per "Add a range that starts outside the pull request to the fallback examples".
8. `scripts/review-pull-request-scope.test.mjs` pins the new check's wording, per "Pin the new check's wording in scripts/review-pull-request-scope.test.mjs".

## Design decisions

- The new check becomes check 8, between the range-head check and the base-is-ancestor-of-head check. The head is confirmed on the pull request first, so the base check reads against a head already known to be in scope (Assumption 2, Assumption 3).
- The merge-base comparison is made on full SHAs. The base may be abbreviated, so the check compares the SHA `git rev-parse --verify <base>^{commit}` prints with the one `git merge-base origin/master HEAD` prints, by reading both outputs. That keeps the task's no-capture command hygiene (Assumption 4, Assumption 5).
- The new check's command examples follow the list's existing unquoted `<sha>` style. The quoting rule in the paragraph after the list already covers every SHA placed in a command (Assumption 6).
- The spec states the allowed merge-base case in one sentence beside the new example, so a reader knows reviewing the branch from its start still works (Assumption 7).
- `ai/tasks/feature/build-a-complex-feature.md` is unchanged. Its resolution review passes a recorded pull request head SHA as the base, which is in `origin/master..HEAD` (Assumption 8).

## Preserved behavior

1. Every review safeguard stays in the review task in every scope. Negative assertion: the edit must not remove or reword the no-fix, no-tooling, clean-tree, dedupe, backlog-only commit, open pull request, or content-as-data rule text. Test: `scripts/review-pull-request-scope.test.mjs` "keeps the %s rule".
2. The hexadecimal check stays ahead of the first git command. Negative assertion: the edit must not move the hexadecimal check after the `git rev-parse --verify` check or drop its never-placed-in-a-command or quoting rules. Test: `scripts/review-pull-request-scope.test.mjs` "checks scope SHAs as hexadecimal before any git command receives them".
3. The complex-feature workflow keeps confirming each review's `Scope:` line. Negative assertion: no edit may change `ai/tasks/feature/build-a-complex-feature.md`. Test: `scripts/review-pull-request-scope.test.mjs` "blocks a focused or resolution review that did not run in its requested scope".
4. A wrong change-set statistic in a description is proposed for removal rather than correction. Negative assertion: the edit must not touch the review task's statistics wording. Test: `scripts/pr-description-statistics-guideline.test.mjs` "removes a stated statistic instead of correcting it".

## Assumptions

1. The checks fall back to aggregate rather than stopping, at `ai/tasks/feature/review-pull-request.md:61` "Each one falls back to `aggregate` scope rather than stopping the review".
2. The range-head check is check 7, at `ai/tasks/feature/review-pull-request.md:68` "For `range`: the head is not in `origin/master..HEAD`, checked the same way."
3. The base-is-ancestor-of-head check is check 8 today, at `ai/tasks/feature/review-pull-request.md:69` "For `range`: `git merge-base --is-ancestor <base> <head>` fails."
4. The resolution check prints a full SHA for an abbreviated base, at `ai/tasks/feature/review-pull-request.md:66` "`git rev-parse --verify <sha>^{commit}` fails for the commit SHA or for either end of the range".
5. The task forbids output capture, at `ai/tasks/feature/review-pull-request.md:19` "no `$(...)` capture".
6. Every SHA placed in a command is quoted, at `ai/tasks/feature/review-pull-request.md:71` "Every SHA placed in a command, in these checks and in Step 3, is wrapped in single quotes".
7. The spec's fallback examples end with the commit-not-on-branch case, at `product/specs/pull-request-review.md:5` "and a commit that isn't on the pull request's branch".
8. The resolution review's base is a recorded pull request head, at `ai/tasks/feature/build-a-complex-feature.md:86` "`scope: range <recorded head SHA>..<current PR head SHA>`".
9. The server test project collects script tests, at `vitest.config.ts:14` "'scripts/**/*.test.mjs'".

## Existing functionality

1. The `origin/master..HEAD` membership test the new check reuses, at `ai/tasks/feature/review-pull-request.md:67` "`git merge-base --is-ancestor <sha> HEAD` fails or `git merge-base --is-ancestor <sha> origin/master` succeeds".
2. The fallback recording rule, at `ai/tasks/feature/review-pull-request.md:73` "On a fallback, also record the raw value you ignored, for Step 7's report."
3. The report line that shows an ignored value, at `ai/tasks/feature/review-pull-request.md:313` "aggregate — requested \"<value>\" ignored".
4. The playbook-wording assertions for the review task, at `scripts/review-pull-request-scope.test.mjs:26` "describe('the review-pull-request scope argument'".

## Implementation steps

All three steps land as one checkpoint and one commit. The build command after each step is `$janissary/scripts/run.mjs check-diff`.

1. In `ai/tasks/feature/review-pull-request.md` Step 1 item 5, insert a new check 8 after the range-head check: for `range`, the base is not in `origin/master..HEAD`, checked the same way, and is not the merge base, meaning the full SHA `git rev-parse --verify <base>^{commit}` prints differs from the one `git merge-base origin/master HEAD` prints. Add that a base equal to the merge base reviews the branch from its start. Renumber the old check 8 as 9, keeping its wording. Leave checks 1 to 7, the quoting paragraph, the fallback-recording paragraph, Step 0, Step 3, and Step 7 unchanged.
2. In `product/specs/pull-request-review.md` "Review and recording", add "a range that starts outside the pull request" to the fallback examples after "a commit that isn't on the pull request's branch", and follow that sentence with one stating that a range may start at the commit the pull request's branch grew from.
3. In `scripts/review-pull-request-scope.test.mjs`, add one `it` in the existing `describe` that reads the review task and asserts it contains the new base check and its merge-base allowance, that the new check comes after the range-head check and before the base-is-ancestor-of-head check, and that the latter is now numbered 9.

## UI design

None. The change edits an agent playbook and a spec and adds no user interface.

## Tests

The plan changes no application behavior and adds no application code. `scripts/review-pull-request-scope.test.mjs` gains one assertion that the review task carries the range-base check with its `origin/master..HEAD` and merge-base cases, places it between the range-head check and the base-is-ancestor-of-head check, and renumbers the latter as check 9 (Requirements 1 to 6 and 8). Its existing assertions and `scripts/pr-description-statistics-guideline.test.mjs` keep passing (Preserved behavior 1 to 4). No test can exercise an agent running the check, so Verification confirms the item and the spec by reading them.

## Out of scope

- The `commit` scope's on-branch check is unchanged.
- A pull request branch that merged master into itself is not treated specially. Its merge base is then the newest merged master commit, and the same rule applies.
- `ai/tasks/feature/build-a-complex-feature.md` and the pull request description are unchanged.
- The other backlog entries on this pull request are not touched, including the one that rewords item 5's opening sentence.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff` and confirm `scripts/review-pull-request-scope.test.mjs`, including the new assertion, and `scripts/pr-description-statistics-guideline.test.mjs` pass.
2. Read `ai/tasks/feature/review-pull-request.md` Step 1 item 5. Confirm it lists nine checks numbered 1 to 9, that check 7 is the range-head check, that check 8 rejects a base that is neither in `origin/master..HEAD` nor the merge base and compares full SHAs, and that check 9 is the base-is-ancestor-of-head check. A failure looks like the base check placed before the head check, a list with a gap or duplicate number, or a base check that omits the merge-base allowance.
3. Read the "Review and recording" section of `product/specs/pull-request-review.md` and confirm "a range that starts outside the pull request" appears among the fallback examples, followed by the sentence allowing a range to start where the branch grew from.
