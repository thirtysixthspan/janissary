# Decline focused-review findings that a later subplan delivers

**Complexity: 3/10** — 11 behavioral requirements, ~6 changed playbook lines in 1 task file, 6 test scenarios (p=4.77)

## Goal

A focused review in commit scope reads no subplan, so it can't tell a real gap from work the decomposition deliberately assigned to a later subplan. Step 6 of `build-a-complex-feature.md` then works every entry it records, and a repair can implement a later subplan's work out of order. That subplan's build then finds its plan no longer matches the code and stops on the scope-mismatch blocker. This fix puts the judgment where the subplan order already lives: the orchestrator compares each recorded entry with the later subplans and declines the ones a later subplan owns, before any repair starts. The review task stays plan-free, as the pull request's own plan settled.

## Requirements

1. After a focused or resolution review in Step 6, the orchestrator compares each recorded entry with the work later subplans own before any repair starts, per the entry "have the orchestrator compare each recorded entry with the later subplans' requirements and out-of-scope lists".
2. The orchestrator removes each entry whose proposal delivers behavior a later subplan owns, per the entry "It removes any entry whose proposal delivers behavior a later subplan owns".
3. Every entry the orchestrator does not decline stays in the backlog unchanged and is worked, per the entry "Item 3 then works the remaining entries".
4. The orchestrator commits and pushes the backlog removal before it records the PR head SHA that starts the resolution review's range, per the entry "commits and pushes that backlog change before recording the PR head SHA in item 2".
5. When declining empties the backlog, the cycle skips to Step 6's finishing item, as it does when the review recorded nothing, per the entry "Prefer folding the step into item 2 so the 'skip to item 6' ... references stay valid".
6. When the final subplan or the single-plan route's sole work unit is under review, no later subplan exists and no entry is declined, following from the entry's "behavior a later subplan owns".
7. The workflow's final report names each declined entry and the subplan that owns it, per the entry "names each removed entry and its owning subplan in its report".
8. The review task reads no plan, takes no plan argument, and builds no promise list in commit and range scopes, per the settled user decisions "Drop plan: entirely", "remove the promises, just review the commits", and "1, same for commit scope".
9. The `scope: commit <implementation commit SHA>` and `scope: range <recorded head SHA>..<current PR head SHA>` argument texts are unchanged, per the entry "Leave the ... argument text unchanged".
10. The "Staged reviews for complex features" spec paragraph says a focused finding that belongs to a later subplan is declined rather than worked, per the entry "Update the 'Staged reviews for complex features' paragraph".
11. `scripts/review-pull-request-scope.test.mjs` pins the new Step 6 wording, per the entry "Add an assertion ... that pins the new wording".

## Design decisions

- The decline lives in `build-a-complex-feature.md` Step 6 item 2, not in the review task. The orchestrator already holds the subplan order and the requirement-to-subplan coverage map (Existing functionality 1 and 2), and the review's commit and range scopes must stay plan-free (Assumption 1).
- The decline is folded into item 2 rather than added as a new item, so item 2's "skip to item 6" and item 5's "repeat items 2 through 4" stay valid (Assumption 3). Because item 5 repeats item 2, a resolution review's findings pass through the same decline.
- The comparison reads three sources: the current subplan's `Out of scope` list, which is where a deferral is written, the `Requirements` of every subplan after it in the recorded order, and the coverage map. The entry named "the later subplans' requirements and out-of-scope lists"; the current subplan's own out-of-scope list is added because a deferral such as keeping an old symbol until the third step of an additive transition is recorded there (Assumption 4).
- A declined entry is removed whole, the way `work-pull-request-issue.md` removes a resolved entry, and the empty-file skeleton is restored when none remain (Existing functionality 3).
- The orchestrator commits only the backlog file and pushes it under Step 5's push rules before recording the PR head SHA, so the resolution review's range holds only repair commits (Assumption 3).
- The orchestration rule and the opening paragraph that say "work every finding" are narrowed to the findings no later subplan owns, so they don't contradict item 2 (Assumption 2 and Assumption 5).
- The Step 10 report gains a `Declined:` line, since no existing line names entries and subplans (Assumption 6).

## Preserved behavior

1. The complex-feature workflow passes scopes rather than override prose. Negative assertion: the `scope: commit <implementation commit SHA>` and `scope: range <recorded head SHA>..<current PR head SHA>` texts must not change and no "Override its Step 2 and Step 3 review scope" prose may return. Test: `scripts/review-pull-request-scope.test.mjs` "is passed by the complex-feature workflow instead of override prose".
2. A focused or resolution review that ran in another scope blocks the workflow. Negative assertion: declining must not run on, or rescue, entries from a review whose `Scope:` line failed its check; that review's entries are still not worked. Test: `scripts/review-pull-request-scope.test.mjs` "blocks a focused or resolution review that did not run in its requested scope".
3. Every review safeguard applies in every scope. Negative assertion: the review task's rules and wording must not change. Test: `scripts/review-pull-request-scope.test.mjs` "keeps the %s rule".
4. Step 6 has no description-only shortcut. Negative assertion: no "If every recorded entry was description-only" text may return. Test: `scripts/review-pull-request-scope.test.mjs` "leaves no description-only shortcut in the focused review cycle".

## Assumptions

