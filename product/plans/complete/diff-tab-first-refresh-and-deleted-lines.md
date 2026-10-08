# fix: the diff tab's first refresh, a deleted file's line, a dropped mode change

**Complexity: 4/10** — four small defects in one plugin's plumbing, each found by reading the diff against its own plan and the host's contract: a wrong intent return value that disables the plugin, a line-number fallback that answers a line that does not exist, a record the parser drops because it cannot name it, and a refusal missing for a path that is not there. No new files beyond tests, and no change to the plugin's contract.

## Goal

Make the diff tab survive its first refresh, open real lines, show a mode-only change, and refuse a `diff` path that is not a directory instead of reporting a non-repository.

## What was wrong, and what changed

- **The refresh intent disabled the plugin.** `src/plugins/diff/activate.ts` answered the intent with the recompute's promise, which resolves to `undefined`. The host validates every intent's result with `isJsonCompatible` in `src/plugins/context.ts` and disables the plugin when it fails, as `src/plugins/requests.ts` does with "produced an invalid intent result". The client sends `refresh` within a second of the tab opening, on every toggle change, and on the Refresh button, so the tab died immediately. The handler now starts the recompute outside the guarded call and answers `null`, which also keeps a slow recompute from spending the intent's 5000 ms budget. `DiffSession.refresh` is unchanged: it already refuses to start a second recompute while one is in flight and drops a result whose root moved on.
- **A pure-deletion hunk answered `jump: -1`.** The fallback in the parser's jump pass used the hunk's last new-side number, and a hunk whose header reads `-1,2 +0,0` has none. A removed line now borrows the next added or context line's number, else the previous one's, and a hunk holding neither answers the line above it clamped to the file's first line.
- **A deleted file's lines opened a file that does not exist.** `web/src/plugins/diff/FileEntry.tsx` answers its hunks' double-clicks with a no-op when the file is deleted, because the numbers those lines carry are the old file's and there is nothing to take the user to.
- **A mode-only change was dropped.** git names it only on its `diff --git` line, and the parser read paths from the `---` and `+++` lines it does not print. The parser now remembers the `diff --git` line's two paths as the fallback name for a record that has none of its own, which is a heuristic on a line git does not quote for spaced paths — so it stays the last resort rather than the primary source, and a pure rename still names itself through `rename to`.
- **A nonexistent path read as a non-repository.** The command's root resolution now refuses a path that is not an existing directory, with `Cannot diff <path>: no such directory.`, before the tab opens, so the not-a-repository state stays specific to repositories.

## Out of scope

- Changing the refresh loop's interval or its in-flight guard.
- Diffing a mode-only change into a rendered hunk: the entry is named and carries no hunks.
- Answering a double-click inside a deleted file by opening the file's parent directory or its history.

## Tests

- `src/plugins/diff/activate.test.ts` — a refresh intent answering exactly `null` (asserting the answer, not just that the recompute ran, because the fake capabilities return the handler's value without the host's JSON check); a path that is not a directory, and one naming a file, both refused before any tab opens; and the not-a-repository payload state still reached for a directory that does exist.
- `src/plugins/diff/parse-diff.test.ts` — a removed line borrowing the next line, borrowing the previous one when the hunk ends in removals, and a hunk of nothing but removals answering the line above it clamped to 1; a mode-only change carrying a record with no hunks.
- `web/src/plugins/diff/DiffTab.test.tsx` — a double-click on a line inside a deleted entry emitting no `open` intent.

## Verification

`$janissary/scripts/run.mjs check-diff` after the change. Manual: open the tab and confirm it survives a refresh rather than dying; delete a tracked file and double-click one of its lines and confirm nothing happens; `chmod +x` a tracked file and confirm it appears as an entry with no hunks; run `diff nosuchdir` and confirm the refusal on the transcript rather than a not-a-repository tab.
