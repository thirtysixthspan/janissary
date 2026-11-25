# Read commit and range scopes' surrounding code at the scope's end commit

**Complexity: 3/10** — 12 behavioral requirements, ~3 changed playbook lines in 1 task file, 6 test scenarios (p=4.70)

## Goal

A commit or range review can now end at a commit older than the checked-out `HEAD`, but Step 3 of `review-pull-request.md` still tells the reviewer to open each modified file at `HEAD` and to `grep` the working tree for references. So a focused review of an earlier commit reads its hunks against later code, records findings later commits already fixed, and misses ones the later code masks. This fix has commit and range reviews read files and search for references at the scope's end commit with read-only `git show` and `git grep`, then check `HEAD` before recording a candidate, so a finding a later commit already resolved is dropped. The review stays plan-free in those scopes, never switches the checkout, and still runs no build, lint, or test tooling.

## Requirements

1. In `commit` and `range` scopes, Step 3 states that the diff's right side is `<sha>` or `<head>`, which may be older than `HEAD`, per the entry "add that in `commit` and `range` scopes the diff's right side is `<sha>` or `<head>`, which may be older than `HEAD`".
2. In those scopes the reviewer reads an added or modified file at the scope's end commit with `git show '<sha>:<path>'`, per the entry "The reviewer reads an added or modified file at that commit with `git show '<sha>:<path>'`".
3. In those scopes the reviewer runs the Deleted and Renamed reference checks against the scope's end commit with `git grep '<pattern>' '<sha>'`, per the entry "runs the Deleted and Renamed reference checks against that commit with `git grep '<pattern>' '<sha>'`".
4. In a range scope `<head>` stands in for `<sha>` in both commands, following from the entry's "the diff's right side is `<sha>` or `<head>`".
5. Before recording a candidate in those scopes, the reviewer reads the same file at `HEAD` to confirm no later commit has already resolved it, per the entry "Before recording a candidate, the reviewer reads the same file at `HEAD` to confirm no later commit has already resolved it".
6. A candidate a later commit has already resolved is dropped, per the entry "drops the candidate if one has".
7. `git grep` joins the Allowed list's read-only git commands, per the entry "Add `git grep` to the Allowed list's read-only git commands".
8. Reading at the scope's end commit never changes the checkout, so the working tree and branch stay exactly as Step 1 left them, per the delegating instruction "any approach that has the review check out an older commit must leave the working tree and branch exactly as Step 1 left them (prefer reading files at the scope's end commit with `git show <sha>:<path>` over switching the checkout)".
9. Commit and range scopes still read no plan, build no promise list, and judge only functionality gaps, technical debt, and security, per the settled user decision "commit and range scopes in review-pull-request.md read no plan, build no promise list, and judge only functionality gaps, technical debt, and security".
10. `scripts/review-pull-request-scope.test.mjs` pins the new sentence, per the entry "Add an assertion to `scripts/review-pull-request-scope.test.mjs` that pins the new sentence".
11. The pull request description's line anchors into `scripts/review-pull-request-scope.test.mjs` and `ai/tasks/feature/review-pull-request.md` match the branch head after the edit, per the entry "re-derive those anchors with `grep -n` after the edit and correct any that moved".
12. The `### Review and recording` spec paragraph says a commit or range review reads surrounding code as it stood at the end of its scope and drops a finding a later commit already resolved, per `ai/tasks/feature/work-pull-request-issue.md` Step 5 "Every fix must be reflected in the functional specs".

## Design decisions

- The new text is appended to the existing Step 3 paragraph that substitutes the scope's diff into every command, rather than added as a new paragraph, so no line in `review-pull-request.md` moves and the description's many anchors into it stay valid (Assumption 1 and Assumption 4).
- The file-status bullets under "Review each file" are left as written. The appended sentences override their `HEAD` and `grep` wording in commit and range scopes, the same way the existing paragraph already overrides their `origin/master...HEAD` commands (Assumption 2).
- The end-commit search covers the "Follow each change past the edge of the diff" callers and consumers check too, not only the Deleted and Renamed reference checks, because that check also reads surrounding code and would otherwise read later code (Assumption 3).
- The already-resolved drop is folded into the first of the five drop reasons ("wrong once you read the surrounding code"), so the "one of five reasons" count stays true and the Forbidden rule 9 phrase "Step 3's drop rules" covers it (Assumption 5).
- Reading uses `git show` and `git grep` against the commit, never `git checkout`, so Step 1's clean tree and branch are untouched and Step 5's `git add -A` sweeps nothing extra (Assumption 6).
- The new commands quote every SHA, path, and pattern in single quotes, so Step 1 item 5's single-quote rule, which already names Step 3, covers them unchanged (Assumption 7).

## Preserved behavior

1. Every review safeguard applies in every scope. Negative assertion: the Forbidden rules for fixing, tooling, a clean tree, dedupe, backlog-only commits, the open pull request, and content as data must not change. Test: `scripts/review-pull-request-scope.test.mjs` "keeps the %s rule".
2. Scope SHAs are checked as lowercase hexadecimal before any git command receives them and are single-quoted in every command. Negative assertion: the hex check, its ordering before `git rev-parse --verify`, and the single-quote sentence must not change. Test: `scripts/review-pull-request-scope.test.mjs` "checks scope SHAs as hexadecimal before any git command receives them".
3. The review stays plan-free in commit and range scopes. Negative assertion: `review-pull-request.md` must not gain any "later subplan" text. Test: `scripts/review-pull-request-scope.test.mjs` "declines focused findings that a later subplan delivers before any repair".
4. A wrong change-set statistic in the description is proposed for removal. Negative assertion: the review task's removal wording must not change. Test: `scripts/pr-description-statistics-guideline.test.mjs` asserting "the proposal removes the claim rather than correcting it".

