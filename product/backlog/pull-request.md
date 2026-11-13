<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Harden the edit helper's read so a target swapped for a named pipe or grown past the size limit after classification is refused rather than opened or read whole.

Existing Issue: The edit helper's private reader re-stats the resolved real path only for its size and then reads it with an unbounded readFileSync, so a regular file replaced by a named pipe between the target resolver's classification and the read is opened and blocks the synchronous call indefinitely, and a file grown past 5 MiB after the stat is read into memory in full. Severity: 3/10

Existing Risk: 3/10 - A process sharing the workspace that races the edit can hang the host's event loop on a FIFO open, which the plan's never-open-a-pipe rule is meant to exclude, though the window is narrow and needs a hostile local writer.

Proposal Risk: 1/10 - A swap after the in-read check still lands between that check and the open, but a pipe or oversized file caught by the check is refused with its policy word instead of hanging or over-reading, and a failing test on the new branch would reveal a mistake.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "refuse a non-regular or oversized target at read time in the edit file helper". In `src/file-write/edit.ts` `readEditableFile`, keep the `statSync(realPath)` result, return `failureResult<EditableFile>('Not a text file')` when `!stats.isFile()`, keep the existing size refusal, and after `readFileSync` also refuse `File too large (>5 MB)` when `bytes.byteLength > FILE_POLICY_MAX_BYTES` so a file that grew between stat and read is not edited; the plan's check order otherwise stays the same (size before decode). Do not open the file with any non-stat call before the `isFile` check. The race itself is not deterministically testable, so do not export the reader only for tests; rely on the existing `refuses a named pipe without opening it`, `refuses an existing file over 5 MiB`, and replacement tests in `src/file-write/edit.test.ts`, which must keep passing unchanged, and run `$janissary/scripts/run.mjs check-diff`.
