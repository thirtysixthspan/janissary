# Correct PR 1675's description to state the live shell transcript refusals

**Complexity: 2/10** — no source, test, or spec changes; a single pull request description edit. The refusals are already on the branch and pinned by tests; the work is reading what shipped and saying it in the What, How to verify and Files changed sections.

The branch refuses an editor save over a shell transcript that is still being written (`product/plans/complete/refuse-live-shell-transcript-save.md`), and a later fix on the same branch also refuses renaming the transcript's editor tab and moving or renaming it on its own in a file navigator (`product/plans/complete/refuse-live-shell-transcript-rename.md`). The description says nothing of either. Reading the code confirms:

- `src/editor/save.ts` exports `LIVE_SHELL_TRANSCRIPT_SAVE_REASON` (`This shell transcript is still being written; copy it to another file to edit it.`), and `refuseLiveShellTranscriptSave` posts it as a `file-operation` notification and throws, ahead of the stale-save check, so the overwrite prompt's save is refused too.
- `src/shell/transcript/writer.ts` gains `writingPath()` and `src/shell/transcript/manager.ts` gains `isWriting()`, which every refusal asks.
- `src/file-navigator/file-operation-result.ts` adds `LIVE_SHELL_TRANSCRIPT_REASON` (`A running shell is still writing this transcript; rename or move it after the shell exits`). `src/tab/rename-editor.ts` refuses with it through a new `isWriting` predicate, which `src/tab/rename.ts`, `src/tab/operations.ts` and `src/editor/rename.ts` pass in. `liveTranscriptRefusal` in `src/file-navigator/manager/item-operations.ts` answers a failed result that `moveItem` and `renameItem` in `src/file-navigator/manager/mutations.ts` return ahead of the move or rename.
- Tests: `src/editor/save.test.ts`, `src/tab/rename-editor.test.ts`, `src/editor/rename.test.ts`, `src/file-navigator/manager.test.ts`; `src/editor/save-synced-stale.test.ts` and `src/editor/watch-manager.test.ts` only gain a `shellTranscript` stub.

## Goal

The pull request description states both refusals and lists their files, so it is correct as of the branch head. No other paragraph, and no code, test or spec file, changes.

## Approach

Edit only these parts of the body, keeping every other paragraph byte-for-byte:

- **What:** add one paragraph after the "Files live under" paragraph saying that **Open transcript** shows the file in an ordinary editor tab; that while the shell runs a save of that tab, including the overwrite prompt's save, is refused with the save reason and leaves the file untouched, because replacing the file by rename would cut every later row off from it; that renaming the editor tab, or renaming or moving the file on its own in a file navigator, is refused with the rename reason for the same kind of reason; what is not guarded (delete, bulk and folder moves); and that once the shell exits or its tab closes the file saves, renames and moves normally.
- **How to verify:** add one bullet covering the save refusal, the file still growing, the rename and move refusals, and success after the shell tab closes.
- **Files changed:** extend the `writer.ts` and `manager.ts` entries with `writingPath()` and `isWriting()`, and add a "Live-transcript refusals" group listing the source files, the tests and the two stubbed fixtures.

The Plan entry and the "folded into the one plan" sentence stay as they are, for the step that folds the fix plans into `product/plans/complete/shell-tab-text-transcript.md`. The title is not touched.

## Implementation steps

1. Read the current body with `gh pr view` and write the revised full body to `./temp/pr-body.md`.
2. After the branch is pushed, apply it with `gh pr edit <url> --body-file ./temp/pr-body.md`.

## Tests

None — no source or test files change. The wording can be checked against the `saveFile live shell transcript guard` cases in `src/editor/save.test.ts` and the live-transcript cases in `src/tab/rename-editor.test.ts`, `src/editor/rename.test.ts` and `src/file-navigator/manager.test.ts`.

## Out of scope

- The Behavior examples section, which the entry's proposal leaves unchanged.
- The Plan entry and the plan-folding sentence.
- The remaining backlog entry about the plugin spec and the wire-contract comment.
- The pull request title.
