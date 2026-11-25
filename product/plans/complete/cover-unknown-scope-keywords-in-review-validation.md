# Make the review task's scope validation cover its own unknown-keyword check

**Complexity: 2/10** — 5 behavioral requirements, 1 reworded playbook line in 1 task file, 3 test scenarios (p=3.80)

## Goal

Step 1 item 5 of the review task opens by saying its checks apply "For a `commit` or `range` request". Its first check catches a keyword that is neither of those. Read literally, an unknown keyword such as `scope: subplan 1a2b3c4` matches no rule, so it gets no effective scope at all. The plan, the spec, and the pull request description all promise it falls back to aggregate. This plan rewords the opening so the ordered checks run for every request other than `aggregate`, which makes the gate agree with the check it lists first. A test pins the new opening so it can't drift back.

## Requirements

1. Step 1 item 5 of `ai/tasks/feature/review-pull-request.md` still opens by exempting aggregate requests, per "An `aggregate` request needs no check."
2. The ordered checks apply to every request other than `aggregate`, per "For any other request, apply these checks in order and stop at the first that applies."
3. The item no longer limits its checks to `commit` and `range` requests, per "reword the opening so the ordered checks run for every request other than `aggregate`".
4. The nine checks keep their wording and order, and the fall-back-to-aggregate rule stays, per "leaving the seven checks, their order, and the fall-back-to-aggregate rule unchanged" (the list has grown to nine checks since the entry was written).
5. `scripts/review-pull-request-scope.test.mjs` asserts the new opening, per "add an assertion for the new opening so it cannot drift back to a commit-or-range-only gate".

## Design decisions

- The new opening uses the entry's suggested wording verbatim, so the sentence a reader checks against the backlog entry is the one that landed (Assumption 1).
- The reworded sentence stays on the same line as the old one. The pull request description cites `ai/tasks/feature/review-pull-request.md` by line number, and a one-line-for-one-line swap keeps every one of those anchors pointing where it did (Assumption 2).
- The trailing "Each one falls back to `aggregate` scope rather than stopping the review:" sentence is kept as written, since it carries the fallback rule Requirement 4 preserves (Assumption 1).
- Step 0 item 4 is unchanged. It already records any `scope:` value as given and defaults to `aggregate`, so the unknown-keyword case reaches item 5 with its raw value intact (Assumption 3).
- `product/specs/pull-request-review.md` is unchanged. It already lists an unknown keyword among the fallback examples, and this fix brings the playbook into line with it (Assumption 4).

## Preserved behavior

1. Every review safeguard stays in the review task in every scope. Negative assertion: the edit must not remove or reword the no-fix, no-tooling, clean-tree, dedupe, backlog-only commit, open pull request, or content-as-data rule text. Test: `scripts/review-pull-request-scope.test.mjs` "keeps the %s rule".
2. The hexadecimal check stays ahead of the first git command. Negative assertion: the edit must not move the hexadecimal check after the `git rev-parse --verify` check or drop its never-placed-in-a-command or quoting rules. Test: `scripts/review-pull-request-scope.test.mjs` "checks scope SHAs as hexadecimal before any git command receives them".
3. The range checks keep their numbering and order. Negative assertion: the edit must not renumber or reorder checks 7, 8, and 9, or drop the merge-base allowance. Test: `scripts/review-pull-request-scope.test.mjs` "requires a range base on the pull request or at its merge base".
4. A wrong change-set statistic in a description is proposed for removal rather than correction. Negative assertion: the edit must not touch the review task's statistics wording. Test: `scripts/pr-description-statistics-guideline.test.mjs` "removes a stated statistic instead of correcting it".

## Assumptions

1. The current opening gates the checks on two keywords, at `ai/tasks/feature/review-pull-request.md:61` "For a `commit` or `range` request, apply these checks in order and stop at the first that applies. Each one falls back to `aggregate` scope rather than stopping the review".
2. The first check is the unknown-keyword check, at `ai/tasks/feature/review-pull-request.md:62` "The keyword is not `commit`, `range`, or `aggregate`."
3. Step 0 records the raw scope value without judging it, at `ai/tasks/feature/review-pull-request.md:49` "record the requested scope and its raw value exactly as given".
4. The spec already names an unknown keyword as a fallback case, at `product/specs/pull-request-review.md:5` "Examples are an unknown keyword".
5. The server test project collects script tests, at `vitest.config.ts:14` "'scripts/**/*.test.mjs'".

## Existing functionality

1. The report line that shows an ignored scope value, at `ai/tasks/feature/review-pull-request.md:314` "aggregate — requested \"<value>\" ignored".
2. The playbook-wording assertions for the review task, at `scripts/review-pull-request-scope.test.mjs:26` "describe('the review-pull-request scope argument'".

## Implementation steps

Both steps land as one checkpoint and one commit. The build command after each step is `$janissary/scripts/run.mjs check-diff`.

1. In `ai/tasks/feature/review-pull-request.md` Step 1 item 5, replace "For a `commit` or `range` request, apply these checks in order and stop at the first that applies." with "For any other request, apply these checks in order and stop at the first that applies." Keep "An `aggregate` request needs no check." before it and "Each one falls back to `aggregate` scope rather than stopping the review:" after it, on the same line. Leave the nine checks, the quoting paragraph, the fallback-recording paragraph, Step 0, Step 3, and Step 7 unchanged.
2. In `scripts/review-pull-request-scope.test.mjs`, add one `it` in the existing `describe` that reads the review task and asserts it contains the new opening, no longer contains "For a `commit` or `range` request", and places the new opening before the unknown-keyword check.

## UI design

None. The change edits an agent playbook and adds no user interface.

## Tests

The plan changes no application behavior and adds no application code. `scripts/review-pull-request-scope.test.mjs` gains one assertion covering three scenarios: the new opening is present (Requirements 1 and 2), the commit-or-range-only gate is gone (Requirement 3), and the opening comes before the unknown-keyword check it now covers (Requirement 4). Its existing assertions and `scripts/pr-description-statistics-guideline.test.mjs` keep passing (Preserved behavior 1 to 4). No test can exercise an agent reading the gate, so Verification confirms the item by reading it.

## Out of scope

- The nine checks themselves, their order, and the fallback-recording paragraph are unchanged.
- Step 0 item 4, the spec, and `ai/tasks/feature/build-a-complex-feature.md` are unchanged.
- The pull request description is unchanged, including its How to verify step that still counts seven checks.
- The other backlog entry on this pull request, which anchors the description's behavior examples, is not touched.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff` and confirm `scripts/review-pull-request-scope.test.mjs`, including the new assertion, and `scripts/pr-description-statistics-guideline.test.mjs` pass.
2. Read `ai/tasks/feature/review-pull-request.md` Step 1 item 5. Confirm it reads "An `aggregate` request needs no check. For any other request, apply these checks in order and stop at the first that applies. Each one falls back to `aggregate` scope rather than stopping the review:" on line 61, followed by the same nine checks numbered 1 to 9 with check 1 the unknown-keyword check. A failure looks like the phrase "For a `commit` or `range` request" still present, a change to any check's wording or number, or the item moved off line 61.
