# Decline focused-review findings that ask for work the plan placed out of scope for the feature

**Complexity: 3/10** — 14 behavioral requirements, ~4 changed playbook lines in 1 task file, 6 test scenarios (p=4.85)

## Goal

A commit-scoped focused review reads no plan, so the review's "Out of scope" drop rule never applies to it. Step 6 item 2 of `build-a-complex-feature.md` declines an entry only when a later subplan owns its work, so a finding that asks for behavior the current work unit's plan deliberately excluded from the feature, and that no later subplan owns, is worked as a repair. In the single-plan route nothing is ever declined, so every such finding is worked. This fix extends the existing later-subplan decline in Step 6 item 2 so the orchestrator also declines entries the current work unit's `Out of scope` list excludes, in both routes. The review task stays plan-free.

## Requirements

1. Step 6 item 2 removes each entry whose proposal delivers behavior the current work unit's `Out of scope` list excludes and that no later subplan owns, per the entry "extend the decline so it also removes each entry whose proposal delivers behavior the current work unit's `Out of scope` list excludes and that no later subplan owns".
2. In the single-plan route, the `Out of scope` list item 2 compares against is the source plan's own, per the entry "in the single-plan route that list is the source plan's own".
3. Step 6 item 2 keeps its later-subplan clause "Remove each entry whose proposal delivers behavior a later subplan owns", per the entry "keep the existing later-subplan clause".
4. Step 6 item 2 keeps its whole-entry removal, skeleton restore, backlog-only commit and push, and the PR head SHA record that follows them, per the entry "the whole-entry removal, the skeleton restore, the backlog-only commit and push, and the PR head SHA record that follows them".
5. When the final subplan or the single-plan route's sole work unit is under review, the item says only the later-subplan decline cannot apply while the out-of-scope decline still does, per the entry "Reword ... so it says only the later-subplan decline cannot apply there while the out-of-scope decline still does".
6. Each entry declined as out of scope is recorded for the Step 10 `Declined:` line with "out of scope" in place of an owning subplan, per the entry "Record each such entry for the Step 10 `Declined:` line with \"out of scope\" in place of an owning subplan".
7. The Step 10 `Declined:` placeholder says an entry may be named as out of scope, per the entry "widen that line's placeholder to say so".
8. The orchestration rule beginning "Each subplan review covers only its newly published implementation commit" names the out-of-scope decline, per the entry "Narrow the orchestration rule bullet ... to match".
9. The opening paragraph's "decline any finding that a later subplan delivers" names the out-of-scope decline, per the entry "and the opening paragraph's ... to match".
10. `ai/tasks/feature/review-pull-request.md` is unchanged, per the entry "Leave `ai/tasks/feature/review-pull-request.md` untouched so commit and range scopes stay plan-free".
11. The "Staged reviews for complex features" spec paragraph says a focused finding that asks for work the plan excluded from the feature is declined the same way, per the entry "say a focused finding that asks for work the plan excluded from the feature is declined the same way".
12. The spec no longer says none of the final subplan's findings are declined, per the entry "correct \"The final subplan has no later subplan, so none of its findings are declined\"".
13. `scripts/review-pull-request-scope.test.mjs` pins the out-of-scope decline wording and the reworded no-later-subplan sentence, and names the new behavior in its header comment, per the entry "extend the `declines focused findings that a later subplan delivers before any repair` test".
14. The pull request description's line anchors into `scripts/review-pull-request-scope.test.mjs` that the test edit shifts are re-derived at the branch head and corrected, per the entry "re-derive them with `grep -n` at the branch head and correct only those".

## Design decisions

- The decline is folded into the existing Step 6 item 2 sentence rather than added as a new mechanism or item, so the "skip to item 6" and item 5's "repeat items 2 through 4" stay valid and a resolution review's findings pass through it too (Assumption 3).
- The out-of-scope decline reads the current work unit's `Out of scope` list, which item 2 already reads for the later-subplan decline (Assumption 2). It removes only entries no later subplan owns, so an entry a later subplan owns is still named with that subplan.
- Item 2 stays one line, and the header comment of the test file keeps its line count, so the description's anchors into the playbook, the spec, and the test file's lines before the decline test do not move (Assumption 5).
- The review task is not touched: commit and range scopes read no plan (Assumption 1).

## Preserved behavior

1. The review stays plan-free. Negative assertion: `ai/tasks/feature/review-pull-request.md` must gain no "later subplan" text. Test: `scripts/review-pull-request-scope.test.mjs` "declines focused findings that a later subplan delivers before any repair".
2. The later-subplan decline is committed and pushed before the PR head SHA is recorded. Negative assertion: the decline sentence must not move after the publish sentence, and the publish sentence must not move after the PR head SHA record. Test: `scripts/review-pull-request-scope.test.mjs` "declines focused findings that a later subplan delivers before any repair".
3. The complex-feature workflow passes scopes rather than override prose. Negative assertion: the `scope: commit` and `scope: range` argument texts must not change. Test: `scripts/review-pull-request-scope.test.mjs` "is passed by the complex-feature workflow instead of override prose".
4. Step 6 has no description-only shortcut. Negative assertion: no "If every recorded entry was description-only" text may return. Test: `scripts/review-pull-request-scope.test.mjs` "leaves no description-only shortcut in the focused review cycle".

