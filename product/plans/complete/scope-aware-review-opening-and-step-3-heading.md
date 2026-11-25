# Make the review task's opening paragraph and Step 3 heading scope-aware

**Complexity: 2/10** — 6 behavioral requirements, 2 reworded playbook lines in 1 task file, 3 preserved-test scenarios (p=4.00)

## Goal

The review task's first paragraph still tells every run to "review all of it", trace every promise in the plan, the fix plans, and the description, and judge across five dimensions. Its Step 3 heading still reads "Review every changed line and every promise". But a `commit` or `range` scope now reviews one diff, reads no promises, and judges three dimensions. An agent reads the opening first, so a commit-scoped run could build a promise list anyway and record out-of-scope findings. This plan rewords the opening so full coverage and five dimensions belong to the default `aggregate` scope, adds one sentence for the narrower scopes, and retitles Step 3 so it promises every promise only in `aggregate` scope.

## Requirements

1. The opening paragraph describes the full-pull-request coverage as the default `aggregate` scope, per "reword the first paragraph so the full-pull-request coverage and five dimensions are described as the default `aggregate` scope".
2. The opening paragraph ties the five dimensions to `aggregate` scope, per "the full-pull-request coverage and five dimensions are described as the default `aggregate` scope".
3. The opening paragraph says `commit` and `range` scopes review only their diff, per "with one clause saying `commit` and `range` scopes review only their diff across functionality gaps, technical debt, and security".
4. The opening paragraph names functionality gaps, technical debt, and security as the three dimensions those scopes judge, per the same clause.
5. The opening paragraph keeps its finding-recording and no-limit sentences, per "leave the rest of that paragraph ... unchanged".
6. The Step 3 heading no longer promises every promise unconditionally, per "Retitle the Step 3 heading so it no longer promises every promise unconditionally, for example \"Review every changed line in scope and, in aggregate scope, every promise\"".

## Design decisions

- Each edit replaces one line with one line, so `ai/tasks/feature/review-pull-request.md` keeps its line count. The pull request description cites this file by line number (lines 7, 49, 61 to 74, 84, 116 to 124, 154, 312, 314, and others), and a one-for-one swap keeps every one of those anchors pointing where it did (Assumption 3).
- The new heading uses the entry's suggested wording, with `aggregate` in backticks to match how the rest of the file writes scope keywords (Assumption 2).
- The invocation paragraph, the paragraph after the opening, and every rule under "What you may and may not do" stay as written, as the entry asks. Forbidden rule 9 already sits under "Every rule under \"What you may and may not do\" applies in every scope" and Step 3's own scope paragraph, so it is left alone (Assumption 4).
- `product/specs/pull-request-review.md` is unchanged. It already says an aggregate review assesses five dimensions and a commit or range review reads no plan and assesses three, so this fix brings the playbook's opening into line with it (Assumption 5).
- The pull request description is unchanged. It cites neither line 3 nor line 112, and the line count does not move (Assumption 3).

## Preserved behavior

1. Every review safeguard stays in the review task in every scope. Negative assertion: the edit must not remove or reword the no-fix, no-tooling, clean-tree, dedupe, backlog-only commit, open pull request, or content-as-data rule text. Test: `scripts/review-pull-request-scope.test.mjs` "keeps the %s rule".
2. A bare invocation still reviews the full pull request. Negative assertion: the edit must not touch the invocation paragraph's default sentence. Test: `scripts/review-pull-request-scope.test.mjs` "reviews the full pull request when no scope is given".
3. A wrong change-set statistic in a description is proposed for removal rather than correction. Negative assertion: the edit must not touch the sentence "the proposal removes the claim rather than correcting it". Test: `scripts/pr-description-statistics-guideline.test.mjs` "removes a stated statistic instead of correcting it".

## Assumptions

1. The opening paragraph is unconditional, at `ai/tasks/feature/review-pull-request.md:3` "review all of it" and "Judge them across five dimensions".
2. The Step 3 heading is unconditional, at `ai/tasks/feature/review-pull-request.md:112` "## Step 3 — Review every changed line and every promise".
3. The description's anchors into the file sit at or after line 7, for example `ai/tasks/feature/review-pull-request.md:7` "Invocation: `execute ./ai/tasks/feature/review-pull-request.md <target>".
4. Step 3 already limits commit and range scopes to three dimensions, at `ai/tasks/feature/review-pull-request.md:124` "Judge only three of the five dimensions: functionality gaps, technical debt, and security."
5. The spec already ties five dimensions to aggregate scope, at `product/specs/pull-request-review.md:5` "A commit or range review reads no plan and checks no promises."

## Existing functionality

1. Step 3's opening sentence already scopes its coverage, at `ai/tasks/feature/review-pull-request.md:114` "and in `aggregate` scope every promise from Step 2 is traced to the code that keeps it".
2. The playbook-wording assertions for the review task, at `scripts/review-pull-request-scope.test.mjs:26` "describe('the review-pull-request scope argument'".

## Implementation steps

Both steps land as one checkpoint and one commit. The build command after each step is `$janissary/scripts/run.mjs check-diff`.

1. In `ai/tasks/feature/review-pull-request.md` line 3, replace "and review all of it. That means every line its diff adds, changes, or removes, and every promise it makes in its plan, in the fix plans its repairs added, and in its description. Judge them across five dimensions:" with wording that reviews the pull request in the scope its invocation names, says the default `aggregate` scope reviews all of it (every changed line and every promise) and judges five dimensions, and adds one sentence saying a `commit` or `range` scope reviews only its diff, reads no promises, and judges functionality gaps, technical debt, and security. Keep the five dimension descriptions and the two closing sentences word for word. Keep it one line.
2. In the same file, retitle line 112 to "## Step 3 — Review every changed line in scope and, in `aggregate` scope, every promise". Leave line 114 onward unchanged.

## UI design

None. The change edits an agent playbook and adds no user interface.

## Tests

The plan changes no application behavior and adds no code. It rewords prose in an agent playbook, and `ai/guidelines/plan-template.md` says tests of documentation should not be introduced, so no new assertion is added. The existing assertions in `scripts/review-pull-request-scope.test.mjs` and `scripts/pr-description-statistics-guideline.test.mjs` pin the literals this edit must keep, and they must keep passing (Preserved behavior 1 to 3). No test can exercise an agent reading the opening, so Verification confirms Requirements 1 to 6 by reading.

## Out of scope

- The invocation paragraph, the paragraph after the opening, the "What you may and may not do" rules, Step 2, and Step 3 below its heading are unchanged.
- The spec and the pull request description are unchanged.
- The other backlog entry on this pull request, which rewrites the scope test's header comment, is not touched.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff` and confirm `scripts/review-pull-request-scope.test.mjs` and `scripts/pr-description-statistics-guideline.test.mjs` pass.
2. Run `wc -l ai/tasks/feature/review-pull-request.md` and confirm it still reports 326 lines, so the description's anchors hold. Then read line 61 and confirm it still opens with "An `aggregate` request needs no check.", and line 312 is still the Step 7 report's `PR:` line.
3. Read the opening paragraph (line 3), the invocation paragraph (line 7), and Step 3's heading and opening (lines 112 to 124) together. Confirm all three agree: aggregate scope reviews the whole pull request and every promise across five dimensions, and commit and range scopes review only their diff, read no promises, and judge functionality gaps, technical debt, and security. A failure looks like "review all of it" or "Judge them across five dimensions" still stated for every run, a heading that still says "and every promise" without a scope condition, or a line count other than 326.
