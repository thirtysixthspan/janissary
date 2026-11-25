# Realign the review-scope pull request description's line anchors with the branch text

**Complexity: 1/10** — no production code or files edited, 12 requirements, 0 test scenarios (p=3.39)

## Goal

Pull request 2207's description points readers at exact lines of the branch so they can check each claim against the task text. The repairs since the description was written added text above several of those lines, so seven anchors now land on a heading, a separator, or a different test. This fix moves each stale anchor back onto the line it cites at the current branch head and confirms every other anchor in the body still lands. A reviewer following any anchor then reaches the sentence or test the description is talking about.

## Requirements

1. The "What" paragraph's `git diff <base>..<head>` anchor names the `range` bullet of Step 3 in `ai/tasks/feature/review-pull-request.md`, from the entry: "the `git diff <base>..<head>` anchor moves from line 112 to the `range` bullet of Step 3".
2. The "What" paragraph's Step 2 skip anchor names the "This step runs only in `aggregate` scope" sentence, from the entry: "the Step 2 skip anchor moves from line 80 to the \"This step runs only in `aggregate` scope\" sentence".
3. The "What" paragraph's three-dimensions anchor names the "In `commit` and `range` scopes, skip the promise passes" paragraph, from the entry: "the three-dimensions anchor moves from line 120 to the \"In `commit` and `range` scopes, skip the promise passes\" paragraph".
4. The report sentence's anchor names the Step 7 code block's `PR:` line, from the entry: "The report sentence's `ai/tasks/feature/review-pull-request.md:310` moves to the Step 7 code block's `PR:` line".
5. How to verify step 1 bounds the new test's assertions at the span of the `describe` block's assertions, from the entry: "step 1's `scripts/review-pull-request-scope.test.mjs:27-49` becomes the span of the `describe` block's assertions".
6. How to verify step 3's Step 2 opening anchor names the "This step runs only in `aggregate` scope" line, from the entry: "step 3's \"line 80\" ... become line 84".
7. How to verify step 3's Step 3 opening anchor spans the per-scope diff list through the skip-the-promise-passes paragraph, from the entry: "\"lines 112-120\" become ... lines 116-124".
8. How to verify step 7's test anchor names the "leaves no description-only shortcut in the focused review cycle" test, from the entry: "step 7's `scripts/review-pull-request-scope.test.mjs:46` becomes the line of the \"leaves no description-only shortcut in the focused review cycle\" test".
9. Every line number is re-derived against the branch head at the time of the repair, from the entry: "Re-derive every number with `grep -n` against the branch head at the time of the repair rather than copying the numbers above".
10. Every other anchor in the body lands on the text it cites at the branch head, from the entry: "check every other anchor in the body against the branch head ... and correct any that no longer land on the text they cite".
11. Every other sentence of the body, and the title, stay exactly as they are, from the entry: "change only the stale anchors, leaving every other sentence and the title untouched".
12. The corrected body cites no change-set statistics or commit SHAs, from the entry: "add no change-set statistics or commit SHAs".

## Design decisions

- Only line numbers change. Each stale anchor keeps its surrounding wording, so the before-and-after body diff shows nothing but digits, and that diff is the whole verification (assumptions 1 to 5).
- The re-derived numbers match the entry's at the current head: line 120 for the `range` bullet, line 84 for the Step 2 skip, line 124 for the three dimensions, line 312 for `PR:`, lines 116 to 124 for Step 3's opening, lines 27 to 90 for the assertions, and line 88 for the description-only test (assumptions 1 to 5).
- Step 3's opening anchor starts at line 116, the "The authoritative diff depends on the effective scope" sentence, not at the `## Step 3` heading. That's where the Expect's claims begin (assumption 3).
- The other anchors stay. Each was checked against the branch head and still lands on the text it cites (assumptions 6 to 10), so requirement 10 needs no further edit.

## Preserved behavior

None found

## Assumptions

