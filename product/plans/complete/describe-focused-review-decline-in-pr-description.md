# Describe the focused cycle's decline of later-subplan and out-of-scope findings in the pull request description

**Complexity: 2/10** — no production code or files edited, 21 requirements, 0 test scenarios (p=3.76)

## Goal

Pull request 2207 adds a step to the complex-feature workflow that removes recorded review findings without repairing them. Step 6 item 2 of `ai/tasks/feature/build-a-complex-feature.md` declines each focused or resolution finding a later subplan delivers, and each one the plan's `Out of scope` list excludes from the feature when no later subplan owns it. It publishes that removal before it records the resolution range's base, and the Step 10 report names each declined finding on a new `Declined:` line. The pull request description never mentions any of it. Its "What" section says only that item 2 no longer records each entry's full text or classifies it, its sentence on the new test stops at the unknown-keyword gate, and How to verify has no step for it. This fix adds a few anchored sentences describing the step as it exists at the branch head, covering both kinds of declined finding, so a reviewer approving from the description learns that the orchestrator now drops findings on its own judgment.

## Requirements

1. In "The callers change to match." paragraph, after the sentence that begins "Step 6 item 2 also no longer records each entry's full text", new sentences describe the decline step, from the entry: "after the sentence that begins \"Step 6 item 2 also no longer records each entry's full text\", add sentences".
2. The sentences give the reason as a commit-scoped review reading no subplan, from the entry: "because a commit-scoped review reads no subplan".
3. The sentences say item 2 compares each entry with the current subplan's `Out of scope` list, the `Requirements` of every later subplan, and the coverage map, from the entry: "compares each entry with the current subplan's `Out of scope` list, the `Requirements` of every later subplan, and the coverage map".
4. The sentences say item 2 removes each entry whose proposal delivers behavior a later subplan owns, from the entry: "removes each entry whose proposal delivers behavior a later subplan owns".
5. The sentences say item 2 also removes each entry the `Out of scope` list excludes when no later subplan owns it, from the delegating instruction: "extended that same decline step ... so it also declines findings the current work unit's Out of scope list excludes and no later subplan owns".
6. The sentences say item 2 commits and pushes that removal before it records the PR head SHA that starts the resolution range, from the entry: "commits and pushes that removal before it records the PR head SHA that starts the resolution range".
7. The sentences say the final subplan and the single-plan route's sole work unit decline nothing for a later subplan, from the entry: "declines nothing for the final subplan or the single-plan route's sole work unit", as reworded on the branch by the out-of-scope repair.
8. The sentences say the out-of-scope decline still applies to that final work unit, from the branch's item 2: "no entry is declined for a later subplan, but the out-of-scope decline still applies".
9. The sentences say the Step 10 report names each declined entry with its owning subplan, or as "out of scope", on a new `Declined:` line, from the entry: "names each declined entry with its owning subplan on a new `Declined:` line of the Step 10 report", and the delegating instruction: "recorded as \"out of scope\" on the Declined: line".
10. The sentences are anchored to Step 6 item 2 and to the `Declined:` report line of `ai/tasks/feature/build-a-complex-feature.md`, from the entry: "Anchor them ... to Step 6 item 2 and the `Declined:` report line of `ai/tasks/feature/build-a-complex-feature.md`".
11. The sentences are anchored to the "Findings from each focused review" paragraph of `product/specs/pull-request-review.md`, from the entry: "and to the \"Findings from each focused review\" paragraph of `product/specs/pull-request-review.md`".
12. Every new line anchor is re-derived with `grep -n` at the branch head, from the entry: "with line numbers re-derived by `grep -n` at the branch head".
13. The sentence about `scripts/review-pull-request-scope.test.mjs` is extended with the `declines focused findings that a later subplan delivers before any repair` test at its `it` line, from the entry: "Extend the sentence about `scripts/review-pull-request-scope.test.mjs` with the `declines focused findings that a later subplan delivers before any repair` test at its `it` line".
14. Under Edge cases, a step after step 9 has a Do that reads Step 6 item 2, from the entry: "add a step after step 9 whose Do reads Step 6 item 2".
15. That step's Expect quotes the branch's wording of the decline, from the entry: "whose Expect quotes \"Remove each entry whose proposal delivers behavior a later subplan owns\"" and "If an earlier repair on this branch has already reworded item 2, describe and quote the wording on the branch instead".
16. That step's Expect names the decline test as its assertion, from the entry: "names that test as its assertion".
17. The new prose cites no change-set statistics or commit SHAs, from the entry: "Cite no change-set statistics or commit SHAs".
18. The new prose uses no em dashes, from the entry: "use no em dashes in new prose".
19. No other sentence and not the title changes, from the entry: "change no other sentence or the title".
20. A diff of the saved and live bodies shows only those additions, from the entry: "diff the saved and live bodies to confirm only those additions landed".
21. No playbook, spec, script, or test is edited, from the entry: "Edit no playbook, spec, script, or test".

