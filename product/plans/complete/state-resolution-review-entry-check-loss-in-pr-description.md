# State in the pull request description that resolution reviews no longer check findings against their entries

**Complexity: 1/10** — no production code or files edited, 13 requirements, 0 test scenarios (p=3.44)

## Goal

Pull request 2207's description says the old Step 6.4 shortcut is gone "along with the entry recording that only existed to feed it". On master, Step 6 item 2 called that record "the only place the resolution review can find what was promised", so the claim is wrong. The description also never says that a resolution review no longer confirms each finding was resolved as its entry proposed, which is the largest behavioral loss in the change. This fix corrects the entry-record clause and adds one sentence naming that trade, anchored to the playbook and spec lines that state it, so a reviewer approving from the description sees the gap the plan accepted.

## Requirements

1. In "The callers change to match." paragraph, the clause "along with the entry recording that only existed to feed it" is replaced, from the entry: "replace \"along with the entry recording that only existed to feed it\" with wording that says Step 6 item 2 no longer records each entry's full text or classifies it".
2. The replacement wording gives the reason as the resolution review no longer reading the entries and the old Step 6.4 being the only other reader, from the entry: "because the resolution review no longer reads the entries and the old Step 6.4 was the only other reader".
3. One added sentence says a resolution review now reviews only the repair commits for regressions and new defects, from the entry: "add one sentence saying a resolution review now reviews only the repair commits for regressions and new defects".
4. That sentence says the review does not confirm each finding was resolved as its entry proposed, from the entry: "without confirming each finding was resolved as its entry proposed".
5. That sentence says an unresolved finding is next caught by the Step 8 full review, from the entry: "so an unresolved finding is next caught by the Step 8 full review".
6. The new sentence is anchored to Step 6 item 4 of `ai/tasks/feature/build-a-complex-feature.md`, from the entry: "Anchor the new sentence to Step 6 item 4 of `ai/tasks/feature/build-a-complex-feature.md`".
7. The new sentence is anchored to the "In `commit` and `range` scopes, skip the promise passes" paragraph of `ai/tasks/feature/review-pull-request.md`, from the entry: "and to the \"In `commit` and `range` scopes, skip the promise passes\" paragraph of `ai/tasks/feature/review-pull-request.md`".
8. Each line number is re-derived with `grep -n` at the branch head, from the entry: "re-deriving each line number with `grep -n` at the branch head".
9. The new sentence is anchored to the "A resolution review always follows" sentence of `product/specs/pull-request-review.md`, from the entry: "and to the \"A resolution review always follows\" sentence of `product/specs/pull-request-review.md`".
10. No other paragraph and not the title changes, from the entry: "Change no other paragraph or the title".
11. The edited text cites no change-set statistics or commit SHAs, from the entry: "cite no change-set statistics or commit SHAs".
12. A diff of the old and new bodies shows only those edits, from the entry: "diff the old and new bodies to confirm only those edits landed".
13. No playbook, spec, script, or test is edited, from the entry: "Edit no playbook, spec, script, or test".

## Design decisions

- The sentence "The old Step 6.4 shortcut would never fire, so it's gone, along with the entry recording that only existed to feed it." ends at "so it's gone." and a new sentence states that Step 6 item 2 no longer records each entry's full text or classifies it, with the reason, so the shortcut's removal and the record's removal read as two facts with two causes (assumptions 1 to 3).
- The resolution-review sentence follows that one and precedes "Step 6 keeps recording the PR head SHA", so the paragraph explains what the record fed before saying what Step 6 still records (assumption 4).
- The new sentence's anchors follow the paragraph's existing convention: a bare "line N" means `ai/tasks/feature/build-a-complex-feature.md`, and other files are cited as `path:line` (assumption 5).
- The new sentence says an unresolved finding is "left for the Step 8 full review to catch", because Step 8's aggregate review reads every fix plan as a promise and reviews the whole diff (assumption 6).
- The added prose uses no em dashes, per `ai/guidelines/human-writing-guidelines.md`.

## Preserved behavior

None found

## Assumptions