1. Step 3's `range` bullet sits at `ai/tasks/feature/review-pull-request.md:120` "- **`range`:** `git diff <base>..<head>`".
2. Step 2's scope sentence sits at `ai/tasks/feature/review-pull-request.md:84` "**This step runs only in `aggregate` scope.**", while line 80 is a `---` separator.
3. Step 3's per-scope diff list opens at `ai/tasks/feature/review-pull-request.md:116` "The authoritative diff depends on the effective scope from Step 1:" and the skip paragraph sits at line 124 "**In `commit` and `range` scopes, skip the promise passes.**", while line 112 is the `## Step 3` heading.
4. The Step 7 report's first template line sits at `ai/tasks/feature/review-pull-request.md:312` "PR:             <url> (#<number>)", while line 310 is blank.
5. The test file's assertions run from `scripts/review-pull-request-scope.test.mjs:27` "it('applies every rule in every scope'" to line 90, and the description-only test sits at line 88 "it('leaves no description-only shortcut in the focused review cycle'", while line 46 holds "it('blocks a focused or resolution review that did not run in its requested scope'".
6. `ai/tasks/feature/review-pull-request.md` still lands at lines 7 "The scope is optional and defaults to `aggregate`", 49 "**Read the scope.**", 61 "**Validate the scope.**", 62 "The keyword is not `commit`, `range`, or `aggregate`.", 70 "`git merge-base --is-ancestor <base> <head>` fails.", 74 "also record the raw value you ignored", 154 "A scope whose diff holds no changes has nothing to review.", 314 "aggregate — requested \"<value>\" ignored", and 29 to 40 "### Forbidden — no exceptions" through "**Committing anything other than `./product/backlog/pull-request.md`.**".
7. `ai/tasks/feature/build-a-complex-feature.md` still lands at lines 22 "A full-PR review in Step 8", 83 "`scope: commit <implementation commit SHA>`", 86 "`scope: range <recorded head SHA>..<current PR head SHA>`", and 88 "6. Finish only when", so lines 83 to 88 are Step 6's six items.
8. Master's `ai/tasks/feature/build-a-complex-feature.md:83` still holds "Override its Step 2 and Step 3".
9. `ai/tasks/feature/build-a-feature.md:114` still holds "it finds the completed plan from the PR's first commit".
10. The test anchors still land at `scripts/review-pull-request-scope.test.mjs:31` "it.each(SAFEGUARDS)('keeps the %s rule'", line 35 "it('reviews the full pull request when no scope is given'", and line 39 "it('is passed by the complex-feature workflow instead of override prose'".

## Existing functionality

1. `gh pr edit --body-file` replaces the body from a file, as Step 8 item 5 of `ai/tasks/feature/work-pull-request-issue.md` prescribes: `ai/tasks/feature/work-pull-request-issue.md:151` "gh pr edit <reference> --body-file ./temp/pr-body.md".

## Implementation steps

1. Write this fix plan and remove the resolved entry from `product/backlog/pull-request.md`, leaving the other two entries byte-for-byte unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Commit and push to `tasks/review-pull-request-scope`.
3. After the push, read the body with `gh pr view 2207 --json body`, save a copy of it, and change seven anchors:
   1. "What": "(line 112)" becomes "(line 120)", "(line 80)" becomes "(line 84)", and "(line 120)" becomes "(line 124)".
   2. Behavior examples: `ai/tasks/feature/review-pull-request.md:310` becomes `ai/tasks/feature/review-pull-request.md:312`.
   3. How to verify step 1: `scripts/review-pull-request-scope.test.mjs:27-49` becomes `scripts/review-pull-request-scope.test.mjs:27-90`.
   4. How to verify step 3: "(line 80)" becomes "(line 84)" and "(lines 112-120)" becomes "(lines 116-124)".
   5. How to verify step 7: `scripts/review-pull-request-scope.test.mjs:46` becomes `scripts/review-pull-request-scope.test.mjs:88`.
4. Write the full revised body to `./temp/pr-body.md`, apply it with `gh pr edit 2207 --body-file ./temp/pr-body.md`, then diff the saved and live bodies.

## UI design

None. The change is to a pull request description on GitHub.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. No test covers the pull request description, and tests of documentation are not introduced.

## Out of scope

- Every playbook, spec, script, and test file. The entry corrects only the description.
- The title and every sentence of the description other than the anchors.
- The scope safeguards the description doesn't yet mention, and the abbreviated range ends in Step 6 item 4. The other two backlog entries cover them.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then run `gh pr view 2207 --json body` and diff it against the saved body: the only changed tokens should be the seven line numbers above, and any other change means the correction overreached. Read each new anchor at the branch head. Line 120 of `ai/tasks/feature/review-pull-request.md` should hold the `range` bullet, line 84 the "This step runs only in `aggregate` scope" sentence, line 124 the skip-the-promise-passes paragraph, line 312 the `PR:` template line, and lines 116 to 124 the per-scope diff list through that paragraph. Line 88 of `scripts/review-pull-request-scope.test.mjs` should open the "leaves no description-only shortcut in the focused review cycle" test, and line 90 should close the `describe` block. A heading, separator, blank line, or different test at any of those lines shows the anchor is still wrong.
