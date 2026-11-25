# Pass the scoped review's reference-search pattern to git grep behind -e

**Complexity: 2/10** — 10 behavioral requirements, 1 changed playbook line in 1 task file, 2 test scenarios (p=4.12)

## Goal

Step 3 of `review-pull-request.md` tells a commit or range review to search the scope's end commit with `git grep '<pattern>' '<sha>'`. The pattern comes first with no `-e`, so a pattern that starts with a dash is read as a `git grep` option. Tracing the callers of a `--ignore-scripts` flag fails with "unknown option", and a pattern such as `-v` or `-l` silently changes what is searched. This fix writes the command as `git grep -e '<pattern>' '<sha>' --` and says why, so a dash-led pattern is always searched for as text. It also updates the scope test to pin the new form and corrects the pull request description where it quotes the old command or cites a test line the edit moves.

## Requirements

1. The Step 3 paragraph's search command reads `git grep -e '<pattern>' '<sha>' --`, per the entry "change `git grep '<pattern>' '<sha>'` to `git grep -e '<pattern>' '<sha>' --`".
2. The paragraph says the pattern always follows `-e`, so a pattern that starts with `-` is searched for rather than read as an option, per the entry "add one sentence saying the pattern always follows `-e`, so a pattern that starts with `-` is searched for rather than read as an option".
3. The paragraph stays on its one line, per the entry "Keep that paragraph on its one line so the description's line anchors into the file hold".
4. The range substitution sentence stays, per the entry "keep \"In a range scope, put `<head>` in place of `<sha>` in both commands.\"".
5. The Allowed list is unchanged, per the entry "leave the Allowed list as it is".
6. The scope test asserts the new command form, per the entry "update the `git grep` literal the `reads commit and range scopes at the scope's end commit without switching the checkout` test asserts to the new form".
7. The scope test asserts the old `git grep '<pattern>' '<sha>'` text is gone, per the entry "add an assertion that the old `git grep '<pattern>' '<sha>'` text is gone".
8. A pull request description anchor into the test file that the test edit shifts is re-derived and corrected, per the entry "If the test edit shifts any line the pull request description cites in that file, re-derive it with `grep -n` at the branch head and correct only that anchor".
9. A pull request description quote of the old `git grep` command form is corrected to the new form, per the delegating instruction "if the description quotes the exact `git grep` command form you change, the work item names those anchors and that quote, so re-derive and correct them from the branch head".
10. The `### Review and recording` spec paragraph says a dash-led search term is searched for as text, per `ai/tasks/feature/work-pull-request-issue.md` Step 5 "Every fix must be reflected in the functional specs".

## Design decisions

- The edit replaces the command inside the existing sentence and appends the new sentence to the same line, so `review-pull-request.md` keeps 326 lines and every description anchor into it holds (Assumption 1 and Assumption 3).
- The trailing `--` closes the revision list, so `'<sha>'` is never read as a path and no path argument is needed (Assumption 4).
- The new assertion goes directly after the updated `git grep` assertion, inside the existing test, so the test name stays on line 123 and only the closing line of the file's assertions moves (Assumption 2).
- The spec sentence goes on the existing line 5 so the description's `product/specs/pull-request-review.md:5` and `:33` anchors hold (Assumption 5).
- Description corrections touch only the two quotes of the command and the test-file range anchor that moves, leaving every other paragraph exactly as written (Assumption 6).

## Preserved behavior

1. Commit and range reviews read at the scope's end commit without switching the checkout. Negative assertion: the right-side sentence, the `git show '<sha>:<path>'` command, the range substitution, the `HEAD` confirmation, and the unswitched-checkout sentence must not change. Test: `scripts/review-pull-request-scope.test.mjs` "reads commit and range scopes at the scope's end commit without switching the checkout".
2. Every review safeguard applies in every scope. Negative assertion: no Forbidden rule changes. Test: `scripts/review-pull-request-scope.test.mjs` "keeps the %s rule".
3. Scope SHAs are single-quoted in every command. Negative assertion: the single-quote sentence must not change, and `'<sha>'` stays quoted in the new command. Test: `scripts/review-pull-request-scope.test.mjs` "checks scope SHAs as hexadecimal before any git command receives them".

