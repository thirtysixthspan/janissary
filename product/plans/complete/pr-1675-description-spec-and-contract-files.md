# Correct PR 1675's Files changed list for the spec and contract edits

**Complexity: 1/10** — no source, test, or spec changes; a single pull request description edit to the Files changed section.

Commit `5bd00b0b` (`docs(shell): say the shell tab has a transcript button in the plugin spec and RPC contract`) edited three files the description does not account for. Reading the branch diff against master confirms:

- `product/specs/tab-plugins.md`: the shell plugin's chrome paragraph no longer says it omits the transcript control and now says the metadata row draws **Open transcript** once the host supplies the tab's transcript path; the recorded-terminal paragraph says a recorded terminal also gets a plain-text transcript under the same gate as the recording.
- `product/specs/tabs.md`: the metadata-row paragraph says shell tabs show the clipboard button once their text transcript file has opened, and that it opens the file in an editor tab.
- `src/protocol/core-rpc.ts`: the comment above `openTranscriptFileFor` now describes resolving a harness tab's tailer file first, then a shell tab's transcript from its tab record, and names both tabs' buttons. The description lists this file only for the method rename.

Checking every path in `git diff origin/master...HEAD --name-status` against the Files changed section also finds the review follow-up plans in `product/plans/complete/` unlisted: `refuse-live-shell-transcript-save.md`, `refuse-live-shell-transcript-rename.md`, `shell-transcript-prompt-trailing-space.md`, `shell-transcript-button-contract-statements.md`, `pr-1675-description-live-transcript-refusals.md`, and this plan. `product/plans/ready/shell-tab-text-transcript.md` is covered by the existing Plan entry's "moved from" wording, and `product/backlog/pull-request.md` matches master once this entry is removed.

## Goal

The Files changed section lists every file the branch changes, so it is correct as of the branch head. No other paragraph, and no code, test or spec file, changes.

## Approach

Edit only these parts of the body, keeping every other paragraph byte-for-byte:

- **Specs, help and docs:** add one entry for `product/specs/tab-plugins.md` and one for `product/specs/tabs.md`, stating the changes above.
- **Pushed path and RPC:** extend the existing `src/protocol/core-rpc.ts` entry so it also says the method's comment now covers shell tabs.
- **Plan:** add one entry after the existing feature-plan entry listing the follow-up plans. The existing entry and the "folded into the one plan" sentence stay as they are, for the step that folds the fix plans into `product/plans/complete/shell-tab-text-transcript.md`.

The title is not touched.

## Implementation steps

1. Read the current body with `gh pr view` and write the revised full body to `./temp/pr-body.md`.
2. After the branch is pushed, apply it with `gh pr edit <url> --body-file ./temp/pr-body.md`.
3. Compare `gh pr diff 1675 --name-only` against the edited Files changed section.

## Tests

None — no source or test files change. The wording is checked against the branch diff of the two specs and the protocol comment.

## Out of scope

- The What, Behavior examples and How to verify sections.
- The existing Plan entry and the plan-folding sentence.
- The pull request title.
