# Keep the no-plan Promise: form available to aggregate reviews in the review report's closing note

**Complexity: 2/10** — 9 behavioral requirements, 1 changed playbook line in 1 task file, 3 test scenarios (p=4.16)

## Goal

The note after the Step 7 report template in `review-pull-request.md` says that in `aggregate` scope the `Promise:`, `Coverage:`, and `Findings:` lines "take their first forms". The `Promise:` line's second form, "none in the PR — used the PR body and commit subjects", is also an aggregate form: Step 2 item 6 tells an aggregate review of a pull request with no own plan to use the description and commit subjects and say so in the report. Read literally, the note rules out the form that review must write, so it may report a plan path and fix-plan count it doesn't have. This fix rewords the note so an aggregate `Promise:` line names the own plan and its fix plans, or reads the no-plan form when Step 2 item 6 found no own plan, and pins the wording with a test.

## Requirements

1. The note says aggregate scope, including a fallback, gives the `Promise:`, `Coverage:`, and `Findings:` lines the forms that check promises, per the entry "replace \"take their first forms\" with wording that says those lines take the forms that count promise items".
2. The note says an aggregate `Promise:` line reads `<own plan path> and <n> fix plans` when there is an own plan, per the entry "with the `Promise:` line naming the own plan and its fix plans".
3. The note says an aggregate `Promise:` line reads `none in the PR — used the PR body and commit subjects` when Step 2 item 6 found no own plan, per the entry "or, when Step 2 item 6 found no own plan, reading \"none in the PR — used the PR body and commit subjects\"".
4. The note no longer tells every aggregate review to take the first form of all three lines, per the entry's issue "read literally the note rules out the form an aggregate review of a pull request with no own plan must use".
5. The note's sentences on commit and range scopes and on an empty scope stay as written, per the entry "Keep the following sentences on commit and range scopes and on an empty scope unchanged".
6. The note stays on its one line, per the entry "keep the paragraph on its one line so the description's anchors into the file, including lines 312 and 314, still land".
7. `scripts/review-pull-request-scope.test.mjs` asserts the new note wording and the absence of the old one, per `ai/tasks/feature/work-pull-request-issue.md` Forbidden rule 3 "Every fix needs tests that cover the changed behavior".
8. The pull request description's anchor into the test file that the new test moves is re-derived and corrected, per the delegating instruction "if lines do shift ... re-derive and correct them from the branch head".
9. The `### Review and recording` spec paragraph says an aggregate review of a pull request with no own plan reports that it judged against the description and commit subjects, per `ai/tasks/feature/work-pull-request-issue.md` Step 5 "Every fix must be reflected in the functional specs".

## Design decisions

- The rewrite replaces only the first sentence of the note in place, so `review-pull-request.md` keeps 326 lines and every description anchor into it, including lines 312 and 314, holds (Assumption 1 and Assumption 3).
- The rewritten sentence keeps the three lines as its subject and pairs "the forms that check promises" with the unchanged "the forms that name no promises", so the following sentence's "they" still reads as all three lines (Assumption 1).
- The note names Step 2 item 6 as the condition for the no-plan form, so the note, the template, and the step that decides the form point at each other (Assumption 2).
- The new test goes after the last existing test, so no test name the description cites moves and only the end of its `34-135` assertion range changes (Assumption 4).
- The test file's header comment gains the new pinned behavior on its existing last line, so no line in the file moves except the new test's own (Assumption 5).
- The spec sentence goes on the existing line 5, so the description's `product/specs/pull-request-review.md:5` and `:33` anchors hold (Assumption 6).

## Preserved behavior

1. Commit and range scopes report the forms that name no promises. Negative assertion: the note's commit-and-range sentence and the template's `none — commit and range scopes check no promises` form must not change. Test: `scripts/review-pull-request-scope.test.mjs` "applies every rule in every scope".
2. Every review safeguard applies in every scope. Negative assertion: no Forbidden rule changes. Test: `scripts/review-pull-request-scope.test.mjs` "keeps the %s rule".
3. A wrong change-set statistic in a description is proposed for removal rather than correction. Negative assertion: the review's statistics wording must not change. Test: `scripts/pr-description-statistics-guideline.test.mjs` "removes a stated statistic instead of correcting it".

## Assumptions

