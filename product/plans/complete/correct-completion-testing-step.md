# Correct the completion verification step to use a shell tab

**Complexity: 1/10** — 0 production lines and 0 production files, 2 stated requirements (p=2.35)

## Goal

The pull request's "How to verify" step 6 tells a reviewer to press Tab in the agent command bar, where no application completion is wired, so a reviewer following it sees state-aware completion as broken. Correct only that step's wording to describe the shell-tab flow the feature actually implements, leaving the implementation, tests, specs, help, and every other description paragraph untouched.

## Requirements

1. The description's How to verify step 6 tells the reviewer to open a shell tab instead of typing in the agent command bar ("Correct the pull request's completion testing step so it drives a shell tab instead of the agent command bar").
2. The corrected step states that a single match is filled in directly without a picker, because the shell renders the picker only for more than one candidate ("with at least two active recurring rows it lists only those active names after `pause`, and with at least two paused rows it lists only those paused names after `resume`").

## Design decisions

- The remedy is a description-only correction; no application code, test, spec, or help page changes, because the underlying completion behavior is already implemented and passing its tests.
- The corrected wording is taken verbatim from the backlog entry's Proposal, so the step matches the behavior observed on commit 7fcb90ec.
- Only step 6 of "How to verify" changes; every other description paragraph, including the `### Additional test cases` section, stays byte-for-byte as the author wrote it.

## Preserved behavior

None found

## Assumptions

1. `web/src/plugins/shell/ShellTab.tsx:215` renders `ShellCompletionPicker` only when `matches.length > 1`, so a single match is filled in directly — the basis for the single-match caveat.
2. `web/src/plugins/shell/useShellCompletion.ts` is the only client sending the `complete` intent, and `web/src/shared/command-bar/useCommandBarKeys.ts` has no Tab completion for application commands — the basis for naming a shell tab.
3. `src/completion/system-schedule.ts:21-29` and the three `src/completion/index.test.ts` cases already prove the state-aware verb and name lists, so no code change is needed.

## Existing functionality

1. `src/completion/system-schedule.ts:21-29` already computes the `cancel`, `clear`, `list`, `pause`, `resume` verbs and the state-aware active and paused name lists.
2. `web/src/plugins/shell/useShellCompletion.ts` already requests completion from the shell tab and `web/src/plugins/shell/ShellTab.tsx:215` already renders the picker.

## Implementation steps

1. Read the live PR body with `gh pr view <reference> --json body` and copy it verbatim into `./temp/pr-body.md`. Build command: `$janissary/scripts/run.mjs check-diff` (no application files change).
2. In `./temp/pr-body.md`, replace only the three lines of How to verify step 6 with the corrected text from the Proposal: the title line "6. Complete the verbs and their names in a shell tab.", the `Do:` line that opens a shell tab, and the `Expect:` line naming the completion picker and the single-match caveat. Leave every other paragraph, including the `### Additional test cases` section, exactly as it was. Apply after the commit is pushed with `gh pr edit <reference> --body-file ./temp/pr-body.md`. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Record this plan under `./product/plans/complete/` and remove the resolved entry from `./product/backlog/pull-request.md`, leaving the failed-save entry unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The correction changes only the PR description text, not any user interface.

## Tests

No tests. This plan changes no application behavior and introduces no code; the behavior the step describes is already pinned by `src/completion/index.test.ts`.

## Out of scope

No source, test, spec, or help changes. No other paragraph of the PR description changes, including How to verify step 13 and the `### Additional test cases` section. The PR title stays unchanged, and the PR stays open.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then read `gh pr view <reference> --json body` and confirm How to verify step 6 reads "Complete the verbs and their names in a shell tab. Do: Open a shell tab, type `schedule system ` and press Tab; then type `schedule system pause ` and Tab; then `schedule system resume ` and Tab. Expect: The completion picker lists `cancel`, `clear`, `list`, `pause` and `resume`; with at least two active recurring rows it lists only those active names after `pause`, and with at least two paused rows it lists only those paused names after `resume` (`src/completion/system-schedule.ts:21-29`; pinned by the three `src/completion/index.test.ts` cases named above). A single match is filled in directly without a picker." and that step 13 and the `### Additional test cases` section are byte-for-byte unchanged from before the edit.