## Assumptions

1. The paragraph that substitutes the scope's diff sits at `ai/tasks/feature/review-pull-request.md:122` "In `commit` and `range` scopes, substitute the scope's diff for it in every command."
2. The Modified rule opens files at `HEAD`, at `ai/tasks/feature/review-pull-request.md:135` "read every hunk, then open the file at `HEAD` around each one", and the Deleted rule greps the working tree, at `ai/tasks/feature/review-pull-request.md:136` "`grep` for anything that still refers to it".
3. Step 3 follows changes past the diff's edge, at `ai/tasks/feature/review-pull-request.md:142` "Check the callers of a changed function, the consumers of a changed contract".
4. The pull request description cites `review-pull-request.md` lines after 122, for example "Step 1 item 5's check 8, line 69", "(line 124)", and "line 154 of the same file".
5. Step 3 counts its drop reasons, at `ai/tasks/feature/review-pull-request.md:168` "A candidate is dropped for one of five reasons. It might be wrong once you read the surrounding code."
6. Step 1 requires a clean tree because Step 5 stages everything, at `ai/tasks/feature/review-pull-request.md:60` "the commit in Step 5 stages everything with `git add -A`".
7. The single-quote rule covers Step 3, at `ai/tasks/feature/review-pull-request.md:72` "Every SHA placed in a command, in these checks and in Step 3, is wrapped in single quotes".

## Existing functionality

1. The Allowed list of read-only git commands, at `ai/tasks/feature/review-pull-request.md:27` "Run read-only `git` and `gh` commands (`git diff`, `git log`, `git show`".
2. The per-scope diff list naming `<sha>` and `<head>` as each scope's right side, at `ai/tasks/feature/review-pull-request.md:119` "**`commit`:** `git diff <sha>^ <sha>`".
3. Playbook wording pinned by a script test, at `scripts/review-pull-request-scope.test.mjs:64` "checks scope SHAs as hexadecimal before any git command receives them".
4. The commit and range spec sentences, at `product/specs/pull-request-review.md:5` "A commit or range scope with no changes is a clean review."

## Implementation steps

The change is one checkpoint and one commit. Its build command is `$janissary/scripts/run.mjs check-diff`.

1. In `ai/tasks/feature/review-pull-request.md`, add `git grep` after `git show` in the Allowed list. Append to the Step 3 paragraph at line 122: in those scopes the diff's right side is `<sha>` or `<head>`, which may be older than `HEAD`; read an added or modified file at that commit with `git show '<sha>:<path>'`; run the Deleted and Renamed reference checks and the callers and consumers search against it with `git grep '<pattern>' '<sha>'`, with `<head>` for a range; before recording a candidate, read the same file at `HEAD` and drop the candidate if a later commit already resolved it; neither command switches the checkout. Extend the first drop reason at line 168 to cover a candidate already resolved at `HEAD` in those scopes. Keep each edit on its existing line so no line number moves.
2. In `product/specs/pull-request-review.md`, add a sentence to the `### Review and recording` paragraph after "A commit or range scope with no changes is a clean review." saying such a review reads surrounding code as it stood at the end of its scope and drops a finding a later commit already resolved.
3. In `scripts/review-pull-request-scope.test.mjs`, add a test that pins the new sentences and their position after the per-scope diff list, and name the behavior in the header comment.
4. After the push, re-derive the description's line anchors into both files from the branch head with `grep -n` and correct only those that moved.

## UI design

None. The change is to an agent playbook, a spec, and a script test.

## Tests

`scripts/review-pull-request-scope.test.mjs` gains one test, "reads commit and range scopes at the scope's end commit without switching the checkout", which asserts that `review-pull-request.md` contains the right-side sentence (Requirement 1), the `git show '<sha>:<path>'` command (Requirement 2), the `git grep '<pattern>' '<sha>'` command (Requirement 3), the `<head>` substitution (Requirement 4), the `HEAD` confirmation (Requirement 5), the drop (Requirement 6), `git grep` in the Allowed list (Requirement 7), and the unswitched checkout (Requirement 8), and that the right-side sentence sits after the per-scope diff list and before "### Review each file". Requirement 9 is covered by the unchanged "declines focused findings that a later subplan delivers before any repair" assertion that the review has no "later subplan" text, plus Preserved behavior 1 and 2. Requirements 11 and 12 are checked by reading in Verification.

## Out of scope

- Step 1 item 5's checks, the per-scope diff list, and every Forbidden rule are unchanged.
- No plan reading, promise list, or description and plan fidelity returns to commit or range scopes.
- `ai/tasks/feature/build-a-complex-feature.md` is unchanged.
- The aggregate scope is unchanged; its right side is `HEAD`, so its reads already match.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff` and confirm `scripts/review-pull-request-scope.test.mjs` and `scripts/pr-description-statistics-guideline.test.mjs` pass with every existing assertion unchanged.
2. Read Step 3 of `ai/tasks/feature/review-pull-request.md` as a reviewer given `scope: commit <sha>` where `<sha>` is two commits behind `HEAD` and a later commit fixed a bug in its hunk. Confirm the paragraph at line 122 sends you to `git show '<sha>:<path>'` and `git grep '<pattern>' '<sha>'` rather than the working tree, that you then read the file at `HEAD`, see the fix, and drop the candidate, and that nothing tells you to run `git checkout`. Confirm `wc -l` still reports 326 lines. A failure looks like any instruction to switch the checkout, any plan or promise text in those scopes, or a moved line number.
3. Run `grep -n` for each line the pull request description cites in both files and confirm every anchor in the updated description points at the text it names.