## Assumptions

1. Commit and range scopes skip plan discovery, at `ai/tasks/feature/review-pull-request.md:84` "read no plan, collect no fix plans, and build no promise list", and the functionality-gap drop rule at `ai/tasks/feature/review-pull-request.md:124` "the functionality-gap rule about a plan's \"Out of scope\" section has nothing to apply to".
2. Step 6 item 2 already reads the current work unit's out-of-scope list, at `ai/tasks/feature/build-a-complex-feature.md:84` "Compare each entry's proposal with the current subplan's `Out of scope` list".
3. Step 6 item 2 is the only decline point and item 5 repeats it, at `ai/tasks/feature/build-a-complex-feature.md:84` "Remove each entry whose proposal delivers behavior a later subplan owns" and `ai/tasks/feature/build-a-complex-feature.md:87` "repeat items 2 through 4".
4. In the single-plan route a subplan reference means the source plan, at `ai/tasks/feature/build-a-complex-feature.md:19` "every reference to a subplan means the sole source-plan work unit".
5. The pull request description cites the test file's assertion block as `scripts/review-pull-request-scope.test.mjs:34-128`, and its other anchors into that file (lines 38, 42, 46, 53, 65, 74, 88, 98) all precede the decline test at `scripts/review-pull-request-scope.test.mjs:102` "declines focused findings that a later subplan delivers before any repair".

## Existing functionality

1. The later-subplan decline with whole-entry removal, skeleton restore, and backlog-only publish, at `ai/tasks/feature/build-a-complex-feature.md:84` "Remove each entry whose proposal delivers behavior a later subplan owns, whole".
2. The Step 10 report line for declined findings, at `ai/tasks/feature/build-a-complex-feature.md:148` "Declined:   <each focused or resolution finding declined in Step 6".
3. The test that pins the decline, at `scripts/review-pull-request-scope.test.mjs:102` "declines focused findings that a later subplan delivers before any repair".

## Implementation steps

The change is one checkpoint and one commit. Its build command is `$janissary/scripts/run.mjs check-diff`.

1. In `ai/tasks/feature/build-a-complex-feature.md` Step 6 item 2, widen the opening decline sentence and its rationale to cover work the plan excluded from the feature, say the `Out of scope` list in the single-plan route is the source plan's own, add the out-of-scope removal clause after the later-subplan clause, record out-of-scope entries with "out of scope" for the report, and reword the no-later-subplan sentence so only the later-subplan decline is ruled out. Keep the item on one line.
2. In the same file, narrow the orchestration rule at line 21 and the opening paragraph at line 3 to name the out-of-scope decline, and widen the `Declined:` placeholder at line 148.
3. In `product/specs/pull-request-review.md`, in the "Findings from each focused review" paragraph, add that a finding asking for work the plan excluded from the feature is declined the same way, and correct the final-subplan sentence, keeping the paragraph on one line.
4. In `scripts/review-pull-request-scope.test.mjs`, extend the decline test and reword the header comment's decline sentence without changing the header's line count.
5. After the push, re-derive the description's anchors into the test file with `grep -n` and correct only those that moved.

## UI design

None. The change is to an agent playbook, a spec, and a script test.

## Tests

`scripts/review-pull-request-scope.test.mjs` "declines focused findings that a later subplan delivers before any repair" gains assertions that `build-a-complex-feature.md` contains the out-of-scope removal clause before the publish sentence (Requirement 1), the single-plan route sentence (Requirement 2), the reworded no-later-subplan sentence and not the old one (Requirement 5), the "out of scope" report record (Requirement 6), and the widened `Declined:` placeholder (Requirement 7). Its existing later-subplan clause, ordering, and review-plan-free assertions stay (Requirements 3, 4, and 10). Requirements 8, 9, 11, 12, and 14 are checked by reading in Verification.

## Out of scope

- `ai/tasks/feature/review-pull-request.md` is unchanged: no plan reading or promise checks in commit or range scope.
- Step 7's coverage map check and Step 8's aggregate review are unchanged.
- The other entries in `./product/backlog/pull-request.md` are not worked here.
- No new pull request description sections or text beyond the shifted anchors.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff` and confirm `scripts/review-pull-request-scope.test.mjs` passes.
2. Read Step 6 item 2 of `ai/tasks/feature/build-a-complex-feature.md` as an orchestrator on the single-plan route whose focused review recorded a finding the source plan's `Out of scope` list excludes. Confirm the entry is removed, the removal is committed and pushed before the PR head SHA is recorded, the entry is recorded with "out of scope" for the `Declined:` line, and it never reaches item 3. A failure looks like a sentence that still says no entry is declined in that route, or any change to `ai/tasks/feature/review-pull-request.md`.
3. Read the "Staged reviews for complex features" paragraph of `product/specs/pull-request-review.md` and confirm it says an out-of-scope finding is declined and no longer says none of the final subplan's findings are declined.
