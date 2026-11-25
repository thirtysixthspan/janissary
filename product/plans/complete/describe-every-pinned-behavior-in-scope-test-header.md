# Make the review scope test's header comment name every behavior it pins

**Complexity: 2/10** — no production code or files edited, 13 requirements, 9 preserved-test scenarios (p=4.29)

## Goal

The header comment of `scripts/review-pull-request-scope.test.mjs` says the file pins three things, the safeguards in every scope, the bare-invocation default, and the absence of override prose, and then closes with "Nothing else." The repairs on this pull request added five more tests below it: the `Scope:` report check, the hexadecimal SHA check, the range-base check, the unknown-keyword gate, and the missing description-only shortcut. A maintainer who trusts "Nothing else." could read those as scope creep and delete them. This fix rewrites the comment so it names every behavior the `describe` block pins and drops the closing claim. The comment grows, so the pull request description's line anchors into the file move with it.

## Requirements

1. The header comment says every scope keeps the review's safeguards, from the entry: "every scope keeps the review's safeguards".
2. The header comment says a bare invocation reviews the full pull request, from the entry: "a bare invocation reviews the full pull request".
3. The header comment says the complex-feature workflow passes scopes rather than override prose, from the entry: "the complex-feature workflow passes scopes rather than override prose".
4. The header comment says a focused or resolution review that reports another scope blocks the workflow, from the entry: "a focused or resolution review that reports another scope blocks the workflow".
5. The header comment says scope SHAs are checked as lowercase hexadecimal before any git command, from the entry: "scope SHAs are checked as lowercase hexadecimal before any git command".
6. The header comment says scope SHAs are quoted when placed in a command, from the entry: "and quoted when placed in one".
7. The header comment says a range base must lie on the pull request or be its merge base, from the entry: "a range base must lie on the pull request or be its merge base".
8. The header comment says every non-aggregate request is validated, an unknown keyword included, from the entry: "every non-aggregate request is validated including an unknown keyword".
9. The header comment says Step 6 has no description-only shortcut, from the entry: "Step 6 has no description-only shortcut".
10. The header comment no longer ends with "Nothing else.", from the invocation: "instead of ending with \"Nothing else.\"".
11. No assertion in the file changes, from the entry: "Change no assertion."
12. Every pull request description anchor into the file lands on the line it cited before the edit, from the entry: "If the comment's line count changes, the pull request description's anchors into this file (the assertion span and each `it` line it cites) shift, so re-derive them with `grep -n` and correct them in the same repair."
13. Every other sentence of the description, and the title, stay exactly as they are, from the delegating invocation: "Leave all other description text untouched."

## Design decisions

- The comment grows from four lines to eight. The entry names nine behaviors, and fitting them into four lines under the 100-column `printWidth` would crowd them past readability, so the anchors are corrected instead (Assumption 3).
- The first three behaviors keep their current wording so the existing sentence reads as it did. The other six follow in a second sentence that opens "They also pin", in the order the tests appear (Assumption 1).
- "Nothing else." is dropped rather than kept. The list is complete today, but the closing claim is what turns a future unlisted assertion into apparent scope creep (Assumption 2).
- Every description anchor into the file moves down by exactly the four added lines. They all sit at or after line 27, below the comment (Assumption 4).
- Only digits change in the description. "The new file's assertions" span keeps its meaning, the first `it` through the last `it`'s closing line, so `27-93` becomes `31-97` (Assumption 4).
- No spec changes. The comment documents a test, and `product/specs/` describes no test file and no comment (Assumption 5).

## Preserved behavior

1. Every scope applies every review rule. Negative assertion: the edit must not touch the `applies every rule in every scope` assertion. Test: `scripts/review-pull-request-scope.test.mjs` "applies every rule in every scope".
2. Every safeguard is still pinned. Negative assertion: the edit must not change the `SAFEGUARDS` table. Test: `scripts/review-pull-request-scope.test.mjs` "keeps the %s rule".
3. A bare invocation still reviews the full pull request. Negative assertion: the edit must not change its literal. Test: `scripts/review-pull-request-scope.test.mjs` "reviews the full pull request when no scope is given".
4. The complex-feature workflow still passes scopes. Negative assertion: the edit must not drop the override-prose check. Test: `scripts/review-pull-request-scope.test.mjs` "is passed by the complex-feature workflow instead of override prose".
5. A mis-scoped review still blocks the workflow. Negative assertion: the edit must not change any of that test's literals. Test: `scripts/review-pull-request-scope.test.mjs` "blocks a focused or resolution review that did not run in its requested scope".
6. Scope SHAs are still checked as hexadecimal first. Negative assertion: the edit must not change the ordering check. Test: `scripts/review-pull-request-scope.test.mjs` "checks scope SHAs as hexadecimal before any git command receives them".
7. A range base is still bounded. Negative assertion: the edit must not change the check order. Test: `scripts/review-pull-request-scope.test.mjs` "requires a range base on the pull request or at its merge base".
8. Every non-aggregate scope is still validated. Negative assertion: the edit must not change the keyword check. Test: `scripts/review-pull-request-scope.test.mjs` "validates every requested scope other than aggregate, including an unknown keyword".
9. No description-only shortcut returns. Negative assertion: the edit must not change the `not.toContain` literal. Test: `scripts/review-pull-request-scope.test.mjs` "leaves no description-only shortcut in the focused review cycle".