## Assumptions

1. The paragraph sits at `ai/tasks/feature/review-pull-request.md:122` "Run the Deleted and Renamed reference checks, and the search for callers and consumers, against it with `git grep '<pattern>' '<sha>'`."
2. The test asserts the old literal at `scripts/review-pull-request-scope.test.mjs:129` "against it with `git grep '<pattern>' '<sha>'`." and its test name sits at `scripts/review-pull-request-scope.test.mjs:123` "reads commit and range scopes at the scope's end commit without switching the checkout".
3. The pull request description cites `scripts/review-pull-request-scope.test.mjs:34-134`, the test at line 123, and `review-pull-request.md` line 122, and quotes `git grep '<pattern>' '<sha>'` in its What paragraph and How to verify item 11.
4. `git grep` documents its usage as `git grep [<options>] [-e] <pattern> [<rev>...] [[--] <path>...]`, and a bare dash-led pattern fails with "unknown option" while `-e` accepts it, confirmed by running both forms at the branch head.
5. The spec's end-commit sentence sits at `product/specs/pull-request-review.md:5` "reads the code around each change as it stood at the end of its scope".
6. Step 8 item 5 of `ai/tasks/feature/work-pull-request-issue.md` says "leave every other paragraph exactly as the author wrote it".

## Existing functionality

1. The single-quote rule for SHAs in Step 3 commands, at `ai/tasks/feature/review-pull-request.md:72` "Every SHA placed in a command, in these checks and in Step 3, is wrapped in single quotes".
2. Playbook wording pinned by `toContain` and `not.toContain` assertions, at `scripts/review-pull-request-scope.test.mjs:111` "expect(text).not.toContain('no later subplan exists and no entry is declined')".

## Implementation steps

The change is one checkpoint and one commit. Its build command is `$janissary/scripts/run.mjs check-diff`.

1. In `ai/tasks/feature/review-pull-request.md` line 122, change `git grep '<pattern>' '<sha>'` to `git grep -e '<pattern>' '<sha>' --`, and after that sentence add one saying the pattern always follows `-e`, so a pattern that starts with `-` is searched for rather than read as an option. Keep the line count at 326.
2. In `scripts/review-pull-request-scope.test.mjs`, update the line 129 literal to the new form and add one `not.toContain` assertion for the old `git grep '<pattern>' '<sha>'` text directly after it.
3. In `product/specs/pull-request-review.md` line 5, add one sentence after the end-commit sentence saying a search term that starts with a dash is searched for as text.
4. After the push, re-derive the description's anchors into the test file with `grep -n`, correct the `34-134` range to its new end, and replace both quotes of the old command with the new form.

## UI design

None. The change is to an agent playbook, a spec, and a script test.

## Tests

`scripts/review-pull-request-scope.test.mjs` "reads commit and range scopes at the scope's end commit without switching the checkout" asserts the new `git grep -e '<pattern>' '<sha>' --` sentence (Requirement 1) and that the old `git grep '<pattern>' '<sha>'` text is gone (Requirement 7, which also covers Requirement 6). Requirements 2 to 5 are covered by its existing assertions and the reading check in Verification. Requirements 8 to 10 are checked by reading.

## Out of scope

- The Allowed list, every Forbidden rule, the per-scope diff list, and the `git show` command are unchanged.
- Aggregate scope's plain `grep` of the working tree is unchanged.
- Completed plans that quote the old command are historical records and stay as written.
- Every other pull request description paragraph is unchanged.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff` and confirm `scripts/review-pull-request-scope.test.mjs` passes with every other assertion unchanged.
2. Read the Step 3 paragraph at line 122 of `ai/tasks/feature/review-pull-request.md` as a commit-scoped reviewer tracing the callers of a `--ignore-scripts` flag. Confirm the command you would build is `git grep -e '--ignore-scripts' '<sha>' --`, and that running it at the branch head lists matches instead of failing with "unknown option `ignore-scripts'". Confirm `wc -l` still reports 326 lines. A failure looks like a pattern placed before `-e` or a moved line.
3. Run `grep -n` for each line the pull request description cites in the test file and confirm every anchor points at the text it names, and that the description no longer contains `git grep '<pattern>' '<sha>'`.