1. The note sits at `ai/tasks/feature/review-pull-request.md:324` "In `aggregate` scope, including a fallback, the `Promise:`, `Coverage:`, and `Findings:` lines take their first forms. In `commit` and `range` scopes they take the forms that name no promises."
2. The template's `Promise:` line at `ai/tasks/feature/review-pull-request.md:315` reads "<own plan path> and <n> fix plans | none in the PR — used the PR body and commit subjects | none — commit and range scopes check no promises", and Step 2 item 6 at `ai/tasks/feature/review-pull-request.md:104` reads "**If there is no own plan, don't stop.**" and ends "and say so in the report".
3. The pull request description cites `ai/tasks/feature/review-pull-request.md:312` and line 314 and does not quote the note.
4. The pull request description cites `scripts/review-pull-request-scope.test.mjs:34-135` and the tests at lines 38, 42, 46, 53, 65, 74, 88, 98, 102, and 123, all at or before line 135.
5. The header comment's last line is `scripts/review-pull-request-scope.test.mjs:15` "And they pin that commit and range scopes read code at their end commit, never switching checkout."
6. The spec's report sentence sits at `product/specs/pull-request-review.md:5` "Its report names its scope and states how many changed files it covered, and in aggregate scope how many promise items."

## Existing functionality

1. Playbook wording pinned by `toContain` and `not.toContain` assertions, at `scripts/review-pull-request-scope.test.mjs:130` "expect(text).not.toContain(\"`git grep '<pattern>' '<sha>'`\")".

## Implementation steps

The change is one checkpoint and one commit. Its build command is `$janissary/scripts/run.mjs check-diff`.

1. In `ai/tasks/feature/review-pull-request.md` line 324, replace the note's first sentence with one saying that in `aggregate` scope, including a fallback, the three lines take the forms that check promises: `Promise:` reads `<own plan path> and <n> fix plans`, or `none in the PR — used the PR body and commit subjects` when Step 2 item 6 found no own plan, and `Coverage:` and `Findings:` take their first forms. Leave the commit-and-range and empty-scope sentences as written, and keep the line count at 326.
2. In `scripts/review-pull-request-scope.test.mjs`, extend header line 15 with the new pinned behavior, and add one `it` after the last test that asserts the new sentence, asserts the old "and `Findings:` lines take their first forms" text is gone, and asserts the note comes after the template's `Promise:` line.
3. In `product/specs/pull-request-review.md` line 5, add one sentence after the report sentence saying an aggregate review of a pull request with no plan of its own reports that it judged against the description and commit subjects.
4. After the push, re-derive the description's anchors into both files with `grep -n` and correct the `34-135` assertion range to its new end. Leave every other description paragraph as written.

## UI design

None. The change is to an agent playbook, a spec, and a script test.

## Tests

`scripts/review-pull-request-scope.test.mjs` gains one test, "keeps the no-plan Promise: form available to aggregate reviews", covering three scenarios: the new sentence with both aggregate `Promise:` forms is present (Requirements 1 to 3), the old take-their-first-forms sentence is gone (Requirement 4), and the note follows the template it describes. Requirements 5 and 6 are covered by the reading check in Verification and by the existing tests, which keep passing. Requirements 8 and 9 are checked by reading.

## Out of scope

- The Step 7 report template, Step 2 item 6, and the commit body wording are unchanged.
- The note's commit-and-range and empty-scope sentences are unchanged.
- Completed plans that describe the old note are historical records and stay as written.
- Every other pull request description paragraph is unchanged.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff` and confirm `scripts/review-pull-request-scope.test.mjs` and `scripts/pr-description-statistics-guideline.test.mjs` pass.
2. Read Step 2 item 6 (line 104), the Step 7 template's `Promise:` line (line 315), and the note (line 324) of `ai/tasks/feature/review-pull-request.md` as an aggregate reviewer of a pull request with no own plan. Confirm all three lead you to write `Promise: none in the PR — used the PR body and commit subjects`, and confirm `wc -l` still reports 326 lines. A failure looks like a note that still requires the first form, or a moved line.
3. Run `grep -n` for each line the pull request description cites in `scripts/review-pull-request-scope.test.mjs` and `ai/tasks/feature/review-pull-request.md`, and confirm every anchor points at the text it names.