## Assumptions

1. The comment's current three behaviors sit at `scripts/review-pull-request-scope.test.mjs:6` "These assertions pin that every scope keeps the review's" through line 8 "complex-feature workflow passes scopes rather than override prose. Nothing else.", and the tests follow in the order listed in Requirements 4 to 9, at lines 46, 58, 67, 81, and 91.
2. The comment's closing claim is `scripts/review-pull-request-scope.test.mjs:8` "Nothing else.".
3. The project formats at 100 columns, `.prettierrc:5` "\"printWidth\": 100".
4. The description's anchors into the file all sit at or after the first test, `scripts/review-pull-request-scope.test.mjs:27` "it('applies every rule in every scope'". They are `:27-93`, `:31`, `:35`, `:39`, `:46`, and `:91`, plus "line 46", "line 58", "line 67", and "line 81" in the "What" section's sentence about the new script test.
5. The review spec doesn't cite the test file, `product/specs/pull-request-review.md:5` "A commit or range review reads no plan and checks no promises."

## Existing functionality

1. `gh pr edit --body-file` replaces the body from a file, `ai/tasks/feature/work-pull-request-issue.md:151` "gh pr edit <reference> --body-file ./temp/pr-body.md".

## Implementation steps

1. In `scripts/review-pull-request-scope.test.mjs`, rewrite the comment at lines 5 to 8. Keep its first two sentences through "complex-feature workflow passes scopes rather than override prose." Add a sentence that opens "They also pin" and names Requirements 4 to 9 in test order. Drop "Nothing else.". Wrap at 100 columns. Touch nothing below line 9. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Remove the resolved entry from `product/backlog/pull-request.md`, restoring the master skeleton, and promote this plan. Commit and push to `tasks/review-pull-request-scope`. Build command: `$janissary/scripts/run.mjs check-diff`.
3. After the push, re-derive each anchor with `grep -n` against the pushed file. Read the body with `gh pr view 2207 --json body` and save a copy. Move each anchor in Assumption 4 down by four lines: `:27-93` to `:31-97`, `:31` to `:35`, `:35` to `:39`, `:39` to `:43`, `:46` to `:50`, `:91` to `:95`, and "line 46", "line 58", "line 67", and "line 81" to "line 50", "line 62", "line 71", and "line 85". Write the body to `./temp/pr-body.md`, apply it with `gh pr edit 2207 --body-file ./temp/pr-body.md`, and diff the saved and live bodies.

## UI design

None. The change edits a test file's comment and a pull request description.

## Tests

The plan changes no application behavior and adds no code. It rewrites a comment, so no new assertion is added. Every assertion in `scripts/review-pull-request-scope.test.mjs` must keep passing unchanged (Preserved behavior 1 to 9, Requirement 11). Verification confirms Requirements 1 to 10, 12, and 13 by reading.

## Out of scope

- Every assertion, literal, and test name in `scripts/review-pull-request-scope.test.mjs`.
- Every playbook and spec on the branch.
- The pull request title and every description sentence apart from the anchors into this file.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff` and confirm `scripts/review-pull-request-scope.test.mjs` passes with the same test count as before.
2. Run `git diff origin/tasks/review-pull-request-scope -- scripts/review-pull-request-scope.test.mjs` before committing. Only lines 5 to 8 should change, into lines 5 to 12. A changed line at 13 or later means an assertion moved or changed.
3. Read the new comment. Confirm it names all nine behaviors and no longer says "Nothing else.".
4. After the description edit, diff the saved and live bodies. Only the ten anchors in Implementation step 3 should change. Then read each new line in the file. Line 31 should open "applies every rule in every scope", line 35 `it.each(SAFEGUARDS)`, line 39 the bare-invocation test, line 43 the complex-feature test, line 50 the mis-scoped-review test, line 62 the hexadecimal test, line 71 the range-base test, line 85 the keyword test, line 95 the description-only test, and line 97 should close that last test. A blank, a comment, or a different test at any of them means an anchor is still wrong.
