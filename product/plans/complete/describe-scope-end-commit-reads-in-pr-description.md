# Describe commit and range reviews reading code at their scope's end commit in the pull request description

**Complexity: 2/10** — no production code or files edited, 21 requirements, 0 test scenarios (p=3.76)

## Goal

Pull request 2207 changes Step 3 of `ai/tasks/feature/review-pull-request.md` so a commit or range review reads each added or modified file at its scope's end commit with `git show`, searches there with `git grep`, never switches the checkout, and drops a candidate a later commit already resolved at `HEAD`. It also adds `git grep` to the Allowed list and makes "already resolved at `HEAD` by a later commit" part of the first drop reason. The pull request description mentions none of this. It says the Allowed list gains only `git rev-parse` and `git merge-base`, its sentence on the new test stops at the decline test, and How to verify has no step for it. This fix adds a few anchored sentences so a reviewer approving from the description sees the newly allowed command and the new drop rule. It also re-derives the description's `scripts/review-pull-request-scope.test.mjs` assertion span at the branch head and corrects it if it has moved.

## Requirements

1. The sentence "To run them, the Allowed list gains `git rev-parse` and `git merge-base`." also names `git grep`, from the entry: "change \"To run them, the Allowed list gains `git rev-parse` and `git merge-base`.\" so it also names `git grep`".
2. New sentences say a commit or range review's diff can end before `HEAD`, from the entry: "a commit or range review's diff can end before `HEAD`".
3. The sentences say it reads each added or modified file at the scope's end commit with `git show`, from the entry: "it reads each added or modified file at the scope's end commit with `git show`".
4. The sentences say it runs its reference, caller, and consumer searches there with `git grep`, from the entry: "runs its reference, caller, and consumer searches there with `git grep`".
5. The sentences say it never switches the checkout, from the entry: "never switches the checkout".
6. The sentences say that before recording a candidate it reads the same file at `HEAD` and drops the candidate when a later commit already resolved it, from the entry: "before recording a candidate reads the same file at `HEAD` and drops the candidate when a later commit already resolved it".
7. The sentences are anchored to the Allowed list and to the Step 3 paragraph beginning "This step's commands are written with `origin/master...HEAD`", from the entry: "Anchor them ... to the Allowed list and the Step 3 paragraph beginning \"This step's commands are written with `origin/master...HEAD`\" in `ai/tasks/feature/review-pull-request.md`".
8. The sentences are anchored to the drop-reason paragraph beginning "A candidate is dropped for one of five reasons", from the entry: "to the drop-reason paragraph beginning \"A candidate is dropped for one of five reasons\"".
9. The sentences are anchored to the "Review and recording" paragraph of `product/specs/pull-request-review.md`, from the entry: "and to the \"Review and recording\" paragraph of `product/specs/pull-request-review.md`".
10. Every new line anchor is re-derived with `grep -n` at the branch head, from the entry: "with line numbers re-derived by `grep -n` at the branch head".
11. The sentence about `scripts/review-pull-request-scope.test.mjs` is extended with the end-commit test at its `it` line, from the entry: "Extend the sentence about `scripts/review-pull-request-scope.test.mjs` with the `reads commit and range scopes at the scope's end commit without switching the checkout` test at its `it` line".
12. Under Edge cases, a new step's Do reads that Step 3 paragraph, from the entry: "add a step whose Do reads that Step 3 paragraph".
13. That step's Expect quotes "Neither command switches the checkout, so the working tree and branch stay exactly as Step 1 left them.", from the entry: "whose Expect quotes \"Neither command switches the checkout, so the working tree and branch stay exactly as Step 1 left them.\"".
14. That step's Expect names the end-commit test as its assertion, from the entry: "names that test as its assertion".
15. The `git grep` command text quoted in the description is the branch's wording, from the entry: "If an earlier repair on this branch has already changed the `git grep` command text, quote the branch's wording".
16. The happy-path claim that the test file's assertions are at `scripts/review-pull-request-scope.test.mjs:34-134` is re-derived at the branch head and corrected only if the span has moved, from the delegating instruction: "Re-derive that span from the branch head and correct it in the same edit".
17. The new prose cites no change-set statistics or commit SHAs, from the entry: "Cite no change-set statistics or commit SHAs".
18. The new prose uses no em dashes, from the entry: "use no em dashes in new prose".
19. No other sentence and not the title changes, from the entry: "change no other sentence or the title".
20. A diff of the saved and live bodies shows only those changes, from the entry: "diff the saved and live bodies to confirm only those changes landed".
21. No playbook, spec, script, or test is edited, from the entry: "Edit no playbook, spec, script, or test".

## Design decisions