## Design decisions

- The decline sentences follow "Step 6 item 2 also no longer records each entry's full text or classifies it, ..." and precede "A resolution review now reviews only the repair commits", so the paragraph finishes describing item 2 before it moves to item 4's resolution review (assumption 1).
- The step is described as it reads at the branch head, with both the later-subplan decline and the out-of-scope decline, because the out-of-scope repair already reworded item 2 (assumptions 2 and 3).
- The new sentences follow the paragraph's anchor convention: a bare "line N" means `ai/tasks/feature/build-a-complex-feature.md`, and other files are cited as `path:line` (assumption 4).
- The test-sentence extension follows that sentence's convention, where a bare "line N" points into `scripts/review-pull-request-scope.test.mjs` (assumption 5).
- The new Edge cases step is numbered 10 and matches the existing steps' title, Do, and Expect shape (assumption 6).
- The added prose uses no em dashes, per `ai/guidelines/human-writing-guidelines.md`.

## Preserved behavior

None found

## Assumptions

1. The description's "The callers change to match." paragraph holds "Step 6 item 2 also no longer records each entry's full text or classifies it, because the resolution review no longer reads the entries and the old Step 6.4 was the only other reader." followed by "A resolution review now reviews only the repair commits", read with `gh pr view 2207 --json body`.
2. Step 6 item 2 declines both kinds of finding: `ai/tasks/feature/build-a-complex-feature.md:84` "Remove each entry whose proposal delivers behavior a later subplan owns, and each entry whose proposal delivers behavior the current subplan's `Out of scope` list excludes and no later subplan owns".
3. The final work unit still declines out-of-scope work: `ai/tasks/feature/build-a-complex-feature.md:84` "no later subplan exists, so no entry is declined for a later subplan, but the out-of-scope decline still applies".
4. The `Declined:` report line sits in Step 10's report template: `ai/tasks/feature/build-a-complex-feature.md:148` "Declined:   <each focused or resolution finding declined in Step 6, with the later subplan that owns it, or \"out of scope\"".
5. The spec states the decline: `product/specs/pull-request-review.md:33` "Before any repair starts, the workflow declines each finding whose remedy is work a later subplan owns rather than working it".
6. The decline test's `it` line: `scripts/review-pull-request-scope.test.mjs:102` "declines focused findings that a later subplan delivers before any repair".
7. Every existing anchor in the body points into a file, not into the description, and this fix edits no file, so no existing anchor moves.

## Existing functionality

1. `gh pr edit --body-file` replaces the body from a file, as Step 8 item 5 prescribes: `ai/tasks/feature/work-pull-request-issue.md:151` "gh pr edit <reference> --body-file ./temp/pr-body.md".

## Implementation steps

1. Write this fix plan and remove the resolved entry from `product/backlog/pull-request.md`, leaving the other entries byte-for-byte unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Commit and push to `tasks/review-pull-request-scope`.
3. After the push, read the body with `gh pr view 2207 --json body` and save a copy. Add the decline sentences after the "Step 6 item 2 also no longer records" sentence, anchored as (line 84; `product/specs/pull-request-review.md:33`) and (line 148). Extend the test sentence's last clause with the decline test at line 102. Add Edge cases step 10 after step 9.
4. Write the full revised body to `./temp/pr-body.md`, apply it with `gh pr edit 2207 --body-file ./temp/pr-body.md`, then diff the saved and live bodies.

## UI design

None. The change is to a pull request description on GitHub.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. No test covers the pull request description, and tests of documentation are not introduced. The existing decline test at `scripts/review-pull-request-scope.test.mjs:102` already pins the behavior the new sentences describe.

## Out of scope

- Every playbook, spec, script, and test file. The entry corrects only the description.
- The title and every other sentence of the description, including existing anchors that may have drifted.
- The other backlog entries: the end-commit reading and `git grep` description, the `git grep -e` fix, and Step 7's closing note.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then run `gh pr view 2207 --json body` and diff it against the saved body: the changed lines should be "The callers change to match." paragraph, with the new sentences between "the old Step 6.4 was the only other reader." and "A resolution review now reviews only the repair commits", the test sentence in the next paragraph, now ending with the decline test at line 102, and a new Edge cases step 10 after step 9. Any other changed line means the correction overreached. Read each new anchor at the branch head: line 84 of `ai/tasks/feature/build-a-complex-feature.md` should be Step 6 item 2, line 148 should be the `Declined:` report line, line 33 of `product/specs/pull-request-review.md` should hold "Findings from each focused review", and line 102 of `scripts/review-pull-request-scope.test.mjs` should be the decline test's `it` line. A different line at any of those anchors shows the description cites the wrong text.
