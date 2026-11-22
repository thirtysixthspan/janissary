# Correct the "How to verify" change-scope claim

**Complexity: 1/10** — a pull-request-description correction: 3 requirements, but 0 production lines, 0 production files, 0 test scenarios and 0 new units (p=2.56); the only risk is preserving every untouched paragraph verbatim.

## Goal

Make step 9 of "How to verify" in pull request #2183's description an accurate scope statement that a reader can still check against the branch's changed-file list. The step currently claims the branch changes only five `ai/` documents and the promoted plan's move, but the branch also adds three fix plans under `product/plans/complete/`, so the description denies files that are plainly in the diff. The "What" paragraph's change description is clarified so it reads as the rule change rather than an exhaustive file list.

## Requirements

1. In the "How to verify" section, step 9 ("No spec or application file changed"), remove the false "The only changes are the five `ai/` documents and the promoted plan's move" clause from the Expect line and keep the true rest, that no source, test, config, or `product/specs/` file is modified, so the step stays checkable against `git diff origin/master...HEAD --name-status`. (Backlog entry's `*` summary bullet and `Proposal` paragraph.)
2. Reword the "What" paragraph's statement that the change touches the plan template and the four stages that consume plans so those read as the rule changes and the paragraph states that the branch also carries the fix plans added by the backlog repairs, preserving the no-application, no-test, no-config, no-spec guarantee. (Backlog entry's `Proposal` paragraph, conditional clause.)
3. Leave the title and every paragraph other than the two named above word-for-word as the author wrote them, add no change-set statistics, and do not edit any repository file to make the description match. (Backlog entry's `Proposal` paragraph and `Forbidden` rule 9, `./ai/tasks/feature/work-pull-request-issue.md:37`.)

## Design decisions

- The change is to the pull request's body only. No rule, document, source file, spec, or application behavior that the pull request edits is changed, so no test is added and no spec is updated.
- The false file-count clause is removed rather than updated to a larger number. Step 8.5 directs that change-set statistics stay out of corrected paragraphs because a copy goes stale with the next push, and that a correction concerning such a figure removes the claim instead of refreshing it (`./ai/tasks/feature/work-pull-request-issue.md:148`). The true, durable guarantee — no source, test, config, or `product/specs/` file — is what remains.
- The "What" paragraph is reworded minimally. Its five-file statement is the rule change, not the whole branch, so the repair names the rule files as rule files and adds that the branch also carries the fix plans from the backlog repairs, without stating a count.
- The body is a live GitHub artifact, so it is written to the scratch file and applied with `gh pr edit --body-file` only after the commit is pushed, per the work task's Step 8.5 (`./ai/tasks/feature/work-pull-request-issue.md:148`); `gh pr edit` replaces the body wholesale, so every untouched paragraph must be carried into the file verbatim.

## Preserved behavior

None found. This correction changes no application behavior and no rule that a future plan relies on, so there is nothing to pin.

## Assumptions

1. The branch's changed-file list contains the five `ai/` documents, the promoted plan's move, and three added plans under `product/plans/complete/`, but no source, test, config, or `product/specs/` file — verified during planning with `git diff origin/master...HEAD --name-status`.
2. The false part of step 9 is only the "only changes are" clause; its remaining guarantee is true and worth keeping (`product/backlog/pull-request.md:13`).
3. Only paragraphs the resolved work item names may be corrected, and everything else must be preserved exactly (`./ai/tasks/feature/work-pull-request-issue.md:37`).
4. `gh pr edit --body-file ./temp/pr-body.md` replaces the body wholesale, so the full revised body must be written to the scratch file (`./ai/tasks/feature/work-pull-request-issue.md:148`).

## Existing functionality

1. The step-9 check already names `git diff origin/master...HEAD --name-status` as the reader's verification command, so the corrected Expect line keeps an existing, concrete check rather than introducing a new one.
2. The plan template's rule that a documentation-only plan introduces no tests — `ai/guidelines/plan-template.md:51` ("Tests of documentation should not be introduced").
3. The work task's post-push description-correction procedure, Step 8.5 — `./ai/tasks/feature/work-pull-request-issue.md:148`.

## Implementation steps

First, re-read the live body with `gh pr view <reference> --json body` and the actual changed-file list with `git diff origin/master...HEAD --name-status`; confirm step 9's current Expect line still carries the false clause and that no source, test, config, or `product/specs/` file is in the diff. Build command: `$janissary/scripts/run.mjs check-diff`.

Second, write the full body to `./temp/pr-body.md`. In step 9's Expect line, delete "The only changes are the five `ai/` documents and the promoted plan's move; " and keep "No source, test, config, or `product/specs/` file is modified." In the "What" paragraph, replace the opening "This is a documentation-only change to the agent workflow files under `ai/`. It touches the plan template (the single owner of plan structure) and the four stages that consume plans; it does not touch..." with "This is a documentation-only change. The rule change touches the plan template (the single owner of plan structure) and the four stages that consume plans under `ai/`; the branch also carries the fix plans added by the backlog repairs. It does not touch...". Copy every other paragraph and the title byte-for-byte. Build command: `$janissary/scripts/run.mjs check-diff`.

Third, after the resolved change is committed and pushed, apply the corrected body with `gh pr edit <reference> --body-file ./temp/pr-body.md`, then re-read the body and confirm the two named paragraphs changed and every other paragraph is unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change is to pull request prose and touches no user-visible surface.

## Tests

This change introduces no code and changes no application behavior, so no tests are added; per the plan template, tests of prose are not introduced (`ai/guidelines/plan-template.md:51`). The verification is a reading-based check of the pull request body against the branch's changed-file list.

## Out of scope

- No source, test, config, spec, help, or documentation file is changed.
- No change to the pull request title, and no change to any paragraph other than step 9's Expect line and the "What" paragraph.
- No change-set statistic, commit count, or commit SHA is added to the description.
- No other entry in `product/backlog/pull-request.md` is edited, and the pull request is not merged or closed.

## Verification

Run `$janissary/scripts/run.mjs check-diff` to confirm no lint, typecheck, or test regression.

Then do a concrete reading-based check. Re-read the body with `gh pr view <reference> --json body` and confirm step 9's Expect line contains only "No source, test, config, or `product/specs/` file is modified." with no "only changes are" claim, that the "What" paragraph names the five `ai/` files as the rule changes and says the branch also carries the fix plans added by the backlog repairs, and that the title and all other paragraphs are word-for-word as the author wrote them. Run `git diff origin/master...HEAD --name-status` and confirm the corrected Expect line agrees with the real changed-file list while no source, test, config, or `product/specs/` file appears. Finally confirm the pull request is still `OPEN` and its `headRefOid` matches local `HEAD`. A lingering "only changes are the five" clause, a changed title, or any other edited paragraph means the correction did not land correctly.