1. Commit and range scopes skip plan discovery, at `ai/tasks/feature/review-pull-request.md:84` "read no plan, collect no fix plans, and build no promise list", so the review's "Out of scope" drop rule at `ai/tasks/feature/review-pull-request.md:162` "A gap the plan explicitly deferred to its own \"Out of scope\" section is not a finding" never applies in those scopes.
2. The orchestration rule tells the workflow to work every focused-review item, at `ai/tasks/feature/build-a-complex-feature.md:21` "Work every resulting PR backlog item, one at a time in file order".
3. Step 6 item 2 records the resolution range's base and item 5 repeats it, at `ai/tasks/feature/build-a-complex-feature.md:84` "record the PR head SHA before any repair starts" and `ai/tasks/feature/build-a-complex-feature.md:87` "repeat items 2 through 4".
4. Decomposition can defer removal of an old symbol to a third subplan, at `ai/tasks/planning/decompose-plan.md:55` "add the new field or symbol alongside the old one, migrate consumers in the next subplan, and remove the old one in a third".
5. The task's opening paragraph says to work every focused finding, at `ai/tasks/feature/build-a-complex-feature.md:3` "work every finding that review records".
6. The final report has no line for declined entries, at `ai/tasks/feature/build-a-complex-feature.md:147` "Reviews:    <count> focused subplan reviews".

## Existing functionality

1. The decomposition report hands the orchestrator a requirement-to-subplan map, at `ai/tasks/planning/decompose-plan.md:95` "Coverage:    <requirement → subplan map>".
2. The orchestrator retains the subplan order, at `ai/tasks/feature/build-a-complex-feature.md:9` "The orchestrator retains the overall plan, subplan order".
3. Whole-entry removal with skeleton restore, at `ai/tasks/feature/work-pull-request-issue.md:128` "Remove the resolved entry whole from `./product/backlog/pull-request.md`".
4. Bounded push rules for orchestrator commits, at `ai/tasks/feature/build-a-complex-feature.md:75` "Never amend or force-push. If the remote advanced, use the repository's bounded rebase-and-retry policy".
5. Playbook wording pinned by a script test, at `scripts/review-pull-request-scope.test.mjs:43` "is passed by the complex-feature workflow instead of override prose".

## Implementation steps

The change is one checkpoint and one commit. Its build command is `$janissary/scripts/run.mjs check-diff`.

1. In `ai/tasks/feature/build-a-complex-feature.md` Step 6 item 2, after the empty-backlog skip and before the PR head SHA record, add the decline: why it's needed (the review read no subplan), the three sources compared, whole-entry removal with the skeleton restore, recording each declined summary bullet with its owning subplan, committing only the backlog file and pushing under Step 5's rules, the no-later-subplan case, and a second skip to item 6 when declining empties the backlog. Keep the item on one line so no later line number moves.
2. In the same file, change item 3's "Work every entry" to "Work every remaining entry", narrow the orchestration rule at line 21 and the opening paragraph at line 3 to findings no later subplan owns, and add a `Declined:` line to the Step 10 report after `Reviews:`.
3. In `product/specs/pull-request-review.md`, update the "Staged reviews for complex features" paragraph that starts "Findings from each focused review" to say a finding whose remedy is a later subplan's work is declined rather than worked, that the decline is published before the repairs start, and that the final report names each declined finding and its subplan.
4. In `scripts/review-pull-request-scope.test.mjs`, add a test that pins the decline wording, that it is committed before the PR head SHA is recorded, and the no-later-subplan case, and name the behavior in the header comment.
5. Because the test file's added lines move the line numbers the PR description cites for it, re-derive those anchors from the branch head after the push and correct only them in the description.

## UI design

None. The change is to an agent playbook, a spec, and a script test.

## Tests

`scripts/review-pull-request-scope.test.mjs` gains one test, "declines focused findings that a later subplan delivers before any repair", which asserts that `build-a-complex-feature.md` contains the removal sentence (Requirement 2), the commit-before-record ordering via `indexOf` (Requirement 4), the no-later-subplan sentence (Requirement 6), the "Work every remaining entry" wording (Requirement 3), and the `Declined:` report line (Requirement 7), and that `review-pull-request.md` gains no "later subplan" text (Requirement 8). Requirements 1, 5, 9, and 10 are checked by reading in Verification, plus the unchanged existing assertions (Preserved behavior 1 to 4). No test can exercise the orchestrator's judgment.

## Out of scope

- `ai/tasks/feature/review-pull-request.md` is unchanged: no plan argument, no plan reading, no promise checks in commit or range scope.
- Step 8's aggregate review and Step 9's test cycle are unchanged; the aggregate review still reads the full plan and its out-of-scope list.
- The second backlog entry, reading commit and range scopes at the scope's head commit, is not worked here.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff` and confirm `scripts/review-pull-request-scope.test.mjs` passes with every existing assertion unchanged.
2. Read `ai/tasks/feature/build-a-complex-feature.md` Step 6 end to end against the additive three-step transition rule at `ai/tasks/planning/decompose-plan.md:55`. Imagine subplan 1 adds a new symbol and keeps the old one, and its focused review records "remove the old symbol". Confirm item 2 removes that entry because subplan 3's requirements own the removal, commits and pushes the removal, skips to item 6 if nothing remains, and otherwise records the PR head SHA after the removal commit. Confirm item 5's "repeat items 2 through 4" and item 2's "skip to item 6" still point at the right items, and the Step 10 report has a `Declined:` line. A failure looks like a decline that runs after the SHA is recorded, or any change to `ai/tasks/feature/review-pull-request.md`.
3. Read the "Staged reviews for complex features" paragraph of `product/specs/pull-request-review.md` and confirm it says a finding that belongs to a later subplan is declined rather than worked.