1. Master's Step 6 item 2 recorded every entry's full text and classified each one: `git show master:ai/tasks/feature/build-a-complex-feature.md` line 84 "record the full text of every entry and the PR head SHA before any repair starts. Each repair removes its own entry from the file, so this record is the only place the resolution review can find what was promised. Classify each recorded entry as description-only or not".
2. Master's item 4 (the shortcut) read the classification and master's item 5 (the resolution review) read the recorded entries as promises: master lines 86 "If every recorded entry was description-only" and 87 "the promises are the recorded entries and the fix plans the repairs added in that range. For each entry, confirm the repair resolved it as its proposal describes".
3. The branch's Step 6 item 2 records only the PR head SHA: `ai/tasks/feature/build-a-complex-feature.md:84` "Otherwise record the PR head SHA before any repair starts. It is the base of the resolution review's range."
4. The branch's Step 6 item 4 passes the resolution review a range scope and no entries: `ai/tasks/feature/build-a-complex-feature.md:86` "delegate `ai/tasks/feature/review-pull-request.md` to a fresh subagent as a resolution review, with the PR number and `scope: range <recorded head SHA>..<current PR head SHA>`".
5. Range scope checks no promises: `ai/tasks/feature/review-pull-request.md:124` "**In `commit` and `range` scopes, skip the promise passes.** There is no promise list".
6. The spec states the trade: `product/specs/pull-request-review.md:33` "A resolution review always follows. It uses the range scope and reviews only the repair commits for regressions and new defects, without checking each finding against its entry".
7. Step 8's full review runs in aggregate scope: `ai/tasks/feature/build-a-complex-feature.md:104` "with only the recorded PR number, so it runs in its default `aggregate` scope".
8. Every existing anchor in the body points into a file, not into the description, so editing the description moves none of them, and this fix edits no file they point into.

## Existing functionality

1. `gh pr edit --body-file` replaces the body from a file, as Step 8 item 5 prescribes: `ai/tasks/feature/work-pull-request-issue.md:151` "gh pr edit <reference> --body-file ./temp/pr-body.md".

## Implementation steps

1. Write this fix plan and remove the resolved entry from `product/backlog/pull-request.md`, leaving the other entries byte-for-byte unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Commit and push to `tasks/review-pull-request-scope`.
3. After the push, read the body with `gh pr view 2207 --json body` and save a copy. In "The callers change to match." paragraph, change "The old Step 6.4 shortcut would never fire, so it's gone, along with the entry recording that only existed to feed it." to end at "so it's gone.", then add a sentence saying Step 6 item 2 no longer records each entry's full text or classifies it, because the resolution review no longer reads the entries and the old Step 6.4 was the only other reader. Add a sentence after it saying a resolution review now reviews only the repair commits for regressions and new defects, without confirming each finding was resolved as its entry proposed, so an unresolved finding is left for the Step 8 full review to catch, anchored as (line 86; `ai/tasks/feature/review-pull-request.md:124`; `product/specs/pull-request-review.md:33`).
4. Write the full revised body to `./temp/pr-body.md`, apply it with `gh pr edit 2207 --body-file ./temp/pr-body.md`, then diff the saved and live bodies.

## UI design

None. The change is to a pull request description on GitHub.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. No test covers the pull request description, and tests of documentation are not introduced.

## Out of scope

- Every playbook, spec, script, and test file. The entry corrects only the description, and `product/specs/pull-request-review.md` already states the trade.
- The title and every other paragraph of the description, including its existing anchors.
- The review task's opening paragraph and Step 3 heading, and the scope test's header comment. The other backlog entries cover them.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then run `gh pr view 2207 --json body` and diff it against the saved body: the only changed line should be "The callers change to match." paragraph, where "along with the entry recording that only existed to feed it" is gone and the two new sentences sit before "Step 6 keeps recording the PR head SHA". A change in any other line means the correction overreached. Read each new anchor at the branch head: line 86 of `ai/tasks/feature/build-a-complex-feature.md` should be Step 6 item 4, line 124 of `ai/tasks/feature/review-pull-request.md` should open "**In `commit` and `range` scopes, skip the promise passes.**", and line 33 of `product/specs/pull-request-review.md` should hold "A resolution review always follows". A different line at any of those anchors shows the description cites the wrong text.
