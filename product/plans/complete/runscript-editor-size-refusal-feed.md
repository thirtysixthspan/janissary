# Report an oversized runscript refusal to the notifications feed
**Complexity: 2/10** — one exported pure helper added beside `openInEditor` in the existing `src/openers/editor.ts` (46 lines, well under the 200-line limit, so no new module), one stat-and-post step in `openRunscript`, one replaced test case, one added test case in each of the two test files, and one spec row.

## Goal

Every runscript action failure reaches the notifications feed, starting with the editor's size refusal. Open (and Enter) and Duplicate of a runscript above the editor's two-megabyte limit currently make the editor write its refusal to the scripts tab's own transcript, which that tab never renders. The feed stays silent and nothing opens. After this change the same refusal line goes to the feed.

## Verified claim

- `src/openers/editor.ts` lines 29 to 31: `openInEditor` compares the stat size with `EDITOR_MAX_BYTES` (2 MiB) and writes `edit: <basename> is <humanSize> — too large to edit in-app (limit <humanSize>).` through `context.note`. For the scripts tab, `note` is the transcript.
- `src/plugins/runscript-topic-actions.ts`, `openRunscript`, calls `managers.openFile.edit` with no size check, so the refusal lands in the transcript and not the feed.
- Duplicate reaches `openRunscript` through `cloneOne`. The copy holds the source's exact text, so an oversized source yields an oversized copy, and the same check covers it.
- Every caller of `openInEditor`: `src/open/file-manager.ts` line 84 (the `edit` path), line 104 (`newFile`), and the opener's `inline` in `src/openers/editor.ts` line 44 (`open`). None of them changes, because only the body of `openInEditor` changes and it keeps the same trigger and the same text.

## Approach

1. In `src/openers/editor.ts`, export `editorSizeRefusal(name: string, bytes: number): string | undefined`. It returns the refusal text when `bytes` is above `EDITOR_MAX_BYTES`, and `undefined` otherwise. It is pure: no file access, no transcript write. `openInEditor` stats the file as it does now, calls the helper for a known size, and writes the returned text through `context.note`. The trigger, the wording, and the `undefined` return are unchanged.
2. In `src/plugins/runscript-topic-actions.ts`, `openRunscript` computes the target with `runscriptFilePath`, stats it with `statSync`, and calls `editorSizeRefusal(path.basename(target), bytes)`. When the helper returns text, `openRunscript` calls `post(managers, origin, text)` and skips `managers.openFile.edit`. When the stat throws, it falls through to the existing edit call, so a missing or unreadable file behaves as it does today.
3. The name in the text is the file's basename, such as `deploy.rs`, which is what `openInEditor` writes for the same file. A Duplicate names the copy, such as `deploy-2.rs`, because the copy is the file the editor would refuse.

## Implementation steps

1. Add `editorSizeRefusal` and make `openInEditor` call it. Run `./scripts/run.mjs check-diff`.
2. Change `openRunscript` as described. Run `./scripts/run.mjs check-diff`.
3. Replace the one named test case and add the helper case, as Tests lists. Run `./scripts/run.mjs check-diff`.
4. Add the spec row, as Spec lists. Markdown alone runs nothing in check-diff, so the code checks above cover the change.
5. Promote this plan and remove the resolved entry from the pull request backlog.

## Tests

- `src/openers/editor.test.ts`: a new case, `editorSizeRefusal returns the refusal text only above the editor size limit`, placed beside `refuses files above the size ceiling`. It asserts that `editorSizeRefusal('big.txt', EDITOR_MAX_BYTES)` is `undefined`, and that `editorSizeRefusal('big.txt', EDITOR_MAX_BYTES + 1)` is `edit: big.txt is 2.0 MB — too large to edit in-app (limit 2.0 MB).`. Without the helper export, the call throws a TypeError, so the case fails before the change.
- `src/plugins/runscript-topic-actions.test.ts`: the case `opens a runscript over the editor size limit without posting to the feed` is replaced in two parts.
  - In the open describe block, `refuses an oversized runscript in the feed instead of opening it`. An Open of a file of `2 * 1024 * 1024 + 1` bytes asserts that `edits` is empty, and that `notify` was called with `(managers, 'plugin-note', 'janus', 'edit: deploy.rs is 2.0 MB — too large to edit in-app (limit 2.0 MB).')`. Without the change, `openFile.edit` records one call and no feed line is posted, so both assertions fail.
  - In the clone describe block, `keeps an oversized duplicate on disk and posts the refusal for the copy`. A Duplicate of the same oversized file asserts that `deploy-2.rs` still exists with the source's text, that `edits` is empty, and that `notify` was called with `(managers, 'plugin-note', 'janus', 'edit: deploy-2.rs is 2.0 MB — too large to edit in-app (limit 2.0 MB).')`. Without the change, the copy is opened through `openFile.edit`, nothing is posted, and the `notify` assertion fails.
- Every other existing assertion in both files passes unchanged.

## Spec

`product/specs/scripts-tab.md`, Failure text table: one row for `edit: <name>.rs is <size> — too large to edit in-app (limit <size>).`, produced by Open and Duplicate. The row's condition is that the file is larger than the editor's two-megabyte limit. No other spec sentence changes.

## Out of scope

- Run, Delete, Create, and the `scripts` command's own failure lines.
- The editor's transcript text and its trigger for `edit`, `open`, `newFile`, and the opener path.
- The other spec sentences, including the Open and Clone sentences that describe a successful open, which still read correctly for files under the limit.
- User documentation. `documentation/user-documentation/command-bar/commands.md` describes the double-click and the buttons and never described the silent refusal, so it needs no change.
- Reading the whole file before the refusal. `readRunscript` already reads the file for Open and Duplicate, which is existing behavior.