- The `git grep` mention joins the existing "To run them" sentence as a trailing clause anchored to the Allowed list, so the sentence that already lists the new commands lists all three (assumption 2).
- The end-commit sentences go at the end of "The review now reads a `scope:` argument" paragraph, after "Every SHA the review does place in a command is single-quoted (line 72).", because that paragraph describes commit and range review behavior and its bare "line N" anchors already point into `ai/tasks/feature/review-pull-request.md` (assumptions 1 and 3).
- The spec is cited as `product/specs/pull-request-review.md:5`, the paragraph under its "Review and recording" heading (assumption 5).
- The test-sentence extension follows that sentence's convention, where a bare "line N" points into `scripts/review-pull-request-scope.test.mjs` (assumption 6).
- The new Edge cases step is numbered 11 and matches the existing steps' title, Do, and Expect shape.
- The assertion span stays `34-134` if the re-derivation at the branch head gives the same span, because Requirement 16 corrects it only if it moved (assumption 7).
- The added prose uses no em dashes, per `ai/guidelines/human-writing-guidelines.md`.

## Preserved behavior

None found

## Assumptions

1. The description's scope paragraph holds "To run them, the Allowed list gains `git rev-parse` and `git merge-base`." and ends with "Every SHA the review does place in a command is single-quoted (line 72).", read with `gh pr view 2207 --json body`.
2. The Allowed list names `git grep`: `ai/tasks/feature/review-pull-request.md:27` "`git show`, `git grep`, `git status`, `git rev-parse`, `git merge-base`".
3. The Step 3 paragraph: `ai/tasks/feature/review-pull-request.md:122` "This step's commands are written with `origin/master...HEAD`", holding "`git show '<sha>:<path>'`", "`git grep '<pattern>' '<sha>'`", and "Neither command switches the checkout, so the working tree and branch stay exactly as Step 1 left them."
4. The drop-reason paragraph: `ai/tasks/feature/review-pull-request.md:168` "A candidate is dropped for one of five reasons. It might be wrong once you read the surrounding code, or, in `commit` and `range` scopes, already resolved at `HEAD` by a later commit."
5. The spec's "Review and recording" paragraph: `product/specs/pull-request-review.md:5` "A commit or range review can end before the branch's latest commit, so it reads the code around each change as it stood at the end of its scope".
6. The end-commit test's `it` line: `scripts/review-pull-request-scope.test.mjs:123` "reads commit and range scopes at the scope's end commit without switching the checkout".
7. The test file has 136 lines at the branch head. Its first `it` is at `scripts/review-pull-request-scope.test.mjs:34` "applies every rule in every scope" and its last assertion is at `scripts/review-pull-request-scope.test.mjs:134` "expect(text.indexOf(rightSide)).toBeLessThan(text.indexOf('### Review each file'));", so the assertion span is 34-134.
8. Every existing anchor in the body points into a file, not into the description, and this fix edits no file, so no existing anchor moves.

## Existing functionality

1. `gh pr edit --body-file` replaces the body from a file, as Step 8 item 5 prescribes: `ai/tasks/feature/work-pull-request-issue.md:151` "gh pr edit <reference> --body-file ./temp/pr-body.md".

## Implementation steps

1. Write this fix plan and remove the resolved entry from `product/backlog/pull-request.md`, leaving the other entries byte-for-byte unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Commit and push to `tasks/review-pull-request-scope`.
3. After the push, read the body with `gh pr view 2207 --json body` and save a copy. Extend the "To run them" sentence with `git grep` (line 27). Add the end-commit sentences at the end of the scope paragraph, anchored as (line 122), (line 168), and `product/specs/pull-request-review.md:5`. Extend the test sentence's last clause with the end-commit test at line 123. Re-derive the `34-134` span and correct it only if it moved. Add Edge cases step 11 after step 10.
4. Write the full revised body to `./temp/pr-body.md`, apply it with `gh pr edit 2207 --body-file ./temp/pr-body.md`, then diff the saved and live bodies.

## UI design

None. The change is to a pull request description on GitHub.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. No test covers the pull request description, and tests of documentation are not introduced. The existing end-commit test at `scripts/review-pull-request-scope.test.mjs:123` already pins the behavior the new sentences describe.

## Out of scope

- Every playbook, spec, script, and test file. The entry corrects only the description.
- The title and every other sentence of the description.
- The other backlog entries: the `git grep -e` fix and Step 7's closing note.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then run `gh pr view 2207 --json body` and diff it against the saved body. The changed lines should be the scope paragraph, with `git grep` added to the "To run them" sentence and the end-commit sentences after "single-quoted (line 72).", the test sentence in the "Everything is playbook text" paragraph, now ending with the end-commit test at line 123, and a new Edge cases step 11 after step 10. Any other changed line means the correction overreached. Read each new anchor at the branch head: line 27 of `ai/tasks/feature/review-pull-request.md` should be the Allowed list naming `git grep`, line 122 the Step 3 paragraph beginning "This step's commands are written with `origin/master...HEAD`", line 168 the paragraph beginning "A candidate is dropped for one of five reasons", line 5 of `product/specs/pull-request-review.md` the "Review and recording" paragraph, and line 123 of `scripts/review-pull-request-scope.test.mjs` the end-commit test's `it` line. Lines 34 and 134 of that test file should be the first `it` line and the last assertion. A different line at any of those anchors shows the description cites the wrong text.
